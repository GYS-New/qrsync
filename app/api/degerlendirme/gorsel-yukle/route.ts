import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

// POST: görsel yükle, public URL döndür
// Form-data: file (image/*)
export async function POST(req: NextRequest) {
  const admin = createAdminClient()

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: 'Form verisi okunamadı' }, { status: 400 })

  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ ok: false, error: 'Dosya bulunamadı' }, { status: 400 })

  // Tip ve boyut kontrolü
  const izinliTipler = ['image/jpeg', 'image/png', 'image/webp']
  if (!izinliTipler.includes(file.type)) {
    return NextResponse.json({ ok: false, error: 'Sadece JPG, PNG veya WebP yükleyebilirsiniz' }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: 'Dosya 5MB sınırını aşıyor' }, { status: 400 })
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${randomUUID()}.${ext}`

  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await admin.storage
    .from('degerlendirme-gorseller')
    .upload(path, buffer, { contentType: file.type, upsert: false })

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const { data: urlData } = admin.storage
    .from('degerlendirme-gorseller')
    .getPublicUrl(path)

  return NextResponse.json({ ok: true, url: urlData.publicUrl })
}
