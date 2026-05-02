/**
 * Müşteri değerlendirmesi geldiğinde ilgili yetkililere FCM push bildirim.
 *
 * Bildirim alıcıları:
 *   - Firmanın TA'ları (tüm tenant_admin'ler)
 *   - Lokasyonun üst lokasyonuna yetkili U'lar (tenant_user)
 *     · kullanici_lokasyon_yetkileri kayıtlı U: ust_lokasyon_id eşleşmeli
 *     · Hiç kayıt yoksa: "tüm erişim" → bildirim alır
 *
 * Fire-and-forget — değerlendirme insert akışını bekletmez.
 *
 * Düşük puanda (≤3★) "düşük puan" vurgusu, yüksek puanda nötr ton.
 */
import { createAdminClient } from '@/lib/supabase/server'
import { sendFCMToUser } from '@/lib/fcm-sender'

interface BildirimParam {
  firmaId: string
  lokasyonId: string
  lokasyonTanim?: string
  yildiz: number
  yorum?: string | null
}

export async function musteriDegerlendirmeBildir(p: BildirimParam): Promise<void> {
  try {
    const admin = createAdminClient()

    // 1) Üst lokasyonu bul
    const { data: ustLokId } = await admin.rpc('get_ust_lokasyon_id', { p_lok_id: p.lokasyonId })
    const ustLokasyonId = ustLokId as string | null

    // 2) TA'ları çek
    const { data: taList } = await admin
      .from('users')
      .select('id')
      .eq('firma_id', p.firmaId)
      .eq('rol', 'tenant_admin')
      .eq('aktif', true)

    // 3) Yetkili U'ları çek
    let uList: { id: string }[] = []
    if (ustLokasyonId) {
      // U'lardan: ya bu üst lokasyona yetkisi var, ya da hiç yetki kaydı yok (tüm erişim)
      const { data: tumU } = await admin
        .from('users')
        .select('id')
        .eq('firma_id', p.firmaId)
        .eq('rol', 'tenant_user')
        .eq('aktif', true)

      if (tumU?.length) {
        const userIds = tumU.map((u: any) => u.id)
        const { data: yetkiKayitlari } = await admin
          .from('kullanici_lokasyon_yetkileri')
          .select('user_id, ust_lokasyon_id')
          .in('user_id', userIds)

        const yetkiSahibi = new Map<string, Set<string>>()
        for (const y of (yetkiKayitlari ?? []) as any[]) {
          if (!yetkiSahibi.has(y.user_id)) yetkiSahibi.set(y.user_id, new Set())
          yetkiSahibi.get(y.user_id)!.add(y.ust_lokasyon_id)
        }

        uList = tumU.filter((u: any) => {
          const yetkileri = yetkiSahibi.get(u.id)
          if (!yetkileri || yetkileri.size === 0) return true  // hiç kayıt yok = tüm erişim
          return yetkileri.has(ustLokasyonId)
        })
      }
    }

    const aliciIds = Array.from(new Set([
      ...(taList ?? []).map((u: any) => u.id),
      ...uList.map(u => u.id),
    ]))
    if (!aliciIds.length) return

    // 4) Bildirim metni
    const dusuk = p.yildiz <= 3
    const yildizStr = '★'.repeat(p.yildiz) + '☆'.repeat(5 - p.yildiz)
    const lokTanim = p.lokasyonTanim ?? 'Bir lokasyon'
    const title = dusuk
      ? `⚠️ Düşük Puan (${p.yildiz}/5)`
      : `Yeni Değerlendirme (${p.yildiz}/5)`
    const yorumKisa = p.yorum ? (p.yorum.length > 80 ? p.yorum.slice(0, 77) + '...' : p.yorum) : ''
    const body = `${lokTanim} • ${yildizStr}${yorumKisa ? ` — "${yorumKisa}"` : ''}`
    const channel = dusuk ? 'gorev_uyari' : 'default'

    // 5) Paralel gönder
    await Promise.all(aliciIds.map(uid => sendFCMToUser(uid, title, body, channel).catch(() => {})))
  } catch (e) {
    console.error('[musteriDegerlendirmeBildir]', e)
    // Sessiz geç — değerlendirme akışını kırmayalım
  }
}
