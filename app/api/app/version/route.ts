import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const platform = searchParams.get('platform') || 'android'
  const currentVersion = searchParams.get('version') || '1.0.0'

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('app_versions')
    .select('min_version, latest_version, apk_url, surec_notu, zorunlu')
    .eq('platform', platform)
    .order('olusturma_tarihi', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    return NextResponse.json({ ok: true, guncelleme_gerekli: false }, { headers: CORS })
  }

  // Versiyon karşılaştırma — "1.2.3" formatı
  function versionToNumber(v: string): number {
    const parts = v.split('.').map(Number)
    return (parts[0] || 0) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0)
  }

  const current = versionToNumber(currentVersion)
  const minimum = versionToNumber(data.min_version)
  const latest  = versionToNumber(data.latest_version)

  const zorunlu_guncelleme = current < minimum
  const optional_guncelleme = current < latest

  return NextResponse.json({
    ok: true,
    current_version: currentVersion,
    latest_version: data.latest_version,
    min_version: data.min_version,
    apk_url: data.apk_url,
    surec_notu: data.surec_notu,
    zorunlu: data.zorunlu,
    guncelleme_gerekli: zorunlu_guncelleme,
    guncelleme_mevcut: optional_guncelleme,
  }, { headers: CORS })
}
