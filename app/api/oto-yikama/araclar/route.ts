/**
 * GET    /api/oto-yikama/araclar — liste (firma + opsiyonel proje filtreli)
 * POST   /api/oto-yikama/araclar — yeni araç ekle
 *
 * SA-only. Diğer roller 403.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'

export const dynamic = 'force-dynamic'

// Tüm yetkili roller (Oto Yıkama erişimi sayfa seviyesinde kontrol edilir).
// mode parametresi şu an semantik amaçlı — kullanılmıyor.
async function yetki(supabase: any, _mode: 'read' | 'write' = 'read') {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { err: NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 }) }
  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me) return { err: NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 401 }) }
  return { me }
}

async function assertOtoYikamaAktif(admin: any, firmaId: string) {
  const aktif = await getFirmaModulDurumu(admin, firmaId, 'oto_yikama_aktif')
  if (!aktif) {
    return NextResponse.json(
      { ok: false, error: 'Bu firma için Oto Yıkama modülü aktif değil. Firma detay sayfasından açın.' },
      { status: 403 },
    )
  }
  return null
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const auth = await yetki(supabase, 'read'); if ('err' in auth) return auth.err
  const admin = createAdminClient()
  const sp = req.nextUrl.searchParams
  const firmaId = sp.get('firma_id')
  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  // SA dışı roller kendi firmasına bağlı
  const isSA = ['super_admin', 'alt_super_admin'].includes(auth.me.rol)
  if (!isSA && firmaId !== auth.me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erişim yok' }, { status: 403 })
  }
  const modulErr = await assertOtoYikamaAktif(admin, firmaId); if (modulErr) return modulErr
  const projeId = sp.get('proje_id')
  const aktif = sp.get('aktif')

  let q = admin.from('araclar').select('*').eq('firma_id', firmaId).order('plaka')
  if (projeId) q = q.eq('proje_id', projeId)
  if (aktif === 'true') q = q.eq('aktif', true)
  if (aktif === 'false') q = q.eq('aktif', false)

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const auth = await yetki(supabase, 'write'); if ('err' in auth) return auth.err
  const admin = createAdminClient()
  const body = await req.json().catch(() => ({}))

  const plaka = String(body.plaka ?? '').trim().toUpperCase()
  const kullaniciAd = String(body.kullanici_adi_soyadi ?? '').trim()
  const departman = String(body.departman ?? '').trim()
  if (!plaka) return NextResponse.json({ ok: false, error: 'Plaka gerekli' }, { status: 400 })
  if (!kullaniciAd) return NextResponse.json({ ok: false, error: 'Kullanıcı adı soyadı gerekli' }, { status: 400 })
  if (!departman) return NextResponse.json({ ok: false, error: 'Departman gerekli' }, { status: 400 })
  if (!body.firma_id) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  const isSA = ['super_admin', 'alt_super_admin'].includes(auth.me.rol)
  if (!isSA && body.firma_id !== auth.me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erişim yok' }, { status: 403 })
  }
  const modulErr = await assertOtoYikamaAktif(admin, body.firma_id); if (modulErr) return modulErr

  const FREKANS_VALID = new Set(['HAFTALIK', 'BIHAFTA', 'AYLIK'])
  // null = plansız (cron otomatik görev üretmez); geçerli enum dışı bir
  // string gelirse 'HAFTALIK' default. Açıkça null gönderildiyse null kalsın.
  const frekansTip = body.yikama_frekans_tip === null
    ? null
    : FREKANS_VALID.has(body.yikama_frekans_tip) ? body.yikama_frekans_tip : 'HAFTALIK'

  const payload = {
    firma_id: body.firma_id,
    proje_id: body.proje_id ?? null,
    plaka,
    departman,
    periyot_gun: body.periyot_gun ?? 7,
    yikama_gunleri: Array.isArray(body.yikama_gunleri)
      ? [...new Set(body.yikama_gunleri.filter((g: any) => Number.isInteger(g) && g >= 1 && g <= 7))]
      : [],
    varsayilan_lokasyon_id: typeof body.varsayilan_lokasyon_id === 'string' && body.varsayilan_lokasyon_id
      ? body.varsayilan_lokasyon_id : null,
    yikama_frekans_tip: frekansTip,
    yikama_frekans_aralik: Number.isInteger(body.yikama_frekans_aralik) && body.yikama_frekans_aralik >= 1
      ? body.yikama_frekans_aralik : 1,
    yikama_referans_tarih: typeof body.yikama_referans_tarih === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.yikama_referans_tarih)
      ? body.yikama_referans_tarih : null,
    kullanici_adi_soyadi: kullaniciAd,
    kullanici_telefon: body.kullanici_telefon?.toString().trim() || null,
    kullanici_email: body.kullanici_email?.toString().trim() || null,
    notlar: body.notlar ?? null,
    aktif: body.aktif !== false,
    olusturan_id: auth.me!.id,
  }
  const { data, error } = await admin.from('araclar').insert(payload).select().single()
  if (error) {
    const msg = error.message.includes('duplicate') ? `${plaka} plakası zaten kayıtlı` : error.message
    return NextResponse.json({ ok: false, error: msg }, { status: 400 })
  }
  return NextResponse.json({ ok: true, data })
}
