/**
 * GET /api/admin/yedekler
 *
 * SA paneli için Supabase Storage 'backups' bucket'ındaki yedekleri listeler.
 * Tarih × tablo grid'i için kullanılır.
 *
 * Response:
 * {
 *   tarihler: ['2026-05-12', '2026-05-11', ...],  // DESC, en yeni önce
 *   detay: {
 *     '2026-05-12': [{ tablo: 'canli_gorevler_arsiv', boyut: 2400000, ... }, ...],
 *     ...
 *   }
 * }
 */
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
    if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
      return NextResponse.json({ ok: false, error: 'Sadece SA' }, { status: 403 })
    }

    const admin = createAdminClient()

    // Root klasörleri listele (YYYY-MM-DD)
    const { data: klasorler, error: listErr } = await admin.storage.from('backups').list('', { limit: 1000 })
    if (listErr) throw new Error(`list: ${listErr.message}`)

    const tarihler = (klasorler ?? [])
      .filter((k: any) => /^\d{4}-\d{2}-\d{2}$/.test(k.name))
      .map((k: any) => k.name)
      .sort()
      .reverse()  // en yeni önce

    // Her tarih için tablo dosyalarını listele (paralel, ama 30 günü aşmamak için sınırla)
    const detayPromises = tarihler.slice(0, 90).map(async (tarih) => {
      const { data: dosyalar } = await admin.storage.from('backups').list(tarih, { limit: 1000 })
      return [tarih, (dosyalar ?? []).map((d: any) => ({
        tablo: d.name.replace(/\.json\.gz$/, ''),
        boyut: d.metadata?.size ?? 0,
        olusturma: d.created_at ?? null,
      }))] as const
    })
    const detayArr = await Promise.all(detayPromises)
    const detay: Record<string, { tablo: string; boyut: number; olusturma: string | null }[]> = {}
    for (const [tarih, items] of detayArr) detay[tarih] = items

    return NextResponse.json({ ok: true, tarihler, detay })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Yedek listesi alınamadı' }, { status: 500 })
  }
}
