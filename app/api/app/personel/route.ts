import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const firmaToken = searchParams.get('firma')
    const firmaIdParam = searchParams.get('firma_id')
    const projeId    = searchParams.get('proje') ?? null

    if (!firmaToken && !firmaIdParam) {
      return NextResponse.json({ ok: false, error: 'firma veya firma_id parametresi gerekli' }, { status: 400, headers: CORS_HEADERS })
    }

    const admin = createAdminClient()

    // İki yoldan firma_id çözümle:
    // 1) firma_id direkt gelmişse (yeni mobil: firma kodu çözümü sonrası)
    // 2) firmaToken gelmişse (eski mobil: APK içi gömülü link_token)
    let firmaId: string = ''
    let mod = 'QR'
    if (firmaIdParam) {
      const { data: firma, error: firmaErr } = await admin
        .from('firmalar')
        .select('id, aktif')
        .eq('id', firmaIdParam)
        .single()
      if (firmaErr || !firma) {
        return NextResponse.json({ ok: false, error: 'Firma bulunamadı' }, { status: 404, headers: CORS_HEADERS })
      }
      if (!firma.aktif) {
        return NextResponse.json({ ok: false, error: 'Firma aktif değil' }, { status: 403, headers: CORS_HEADERS })
      }
      firmaId = firma.id
      const { data: linkRow } = await admin
        .from('app_download_links')
        .select('mod, aktif')
        .eq('firma_id', firmaId)
        .eq('aktif', true)
        .limit(1)
        .maybeSingle()
      mod = linkRow?.mod || 'QR'
    } else {
      const { data: linkData, error: linkErr } = await admin
        .from('app_download_links')
        .select('firma_id, aktif, mod')
        .eq('link_token', firmaToken!)
        .single()
      if (linkErr || !linkData) {
        return NextResponse.json({ ok: false, error: 'Geçersiz firma linki' }, { status: 404, headers: CORS_HEADERS })
      }
      if (!linkData.aktif) {
        return NextResponse.json({ ok: false, error: 'Bu link artık aktif değil' }, { status: 403, headers: CORS_HEADERS })
      }
      firmaId = firmaId
      mod = linkData.mod || 'QR'
    }

    // Firma adını getir
    const { data: firma } = await admin
      .from('firmalar')
      .select('firma_adi, ticari_unvan')
      .eq('id', firmaId)
      .single()

    const firmaAdi = firma?.firma_adi || firma?.ticari_unvan || ''

    // Firmaya ait projeleri getir
    const { data: projeler } = await admin
      .from('projeler')
      .select('id, ad')
      .eq('firma_id', firmaId)
      .eq('aktif', true)
      .order('ad', { ascending: true })

    // Zaten kayıtlı cihazı olan kullanıcıları bul
    const { data: kayitliCihazlar } = await admin
      .from('device_tokens')
      .select('user_id')
      .eq('firma_id', firmaId)
      .eq('aktif', true)

    const kayitliUserIdler = (kayitliCihazlar ?? []).map((d: any) => d.user_id)

    // Personel listesi - proje seçildiyse o projenin personelleri
    // Mobil eşleşme akışına dahil roller: tenant_user (personel),
    // tenant_admin (firma yönetici), musteri (QR/değerlendirme kullanıcısı).
    let personelQuery = admin
      .from('users')
      .select('id, isim_soyisim, rol')
      .eq('firma_id', firmaId)
      .eq('aktif', true)
      .in('rol', ['tenant_user', 'tenant_admin', 'musteri'])
      .order('isim_soyisim', { ascending: true })

    if (projeId) {
      personelQuery = (personelQuery as any).eq('proje_id', projeId)
    }

    const { data: personeller, error: personelErr } = await personelQuery

    if (personelErr) {
      return NextResponse.json({ ok: false, error: personelErr.message }, { status: 500, headers: CORS_HEADERS })
    }

    // Kayıtlı olanları filtrele
    const kayitsizPersonel = (personeller ?? []).filter(
      (p: any) => !kayitliUserIdler.includes(p.id)
    )

    return NextResponse.json({
      ok: true,
      firmaAdi,
      firmaId: firmaId,
      mod,
      personeller: kayitsizPersonel,
      projeler: projeler ?? [],
    }, { headers: CORS_HEADERS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS_HEADERS })
  }
}
