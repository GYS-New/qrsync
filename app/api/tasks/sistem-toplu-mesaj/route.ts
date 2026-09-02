/**
 * POST /api/tasks/sistem-toplu-mesaj
 * Sistem tarafından tetiklenen toplu FCM push. CRON_SECRET ile korunur.
 *
 * Body: {
 *   proje_id?: string,          // proje filtresi (opsiyonel)
 *   firma_id?: string,          // firma filtresi (opsiyonel)
 *   online_dk?: number,         // son N dk device_tokens.son_kullanim
 *   userIds?: string[],         // dogrudan alici listesi (proje/firma/online yerine)
 *   title: string,
 *   body: string,
 *   kanal?: 'default'|'gorev_uyari'|'gorev_tamamla'
 * }
 * FCM push + bildirimler tablosuna in-app kayit.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendFCMToUser } from '@/lib/fcm-sender'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-cron-token')
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({} as any))
  const title = (body.title ?? '').toString().trim()
  const mesaj = (body.body ?? '').toString().trim()
  const kanal = ['default', 'gorev_uyari', 'gorev_tamamla'].includes(body.kanal) ? body.kanal : 'default'
  if (!title || !mesaj) {
    return NextResponse.json({ ok: false, error: 'title ve body gerekli' }, { status: 400 })
  }

  const admin = createAdminClient()

  let userIds: string[] = []

  if (Array.isArray(body.userIds) && body.userIds.length > 0) {
    userIds = body.userIds.filter((x: any) => typeof x === 'string')
  } else {
    // Filtre: son N dk online + opsiyonel proje/firma
    const onlineDk = Number(body.online_dk) > 0 ? Number(body.online_dk) : 20
    const sinirIso = new Date(Date.now() - onlineDk * 60 * 1000).toISOString()

    let q = admin
      .from('device_tokens')
      .select('user_id, users!inner(firma_id, proje_id, aktif)')
      .eq('aktif', true)
      .not('fcm_token', 'is', null)
      .gte('son_kullanim', sinirIso)

    const { data: rows } = await q
    const filtered = (rows ?? []).filter((r: any) => {
      if (r.users?.aktif !== true) return false
      if (body.firma_id && r.users?.firma_id !== body.firma_id) return false
      if (body.proje_id && r.users?.proje_id !== body.proje_id) return false
      return true
    })
    userIds = [...new Set(filtered.map((r: any) => r.user_id))]
  }

  if (userIds.length === 0) {
    return NextResponse.json({ ok: true, gonderilen: 0, alicilar: 0, mesaj: 'Hicbir alici yok' })
  }

  const nowIso = new Date().toISOString()
  let basarili = 0
  const hatalar: string[] = []

  for (const uid of userIds) {
    // In-app bildirim kaydi
    const { error: insErr } = await admin.from('bildirimler').insert({
      alici_id: uid,
      baslik: title,
      mesaj,
      tip: 'manuel_push',
      okundu: false,
      tarih: nowIso,
    })
    if (insErr) hatalar.push(`bildirim(${uid}): ${insErr.message}`)

    // FCM push
    try {
      await sendFCMToUser(uid, title, mesaj, kanal)
      basarili++
    } catch (e: any) {
      hatalar.push(`fcm(${uid}): ${e?.message}`)
    }
  }

  return NextResponse.json({
    ok: true,
    alicilar: userIds.length,
    basarili,
    hatalar: hatalar.slice(0, 20),
  })
}
