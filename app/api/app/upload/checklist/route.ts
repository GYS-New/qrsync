/**
 * POST /api/app/upload/checklist
 * Mobil uygulama — çeklist madde fotoğrafı yükleme
 * Header: X-Device-Token
 * Body (multipart/form-data): file, taskId, maddeId, lokasyonId
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const admin = createAdminClient()

    // ── Cihaz doğrulama ──────────────────────────────────────────────────────
    const deviceToken = req.headers.get('X-Device-Token')
    if (!deviceToken) {
      return NextResponse.json({ ok: false, error: 'X-Device-Token gerekli' }, { status: 401 })
    }

    const { data: tokenData } = await admin
      .from('device_tokens')
      .select('user_id')
      .eq('device_token', deviceToken)
      .single()

    if (!tokenData) {
      return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token' }, { status: 401 })
    }

    // ── Form verisi ──────────────────────────────────────────────────────────
    const form       = await req.formData()
    const file       = form.get('file')
    const taskId     = String(form.get('taskId')     || '')
    const maddeId    = String(form.get('maddeId')    || '')
    const lokasyonId = String(form.get('lokasyonId') || '')

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: 'file alanı gerekli' }, { status: 400 })
    }
    if (!taskId || !maddeId || !lokasyonId) {
      return NextResponse.json({ ok: false, error: 'taskId, maddeId, lokasyonId gerekli' }, { status: 400 })
    }

    const type = (file.type || '').toLowerCase()
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(type)) {
      return NextResponse.json({ ok: false, error: 'Sadece png/jpg/jpeg/webp destekleniyor' }, { status: 400 })
    }

    const ext  = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'
    const path = `checklist/${lokasyonId}/${taskId}/${maddeId}-${Date.now()}.${ext}`

    const upload = await admin.storage
      .from('checklist-media')
      .upload(path, await file.arrayBuffer(), {
        upsert: true,
        contentType: file.type || 'image/jpeg',
        cacheControl: '3600',
      })

    if (upload.error) {
      return NextResponse.json({ ok: false, error: upload.error.message }, { status: 400 })
    }

    const publicUrl = admin.storage.from('checklist-media').getPublicUrl(path).data.publicUrl

    return NextResponse.json({ ok: true, publicUrl })

  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
