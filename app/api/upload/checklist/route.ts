import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  const taskId = String(form.get('taskId') || '')
  const maddeId = String(form.get('maddeId') || '')
  const lokasyonId = String(form.get('lokasyonId') || '')
  const kanal = String(form.get('kanal') || 'QR')

  if (!(file instanceof File)) return NextResponse.json({ error: 'file missing' }, { status: 400 })
  if (!taskId || !maddeId || !lokasyonId) return NextResponse.json({ error: 'taskId, maddeId, lokasyonId required' }, { status: 400 })

  const type = (file.type || '').toLowerCase()
  if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(type)) {
    return NextResponse.json({ error: 'only png/jpg/jpeg/webp allowed' }, { status: 400 })
  }

  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
  const safeKanal = kanal === 'NFC' ? 'nfc' : 'qr'
  const path = `checklist/${lokasyonId}/${taskId}/${maddeId}-${Date.now()}.${ext}`
  const arrayBuffer = await file.arrayBuffer()

  const admin = createAdminClient()
  const upload = await admin.storage.from('checklist-media').upload(path, arrayBuffer, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
    cacheControl: '3600',
  })

  if (upload.error) {
    return NextResponse.json({ error: upload.error.message }, { status: 400 })
  }

  const publicUrl = admin.storage.from('checklist-media').getPublicUrl(path).data.publicUrl

  return NextResponse.json({ publicUrl, kanal: safeKanal })
}
