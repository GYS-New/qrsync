import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const admin = createAdminClient()
  const form = await req.formData()
  const action = form.get('action') as string | null

  if (action === 'delete') {
    await admin.storage.from('logos').remove(['uygulama/sidebar.png'])
    const { data: mevcut } = await admin.from('sistem_konfigurasyon').select('id').limit(1).single()
    if (mevcut) await admin.from('sistem_konfigurasyon').update({ sidebar_logo_url: null }).eq('id', mevcut.id)
    return NextResponse.json({ ok: true })
  }

  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Dosya gerekli' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const storagePath = 'uygulama/sidebar.png'

  await admin.storage.from('logos').remove([storagePath])
  const { error } = await admin.storage.from('logos').upload(storagePath, buffer, {
    contentType: 'image/png', upsert: true, cacheControl: '3600',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: urlData } = admin.storage.from('logos').getPublicUrl(storagePath)
  const publicUrl = urlData?.publicUrl + '?t=' + Date.now()

  const { data: mevcut } = await admin.from('sistem_konfigurasyon').select('id').limit(1).single()
  if (mevcut) await admin.from('sistem_konfigurasyon').update({ sidebar_logo_url: publicUrl }).eq('id', mevcut.id)

  return NextResponse.json({ ok: true, url: publicUrl })
}
