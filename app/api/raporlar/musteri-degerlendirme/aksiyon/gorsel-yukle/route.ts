/**
 * /api/raporlar/musteri-degerlendirme/aksiyon/gorsel-yukle
 *
 * Aksiyon görseli yükleme endpoint'i. Auth gerektirir (TA/U/SA).
 * Form-data: file (image/jpeg|png|webp, max 5MB)
 *
 * Aynı bucket (degerlendirme-gorseller) — path prefix 'aksiyon/' ile ayrılır.
 * Public URL döner.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const admin = createAdminClient()

  // Auth — sadece sistemli kullanıcı (anonim müşteri değil)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })
  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const izinliRoller = ['super_admin', 'alt_super_admin', 'tenant_admin', 'tenant_user', 'musteri']
  if (!izinliRoller.includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz işlem' }, { status: 403 })
  }

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ ok: false, error: 'Form verisi okunamadı' }, { status: 400 })

  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ ok: false, error: 'Dosya bulunamadı' }, { status: 400 })

  const izinliTipler = ['image/jpeg', 'image/png', 'image/webp']
  if (!izinliTipler.includes(file.type)) {
    return NextResponse.json({ ok: false, error: 'Sadece JPG, PNG veya WebP yükleyebilirsiniz' }, { status: 400 })
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ ok: false, error: 'Dosya 5MB sınırını aşıyor' }, { status: 400 })
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `aksiyon/${randomUUID()}.${ext}`

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
