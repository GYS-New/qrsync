import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * GET /api/mesai/tarat/[token]
 * Token bilgilerini döner.
 * Mobil: X-Device-Token header ile, Web: oturum cookie ile.
 *
 * POST /api/mesai/tarat/[token]
 * Giriş / çıkış mesai kaydı oluşturur.
 * Kimlik doğrulama: X-Device-Token (mobil) VEYA oturum cookie (web).
 * İkisi de yoksa → 403 "Bu işlem için yetkiniz yok"
 */

async function tokenBul(admin: any, token: string) {
  const { data: byToken } = await admin
    .from('mesai_qr_kodlari')
    .select('id,firma_id,proje_id,tip,aktif')
    .eq('token', token)
    .maybeSingle()
  if (byToken) return byToken

  const { data: byNfc } = await admin
    .from('mesai_qr_kodlari')
    .select('id,firma_id,proje_id,tip,aktif')
    .eq('nfc_token', token)
    .maybeSingle()
  return byNfc ?? null
}

/**
 * Kullanıcıyı kimlik doğrula.
 * Önce X-Device-Token (mobil), yoksa oturum cookie (web).
 * Dönüş: { id, firma_id, isim_soyisim } veya null
 */
async function kullaniciBul(req: NextRequest): Promise<{ id: string; firma_id: string; isim_soyisim: string } | null> {
  const admin = createAdminClient()

  // Mobil: cihaz token'ı
  const deviceToken = req.headers.get('X-Device-Token')
  if (deviceToken) {
    const { data } = await admin
      .from('device_tokens')
      .select('user_id, firma_id, isim_soyisim')
      .eq('device_token', deviceToken)
      .single()
    if (data) return { id: data.user_id, firma_id: data.firma_id, isim_soyisim: data.isim_soyisim }
    return null
  }

  // Web: oturum cookie
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: me } = await supabase
    .from('users')
    .select('id,firma_id,isim_soyisim')
    .eq('id', user.id)
    .single()
  return me ? { id: me.id, firma_id: me.firma_id, isim_soyisim: me.isim_soyisim } : null
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const admin = createAdminClient()
  const qr    = await tokenBul(admin, params.token)

  if (!qr)       return NextResponse.json({ ok: false, error: 'Geçersiz mesai kodu' }, { status: 404 })
  if (!qr.aktif) return NextResponse.json({ ok: false, error: 'Bu mesai kodu artık aktif değil' }, { status: 403 })

  const { data: firma } = await admin
    .from('firmalar')
    .select('firma_adi,ticari_unvan,aktif')
    .eq('id', qr.firma_id)
    .single()

  if (!firma?.aktif) return NextResponse.json({ ok: false, error: 'Firma aktif değil' }, { status: 403 })

  let projeAdi: string | null = null
  if (qr.proje_id) {
    const { data: proje } = await admin.from('projeler').select('ad').eq('id', qr.proje_id).single()
    projeAdi = proje?.ad ?? null
  }

  return NextResponse.json({
    ok:        true,
    tip:       qr.tip,
    firma_adi: firma.firma_adi || firma.ticari_unvan,
    proje_adi: projeAdi,
  })
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const admin = createAdminClient()

  // Kimlik doğrula
  const me = await kullaniciBul(req)
  if (!me) {
    return NextResponse.json(
      { ok: false, error: 'Bu işlem için yetkiniz yok. Lütfen mobil uygulama üzerinden giriş yapın.', requireAuth: true },
      { status: 403 }
    )
  }

  const qr = await tokenBul(admin, params.token)
  if (!qr || !qr.aktif) {
    return NextResponse.json({ ok: false, error: 'Geçersiz mesai kodu' }, { status: 404 })
  }

  // Firma eşleşmesi
  if (me.firma_id !== qr.firma_id) {
    return NextResponse.json(
      { ok: false, error: 'Bu mesai kodu firmanıza ait değil' },
      { status: 403 }
    )
  }

  // Firma personel takibi aktif mi?
  const { data: firma } = await admin
    .from('firmalar')
    .select('personel_takibi_aktif')
    .eq('id', qr.firma_id)
    .single()

  if (!firma?.personel_takibi_aktif) {
    return NextResponse.json(
      { ok: false, error: 'Bu firma için personel takibi aktif değil' },
      { status: 403 }
    )
  }

  // Proje personel takibi aktif mi?
  if (qr.proje_id) {
    const { data: proje } = await admin
      .from('projeler')
      .select('personel_takibi_aktif')
      .eq('id', qr.proje_id)
      .single()

    if (!proje?.personel_takibi_aktif) {
      return NextResponse.json(
        { ok: false, error: 'Bu proje için personel takibi aktif değil' },
        { status: 403 }
      )
    }
  }

  const trtNow = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const bugun  = trtNow.toISOString().split('T')[0]
  const simdi  = new Date().toISOString()

  // Kanal: mobil mi web mi?
  const kanal = req.headers.get('X-Device-Token') ? 'MOBIL' : 'WEB'

  let mevQ = admin
    .from('personel_mesai_kayitlari')
    .select('id,giris_saati,cikis_saati')
    .eq('user_id', me.id)
    .eq('kayit_tarihi', bugun)
    .eq('arsivlendi', false)

  if (qr.proje_id) mevQ = (mevQ as any).eq('proje_id', qr.proje_id)

  const { data: mevcut } = await mevQ.maybeSingle()

  if (qr.tip === 'GIRIS') {
    if (mevcut && !mevcut.cikis_saati) {
      return NextResponse.json(
        { ok: false, error: 'Bugün için zaten iş başı yapıldı', durum: 'zaten_acik' },
        { status: 409 }
      )
    }
    const { error } = await admin.from('personel_mesai_kayitlari').insert({
      user_id:      me.id,
      firma_id:     me.firma_id,
      proje_id:     qr.proje_id ?? null,
      kayit_tarihi: bugun,
      giris_saati:  simdi,
      giris_tipi:   kanal,
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, sonuc: 'giris', isim: me.isim_soyisim })
  }

  if (qr.tip === 'CIKIS') {
    if (!mevcut || mevcut.cikis_saati) {
      return NextResponse.json(
        { ok: false, error: 'Açık iş başı kaydı bulunamadı', durum: 'kayit_yok' },
        { status: 409 }
      )
    }
    const { error } = await admin
      .from('personel_mesai_kayitlari')
      .update({ cikis_saati: simdi, cikis_tipi: kanal })
      .eq('id', mevcut.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, sonuc: 'cikis', isim: me.isim_soyisim })
  }

  return NextResponse.json({ ok: false, error: 'Bilinmeyen tip' }, { status: 400 })
}
