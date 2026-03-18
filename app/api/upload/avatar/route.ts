import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'file missing' }, { status: 400 })

  // accept png/jpg/jpeg
  const type = (file.type || '').toLowerCase()
  if (!['image/png','image/jpeg','image/jpg'].includes(type)) {
    return NextResponse.json({ error: 'only png/jpg allowed' }, { status: 400 })
  }

  const admin = createAdminClient()
  const path = `avatars/${user.id}.png`
  const arrayBuffer = await file.arrayBuffer()
  const upload = await admin.storage.from('avatars').upload(path, arrayBuffer, {
    upsert: true,
    contentType: 'image/png',
    cacheControl: '3600',
  })
  if (upload.error) return NextResponse.json({ error: upload.error.message }, { status: 400 })

  const publicUrl = admin.storage.from('avatars').getPublicUrl(path).data.publicUrl

  const { error: upErr } = await admin.from('users').update({ profil_foto: publicUrl }).eq('id', user.id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })

  return NextResponse.json({ publicUrl })
}
