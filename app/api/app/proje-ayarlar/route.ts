import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

export async function GET(req: Request) {
  const deviceToken = req.headers.get('X-Device-Token')
  if (!deviceToken) return NextResponse.json({ ok: false }, { status: 401, headers: CORS })

  const admin = createAdminClient()

  // Device token'dan proje_id al
  const { data: tokenData } = await admin
    .from('device_tokens')
    .select('proje_id, firma_id')
    .eq('device_token', deviceToken)
    .single()

  if (!tokenData?.proje_id) {
    // Proje yoksa varsayılan — her şey aktif, PT kapalı (cihaz projeye bağlı değil)
    return NextResponse.json({
      ok: true,
      qr_aktif: true,
      nfc_aktif: true,
      personel_takibi_aktif: false,
    }, { headers: CORS })
  }

  // Projeden QR/NFC + PT ayarlarını çek. PT firma seviyesinde de kontrol edilir:
  // Her ikisi aktifse PT aktif; biri false ise PT kapalı.
  const [projeRes, firmaRes] = await Promise.all([
    admin.from('projeler')
      .select('qr_sistemi_aktif, nfc_sistemi_aktif, personel_takibi_aktif, ad')
      .eq('id', tokenData.proje_id).single(),
    tokenData.firma_id
      ? admin.from('firmalar').select('personel_takibi_aktif').eq('id', tokenData.firma_id).single()
      : Promise.resolve({ data: null }),
  ])

  const proje = projeRes.data as any
  const firma = firmaRes.data as any
  const ptAktif = proje?.personel_takibi_aktif === true && firma?.personel_takibi_aktif === true

  return NextResponse.json({
    ok: true,
    qr_aktif: proje?.qr_sistemi_aktif !== false,
    nfc_aktif: proje?.nfc_sistemi_aktif !== false,
    personel_takibi_aktif: ptAktif,
    proje_ad: proje?.ad || '',
  }, { headers: CORS })
}
