/**
 * POST /api/app/upload/oto-yikama
 *
 * Oto Yıkama akışı için foto ön-yükleme — görev henüz oluşmadan personel
 * öncesi/sonrası foto çekebilir, URL'leri daha sonra ekstra-frekans /
 * gorev-tamamla POST'unda payload'a koyar.
 *
 * Headers:
 *   X-Device-Token: <cihaz tokeni>
 *
 * Body (multipart/form-data):
 *   file        — image (png/jpg/webp)
 *   lokasyon_id — istasyon UUID (zorunlu)
 *   plaka       — araç plakası (zorunlu, normalize: upper-case, boşluksuz)
 *   tip         — 'oncesi' | 'sonrasi' (zorunlu)
 *
 * Response: { ok: true, publicUrl: "https://..." }
 *
 * Yetki: yıkama personeli (kullanici_lokasyon_yetkileri.oto_yikama_lokasyon=true).
 * Bucket: 'checklist-media' (mevcut), path prefix 'oto-yikama/'.
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS })
}

export async function POST(req: Request) {
  const admin = createAdminClient()

  const deviceToken = req.headers.get('X-Device-Token')
  if (!deviceToken) {
    return NextResponse.json({ ok: false, error: 'X-Device-Token gerekli' }, { status: 401, headers: CORS })
  }
  const { data: tok } = await admin
    .from('device_tokens')
    .select('user_id, firma_id, aktif')
    .eq('device_token', deviceToken)
    .single()
  if (!tok || !tok.aktif) {
    return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token' }, { status: 401, headers: CORS })
  }

  // Yıkama personeli kontrolü
  const { data: yetkiler } = await admin
    .from('kullanici_lokasyon_yetkileri')
    .select('ust_lokasyon_id')
    .eq('user_id', tok.user_id)
  const ustIds = (yetkiler ?? []).map((y: any) => y.ust_lokasyon_id).filter(Boolean)
  if (ustIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'Lokasyon yetkiniz yok' }, { status: 403, headers: CORS })
  }
  const { data: otoLoks } = await admin
    .from('lokasyonlar')
    .select('id')
    .in('id', ustIds)
    .eq('oto_yikama_lokasyon', true)
    .eq('aktif', true)
  if ((otoLoks ?? []).length === 0) {
    return NextResponse.json(
      { ok: false, error: 'Oto Yıkama lokasyonuna yetkili değilsiniz', code: 'OTO_YIKAMA_YETKISI_YOK' },
      { status: 403, headers: CORS },
    )
  }

  const form = await req.formData()
  const file = form.get('file')
  const lokasyonId = String(form.get('lokasyon_id') || '')
  const plakaRaw = String(form.get('plaka') || '')
  const tip = String(form.get('tip') || '').toLowerCase()

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: 'file gerekli' }, { status: 400, headers: CORS })
  }
  if (!lokasyonId || !plakaRaw) {
    return NextResponse.json({ ok: false, error: 'lokasyon_id ve plaka gerekli' }, { status: 400, headers: CORS })
  }
  if (tip !== 'oncesi' && tip !== 'sonrasi') {
    return NextResponse.json({ ok: false, error: 'tip "oncesi" veya "sonrasi" olmalı' }, { status: 400, headers: CORS })
  }
  const plaka = plakaRaw.toUpperCase().replace(/[^A-Z0-9]/g, '')

  const type = (file.type || '').toLowerCase()
  if (!['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(type)) {
    return NextResponse.json({ ok: false, error: 'sadece png/jpg/webp' }, { status: 400, headers: CORS })
  }
  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'

  const path = `oto-yikama/${lokasyonId}/${plaka}/${tip}-${Date.now()}.${ext}`
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
