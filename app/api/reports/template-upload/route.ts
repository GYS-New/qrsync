import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** POST — Genel Rapor şablonunu Supabase Storage'a yükle */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Dosya gerekli' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const admin = createAdminClient()

  // Mevcut dosyayı sil (varsa) ve yenisini yükle
  const storagePath = 'Genel_Rapor_Sablonu.xlsx'
  await admin.storage.from('templates').remove([storagePath])
  const { error } = await admin.storage.from('templates').upload(storagePath, buffer, {
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    upsert: true,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, message: 'Şablon yüklendi' })
}

/** GET — Şablon bilgisini döndür */
export async function GET() {
  const admin = createAdminClient()
  const { data } = await admin.storage.from('templates').list('', { limit: 10 })
  const sablon = (data ?? []).find(f => f.name === 'Genel_Rapor_Sablonu.xlsx')
  return NextResponse.json({
    exists: !!sablon,
    updatedAt: sablon?.updated_at ?? null,
    size: sablon?.metadata?.size ?? null,
  })
}
