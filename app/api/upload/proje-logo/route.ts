import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const admin = createAdminClient()
  const form = await req.formData()
  const action = form.get('action') as string | null
  const projeId = form.get('projeId') as string

  if (!projeId) return NextResponse.json({ error: 'projeId zorunlu' }, { status: 400 })

  // Silme
  if (action === 'delete') {
    await admin.storage.from('logos').remove([`projeler/${projeId}.png`])
    await admin.from('projeler').update({ logo_url: null }).eq('id', projeId)
    return NextResponse.json({ ok: true })
  }

  // Yükleme
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Dosya gerekli' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!['png', 'jpeg', 'jpg'].includes(ext ?? '')) return NextResponse.json({ error: 'PNG veya JPEG dosyası gerekli' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const storagePath = `projeler/${projeId}.png`

  await admin.storage.from('logos').remove([storagePath])
  const { error: uploadErr } = await admin.storage.from('logos').upload(storagePath, buffer, {
    contentType: 'image/png', upsert: true, cacheControl: '3600',
  })
  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const { data: urlData } = admin.storage.from('logos').getPublicUrl(storagePath)
  const publicUrl = urlData?.publicUrl + '?t=' + Date.now()

  await admin.from('projeler').update({ logo_url: publicUrl }).eq('id', projeId)

  return NextResponse.json({ ok: true, url: publicUrl })
}
