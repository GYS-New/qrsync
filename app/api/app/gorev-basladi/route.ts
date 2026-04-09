import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendFCMToUser } from '@/lib/fcm-sender'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

async function getAuthUser(req: Request) {
  const deviceToken = req.headers.get('X-Device-Token')
  if (!deviceToken) return null
  const admin = createAdminClient()
  const { data } = await admin
    .from('device_tokens')
    .select('user_id, aktif')
    .eq('device_token', deviceToken)
    .single()
  if (data?.aktif) return { id: data.user_id }
  return null
}

export async function POST(req: Request) {
  const user = await getAuthUser(req)
  if (!user) return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401, headers: CORS_HEADERS })

  try {
    const body = await req.json()
    const { taskId, lokasyonAdi, minSureDakika, maxSureDakika } = body

    // Bildirim zamanlamaları (fire-and-forget, response hemen dön)
    const zamanlamalar: { beklemeDk: number; baslik: string; mesaj: string; kanal: string }[] = []

    // 1. Min süre dolunca bildirim (eğer min süre varsa)
    if (minSureDakika && minSureDakika > 0) {
      zamanlamalar.push({
        beklemeDk: minSureDakika,
        baslik: '✅ Görevinizi Tamamlayabilirsiniz!',
        mesaj: `${lokasyonAdi || 'Lokasyon'} için minimum süre doldu. Buraya tıklayarak tamamlamayı unutmayın!`,
        kanal: 'gorev_tamamla',
      })
    }

    // 2. Max süreye 2 dk kala bildirim (eğer max süre varsa)
    if (maxSureDakika && maxSureDakika > 2) {
      zamanlamalar.push({
        beklemeDk: maxSureDakika - 2,
        baslik: '🚨 Göreviniz Devam Ediyor!',
        mesaj: `${lokasyonAdi || 'Lokasyon'} için görev devam ediyor. En kısa sürede bitirmelisiniz. Buraya tıklayarak tamamlamayı unutmayın!`,
        kanal: 'gorev_uyari',
      })
    }

    // 3. Sabit hatırlatmalar — 5dk, 15dk (eğer görev hâlâ açıksa backend kontrol eder)
    const hatirlatmalar = [5, 15]
    for (const dk of hatirlatmalar) {
      const maxKontrol = !maxSureDakika || maxSureDakika > dk
      const minKontrol = !minSureDakika || minSureDakika < dk
      if (maxKontrol && minKontrol) {
        zamanlamalar.push({
          beklemeDk: dk,
          baslik: '⏱ Göreviniz Devam Ediyor!',
          mesaj: `${lokasyonAdi || 'Lokasyon'} için görev devam ediyor. En kısa sürede bitirmelisiniz. Buraya tıklayarak tamamlamayı unutmayın!`,
          kanal: 'gorev_uyari',
        })
      }
    }

    // Hepsini arka planda zamanla — response hemen dön
    const admin = createAdminClient()
    ;(async () => {
      for (const z of zamanlamalar) {
        await new Promise(r => setTimeout(r, z.beklemeDk * 60 * 1000))
        // Görev hâlâ açık mı kontrol et
        try {
          const { data: gorev } = await admin
            .from('gorevler')
            .select('durum')
            .eq('id', taskId)
            .single()
          if (!gorev || gorev.durum === 'TAMAMLANDI' || gorev.durum === 'IPTAL') break
          await sendFCMToUser(user.id, z.baslik, z.mesaj, z.kanal)
        } catch {}
      }
    })()

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: CORS_HEADERS })
  }
}
