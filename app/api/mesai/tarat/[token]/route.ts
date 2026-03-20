import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

/**
 * GET /api/mesai/tarat/[token]
 * Token bilgilerini döner (tarama sayfası için ilk yükleme)
 *
 * POST /api/mesai/tarat/[token]
 * Giriş / çıkış mesai kaydı oluşturur veya günceller.
 * Kullanıcı oturum açmış olmalıdır.
 */

async function tokenBul(admin: any, token: string) {
  // QR token ile ara
  const { data: byToken } = await admin
    .from('mesai_qr_kodlari')
    .select('id,firma_id,proje_id,tip,aktif')
    .eq('token', token)
    .maybeSingle()
  if (byToken) return byToken

  // NFC token ile ara
  const { data: byNfc } = await admin
    .from('mesai_qr_kodlari')
    .select('id,firma_id,proje_id,tip,aktif')
    .eq('nfc_token', token)
    .maybeSingle()
  return byNfc ?? null
}

export async function GET(_: NextRequest, { params }: { params: { token: string } }) {
  const admin = createAdminClient()
  const qr = await tokenBul(admin, params.token)

  if (!qr)        return NextResponse.json({ ok: false, error: 'Geçersiz token' }, { status: 404 })
  if (!qr.aktif)  return NextResponse.json({ ok: false, error: 'Bu QR kodu artık aktif değil' }, { status: 403 })

  // Firma adını çek
  const { data: firma } = await admin
    .from('firmalar')
    .select('firma_adi,ticari_unvan,aktif')
    .eq('id', qr.firma_id)
    .single()

  if (!firma?.aktif) return NextResponse.json({ ok: false, error: 'Firma aktif değil' }, { status: 403 })

  // Proje adı
  let projeAdi: string | null = null
  if (qr.proje_id) {
    const { data: proje } = await admin.from('projeler').select('ad').eq('id', qr.proje_id).single()
    projeAdi = proje?.ad ?? null
  }

  return NextResponse.json({
    ok: true,
    tip:       qr.tip,                                        // GIRIS | CIKIS
    firma_adi: firma.firma_adi || firma.ticari_unvan,
    proje_adi: projeAdi,
  })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const supabase = createClient()
  const admin    = createAdminClient()

  // Oturum kontrolü
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Giriş yapmalısınız', requireAuth: true }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,firma_id,isim_soyisim').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const qr = await tokenBul(admin, params.token)
  if (!qr || !qr.aktif) return NextResponse.json({ ok: false, error: 'Geçersiz token' }, { status: 404 })

  // Kullanıcı firmasının tokenını tarıyor mu?
  if (me.firma_id !== qr.firma_id)
    return NextResponse.json({ ok: false, error: 'Bu QR kodu firmanıza ait değil' }, { status: 403 })

  // TRT bugün
  const trtNow = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const bugun  = trtNow.toISOString().split('T')[0]

  // Bugünkü açık kayıt var mı?
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
      return NextResponse.json({ ok: false, error: 'Bugün için zaten iş başı yapıldı', durum: 'zaten_acik' }, { status: 400 })
    }
    // Yeni giriş kaydı
    const { error } = await admin.from('personel_mesai_kayitlari').insert({
      user_id:    me.id,
      firma_id:   me.firma_id,
      proje_id:   qr.proje_id,
      kayit_tarihi: bugun,
      giris_saati:  new Date().toISOString(),
      giris_tipi:   'QR',
    })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, sonuc: 'giris', isim: me.isim_soyisim })
  }

  if (qr.tip === 'CIKIS') {
    if (!mevcut || mevcut.cikis_saati) {
      return NextResponse.json({ ok: false, error: 'Açık iş başı kaydı bulunamadı', durum: 'kayit_yok' }, { status: 400 })
    }
    const { error } = await admin
      .from('personel_mesai_kayitlari')
      .update({ cikis_saati: new Date().toISOString(), cikis_tipi: 'QR' })
      .eq('id', mevcut.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, sonuc: 'cikis', isim: me.isim_soyisim })
  }

  return NextResponse.json({ ok: false, error: 'Bilinmeyen tip' }, { status: 400 })
}
