import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import path from 'path'
import { promises as fs } from 'fs'

const TEMPLATES_DIR = path.join(process.cwd(), 'public', 'report-templates')

// ── GET: Yüklü şablonları listele ──────────────────────────────────────────
export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 })

    const files = await fs.readdir(TEMPLATES_DIR).catch(() => [] as string[])
    const templates = files
      .filter(f => f.endsWith('.xlsx'))
      .map(f => ({
        filename: f,
        label: f.replace(/\.xlsx$/i, '').replace(/[_-]/g, ' '),
        isDefault: f === 'QR-SYNC_Genel_Rapor.xlsx',
        url: `/report-templates/${f}`,
      }))

    return NextResponse.json(templates)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Liste okunamadı.' }, { status: 500 })
  }
}

// ── POST: Yeni şablon yükle ────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
    if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı.' }, { status: 401 })

    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const isTA = me.rol === 'tenant_admin'
    if (!isSA && !isTA) return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 })

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Dosya bulunamadı.' }, { status: 400 })
    if (!file.name.endsWith('.xlsx')) return NextResponse.json({ error: 'Yalnızca .xlsx dosyaları kabul edilir.' }, { status: 400 })
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'Dosya 10 MB sınırını aşıyor.' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    await fs.mkdir(TEMPLATES_DIR, { recursive: true })
    const dest = path.join(TEMPLATES_DIR, safe)
    await fs.writeFile(dest, buffer)

    return NextResponse.json({ ok: true, filename: safe, label: safe.replace(/\.xlsx$/i,'').replace(/[_-]/g,' ') })
  } catch (error: any) {
    console.error('Upload template error:', error)
    return NextResponse.json({ error: error?.message ?? 'Yükleme başarısız.' }, { status: 500 })
  }
}

// ── DELETE: Şablon sil ─────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  try {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
    const isSA = me?.rol === 'super_admin' || me?.rol === 'alt_super_admin'
    if (!isSA) return NextResponse.json({ error: 'Yalnızca SA silebilir.' }, { status: 403 })

    const { filename } = await request.json()
    if (!filename || filename === 'QR-SYNC_Genel_Rapor.xlsx') {
      return NextResponse.json({ error: 'Varsayılan şablon silinemez.' }, { status: 400 })
    }
    const safe = (filename as string).replace(/[^a-zA-Z0-9._-]/g, '_')
    await fs.unlink(path.join(TEMPLATES_DIR, safe))
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Silme başarısız.' }, { status: 500 })
  }
}
