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

function rolAdi(rol: string): string {
  switch (rol) {
    case 'tenant_admin': return 'Yönetici'
    case 'tenant_user':  return 'Saha Personeli'
    case 'musteri':      return 'Müşteri'
    default:             return 'Saha Personeli'
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const firmaToken = searchParams.get('firma')
    const projeId    = searchParams.get('proje') ?? null

    if (!firmaToken) {
      return NextResponse.json({ ok: false, error: 'firma parametresi gerekli' }, { status: 400, headers: CORS_HEADERS })
    }

    const admin = createAdminClient()

    // Firma token ile firma bul
    const { data: linkData, error: linkErr } = await admin
      .from('app_download_links')
      .select('firma_id, aktif, mod')
      .eq('link_token', firmaToken)
      .single()

    if (linkErr || !linkData) {
      return NextResponse.json({ ok: false, error: 'Geçersiz firma linki' }, { status: 404, headers: CORS_HEADERS })
    }

    if (!linkData.aktif) {
      return NextResponse.json({ ok: false, error: 'Bu link artık aktif değil' }, { status: 403, headers: CORS_HEADERS })
    }

    // Firma adını getir
    const { data: firma } = await admin
      .from('firmalar')
      .select('firma_adi, ticari_unvan')
      .eq('id', linkData.firma_id)
      .single()

    const firmaAdi = firma?.firma_adi || firma?.ticari_unvan || ''

    // Firmaya ait projeleri getir
    const { data: projeler } = await admin
      .from('projeler')
      .select('id, ad')
      .eq('firma_id', linkData.firma_id)
      .eq('aktif', true)
      .order('ad', { ascending: true })

    // Zaten kayıtlı cihazı olan kullanıcıları bul
    const { data: kayitliCihazlar } = await admin
      .from('device_tokens')
      .select('user_id')
      .eq('firma_id', linkData.firma_id)
      .eq('aktif', true)

    const kayitliUserIdler = (kayitliCihazlar ?? []).map((d: any) => d.user_id)

    // Personel listesi
    let personelQuery = admin
      .from('users')
      .select('id, isim_soyisim, rol')
      .eq('firma_id', linkData.firma_id)
      .eq('aktif', true)
      .in('rol', ['tenant_user', 'tenant_admin'])
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
      firmaId: linkData.firma_id,
      mod: linkData.mod || 'QR',
      // Rol adlarını Türkçe olarak dönüştür
      personeller: kayitsizPersonel.map((p: any) => ({
        ...p,
        rol: rolAdi(p.rol),
      })),
      projeler: projeler ?? [],
    }, { headers: CORS_HEADERS })

  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'Sunucu hatası' }, { status: 500, headers: CORS_HEADERS })
  }
}
