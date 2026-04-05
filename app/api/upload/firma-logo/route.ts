import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id, rol, firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await req.formData()
  const firmaId = form.get('firmaId')
  const action = String(form.get('action') || 'upload')
  if (!firmaId || typeof firmaId !== 'string') {
    return NextResponse.json({ error: 'firmaId missing' }, { status: 400 })
  }

  // authz: SA any, TA only own
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !(isTA && me.firma_id === firmaId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const path = `firmalar/${firmaId}.png`

  if (action === 'delete') {
    await admin.storage.from('logos').remove([path])
    const { error } = await admin.from('firmalar').update({ logo_url: null }).eq('id', firmaId)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'file missing' }, { status: 400 })
  const type = (file.type || '').toLowerCase()
  if (!['image/png','image/jpeg','image/jpg'].includes(type)) {
    return NextResponse.json({ error: 'only png/jpg allowed' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const upload = await admin.storage.from('logos').upload(path, arrayBuffer, {
    upsert: true,
    contentType: 'image/png',
    cacheControl: '3600',
  })
  if (upload.error) return NextResponse.json({ error: upload.error.message }, { status: 400 })

  const publicUrl = admin.storage.from('logos').getPublicUrl(path).data.publicUrl + '?t=' + Date.now()
  const { error } = await admin.from('firmalar').update({ logo_url: publicUrl }).eq('id', firmaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ publicUrl })
}
