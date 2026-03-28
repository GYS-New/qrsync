import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

export async function POST(req: Request) {
  const admin = createAdminClient()

  // Mobil: X-Device-Token ile auth
  const deviceToken = req.headers.get('X-Device-Token')
  let userId: string | null = null

  if (deviceToken) {
    const { data } = await admin
      .from('device_tokens')
      .select('user_id, aktif')
      .eq('device_token', deviceToken)
      .single()
    if (data?.aktif) userId = data.user_id
  } else {
    // Web: oturum cookie ile auth
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) userId = user.id
  }

  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401, headers: CORS })
  }

  const form = await req.formData()
  const file = form.get('file')
  const taskId = String(form.get('taskId') || '')
  const maddeId = String(form.get('maddeId') || '')
  const lokasyonId = String(form.get('lokasyonId') || '')
  const kanal = String(form.get('kanal') || 'QR')

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'file missing' }, { status: 400, headers: CORS })
  }
  if (!taskId || !maddeId || !lokasyonId) {
    return NextResponse.json({ ok: false, error: 'taskId, maddeId, lokasyonId required' }, { status: 400, headers: CORS })
  }

  const type = (file.type || '').toLowerCase()
  if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(type)) {
    return NextResponse.json({ ok: false, error: 'only png/jpg/jpeg/webp allowed' }, { status: 400, headers: CORS })
  }

  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
  const path = `checklist/${lokasyonId}/${taskId}/${maddeId}-${Date.now()}.${ext}`
  const arrayBuffer = await file.arrayBuffer()

  const upload = await admin.storage.from('checklist-media').upload(path, arrayBuffer, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
    cacheControl: '3600',
  })

  if (upload.error) {
    return NextResponse.json({ ok: false, error: upload.error.message }, { status: 400, headers: CORS })
  }

  const publicUrl = admin.storage.from('checklist-media').getPublicUrl(path).data.publicUrl

  return NextResponse.json({ ok: true, publicUrl }, { headers: CORS })
}
