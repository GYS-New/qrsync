import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** GET — public uygulama ayarları (auth gerektirmez) */
export async function GET() {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('sistem_konfigurasyon').select('uygulama_logo_url,uygulama_ismi').limit(1).single()
    return NextResponse.json({
      logo: data?.uygulama_logo_url ?? null,
      isim: data?.uygulama_ismi ?? 'QR-Sync',
    })
  } catch {
    return NextResponse.json({ logo: null, isim: 'QR-Sync' })
  }
}
