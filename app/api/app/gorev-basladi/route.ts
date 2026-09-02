import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendFCMToUser } from '@/lib/fcm-sender'
import { mesaiVePasifKontrol } from '@/lib/mesai/kontrolEt'

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

  // PT aktif projede acik mesai zorunlulugu (02.09.2026 fix — 7 mobil endpoint
  // bu kontrolu yapmiyordu, personel mesai olmadan gorev basladiabiliyordu)
  const mesaiHata = await mesaiVePasifKontrol(createAdminClient(), user.id)
  if (mesaiHata) return NextResponse.json(mesaiHata, { status: mesaiHata.status, headers: CORS_HEADERS })

  try {
    const body = await req.json()
    const { taskId, lokasyonAdi, minSureDakika, maxSureDakika } = body
    // gorevTipi opsiyonel — mobile yeni sürüm gönderiyor. Eski sürümler için
    // varsayılan 'canli_gorevler' (frekansiyel ana akış). 'gorevler' sadece
    // oto yıkama görevleri için.
    const gorevTipi: 'canli_gorevler' | 'gorevler' =
      body.gorevTipi === 'gorevler' ? 'gorevler' : 'canli_gorevler'

    // Bildirim zamanlamaları (fire-and-forget, response hemen dön)
    const zamanlamalar: { beklemeDk: number; baslik: string; mesaj: string; kanal: string }[] = []

    // 1. Min süre dolunca bildirim (eğer min süre varsa)
    if (minSureDakika && minSureDakika > 0) {
      zamanlamalar.push({
        beklemeDk: minSureDakika,
        baslik: '✅ Görevi Tamamlayabilirsiniz!',
        mesaj: `${lokasyonAdi || 'Lokasyon'} için minimum süre doldu. Lütfen görevi tamamlayın.`,
        kanal: 'gorev_tamamla_v2',
      })
    }

    // 2. Max süreye 2 dk kala bildirim (eğer max süre varsa)
    if (maxSureDakika && maxSureDakika > 2) {
      zamanlamalar.push({
        beklemeDk: maxSureDakika - 2,
        baslik: '🚨 Görevi Hemen Tamamlayın!',
        mesaj: `${lokasyonAdi || 'Lokasyon'} için maksimum süreye 2 dakika kaldı!`,
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
          baslik: '⏱ Göreviniz Devam Ediyor',
          mesaj: `${lokasyonAdi || 'Lokasyon'} için göreviniz hâlâ aktif. Lütfen tamamlayın.`,
          kanal: 'gorev_uyari',
        })
      }
    }

    // Hepsini arka planda zamanla — response hemen dön
    const admin = createAdminClient()
    ;(async () => {
      for (const z of zamanlamalar) {
        await new Promise(r => setTimeout(r, z.beklemeDk * 60 * 1000))
        // Görev hâlâ açık mı kontrol et — doğru tabloda ara (frekansiyel
        // canli_gorevler'da, spesifik/oto-yıkama gorevler'de). Önceden her zaman
        // gorevler'a bakıyordu → frekansiyel görevde !gorev true olup break,
        // ya da oto-yıkama'da yanlış kayıt yakalanıp ALAKASIZ bildirim
        // gönderiliyordu.
        try {
          const { data: gorev } = await admin
            .from(gorevTipi)
            .select('durum')
            .eq('id', taskId)
            .maybeSingle()
          // Görev bulunamadıysa veya terminal durumda ise zincir kesilir
          if (!gorev) break
          const terminalDurumlar = ['TAMAMLANDI', 'IPTAL', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS', 'KAPATILDI']
          if (terminalDurumlar.includes((gorev as any).durum)) break
          await sendFCMToUser(user.id, z.baslik, z.mesaj, z.kanal)
        } catch {}
      }
    })()

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: CORS_HEADERS })
  }
}
