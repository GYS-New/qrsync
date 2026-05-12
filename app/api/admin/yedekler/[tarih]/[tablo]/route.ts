/**
 * GET /api/admin/yedekler/[tarih]/[tablo]
 *
 * Bir tablo yedeğinin içeriğini döner. ?preview=1 → sadece satır sayısı + ilk 50.
 * Aksi takdirde tüm JSON (UI'da indirilebilir).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { gunzipSync } from 'zlib'

export const dynamic = 'force-dynamic'

export async function GET(
  req: NextRequest,
  { params }: { params: { tarih: string; tablo: string } },
) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
    if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
      return NextResponse.json({ ok: false, error: 'Sadece SA' }, { status: 403 })
    }

    const { tarih, tablo } = params
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) {
      return NextResponse.json({ ok: false, error: 'Geçersiz tarih' }, { status: 400 })
    }
    if (!/^[a-z_]+$/.test(tablo)) {
      return NextResponse.json({ ok: false, error: 'Geçersiz tablo adı' }, { status: 400 })
    }

    const admin = createAdminClient()
    const path = `${tarih}/${tablo}.json.gz`
    const { data: blob, error: dlErr } = await admin.storage.from('backups').download(path)
    if (dlErr || !blob) {
      return NextResponse.json({ ok: false, error: `Dosya bulunamadı: ${path}` }, { status: 404 })
    }

    const buf = Buffer.from(await blob.arrayBuffer())
    const json = gunzipSync(buf).toString('utf-8')
    const rows = JSON.parse(json) as any[]

    const preview = req.nextUrl.searchParams.get('preview') === '1'
    if (preview) {
      return NextResponse.json({
        ok: true,
        tarih, tablo,
        toplam: rows.length,
        ornek: rows.slice(0, 50),
        boyut_gzip: buf.length,
        boyut_ham: json.length,
      })
    }

    return NextResponse.json({ ok: true, tarih, tablo, toplam: rows.length, rows })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Yedek okunamadı' }, { status: 500 })
  }
}
