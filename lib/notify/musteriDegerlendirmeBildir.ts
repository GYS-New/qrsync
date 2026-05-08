/**
 * Müşteri değerlendirmesi geldiğinde ilgili yetkililere FCM push + web bildirim.
 *
 * Bildirim alıcıları (kuralı):
 *   - Firmanın TÜM aktif TA'ları (tenant_admin)
 *   - Lokasyonun üst lokasyonuna açık yetki kaydı olan U'lar (tenant_user)
 *     · kullanici_lokasyon_yetkileri kayıtlı + ust_lokasyon_id eşleşen
 *     · NOT: yetki kaydı OLMAYAN U'lar (tüm erişim fallback) bildirim ALMAZ
 *
 * İki kanal:
 *   - Web in-app: bildirimler tablosuna 'musteri_degerlendirme' tipinde kayıt
 *   - Mobil push: FCM (paired cihaz varsa)
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

    // 1) Üst lokasyonu bul (id + tanım)
    const { data: ustLokId } = await admin.rpc('get_ust_lokasyon_id', { p_lok_id: p.lokasyonId })
    const ustLokasyonId = ustLokId as string | null
    let ustLokasyonTanim: string | null = null
    if (ustLokasyonId) {
      const { data: ustLok } = await admin
        .from('lokasyonlar').select('tanim').eq('id', ustLokasyonId).maybeSingle()
      ustLokasyonTanim = (ustLok as any)?.tanim ?? null
    }

    // 2) TA'ları çek
    const { data: taList } = await admin
      .from('users')
      .select('id')
      .eq('firma_id', p.firmaId)
      .eq('rol', 'tenant_admin')
      .eq('aktif', true)

    // 3) Sadece bu üst lokasyona AÇIK yetkisi olan U'ları çek
    // (yetki kaydı olmayan U "tüm erişim" sayılıyor ama bildirim ALMAZ)
    let uList: { id: string }[] = []
    if (ustLokasyonId) {
      const { data: yetkiKayitlari } = await admin
        .from('kullanici_lokasyon_yetkileri')
        .select('user_id')
        .eq('ust_lokasyon_id', ustLokasyonId)

      const yetkiliUserIds = Array.from(new Set((yetkiKayitlari ?? []).map((y: any) => y.user_id)))
      if (yetkiliUserIds.length) {
        const { data: aktifU } = await admin
          .from('users')
          .select('id')
          .in('id', yetkiliUserIds)
          .eq('firma_id', p.firmaId)
          .eq('rol', 'tenant_user')
          .eq('aktif', true)
        uList = (aktifU ?? []) as any
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
    // Üst lokasyon ile alt lokasyon farklı ise yol göster: "ÜST > ALT"
    // Aynı ise tek kez yaz (değerlendirme üst lokasyonda alınmış olabilir)
    const lokYol = ustLokasyonTanim && ustLokasyonTanim !== lokTanim
      ? `${ustLokasyonTanim} › ${lokTanim}`
      : lokTanim
    const title = dusuk
      ? `⚠️ Düşük Puan (${p.yildiz}/5)`
      : `Yeni Değerlendirme (${p.yildiz}/5)`
    const yorumKisa = p.yorum ? (p.yorum.length > 80 ? p.yorum.slice(0, 77) + '...' : p.yorum) : ''
    const body = `${lokYol} • ${yildizStr}${yorumKisa ? ` — "${yorumKisa}"` : ''}`
    const channel = dusuk ? 'gorev_uyari' : 'default'

    // 5a) Web bildirimleri — bildirimler tablosuna toplu insert
    const bildirimRows = aliciIds.map(uid => ({
      alici_id: uid,
      baslik: title,
      mesaj: body,
      tip: 'musteri_degerlendirme' as const,
      okundu: false,
    }))
    await admin.from('bildirimler').insert(bildirimRows).then(() => {}, (e: any) => {
      console.error('[musteriDegerlendirmeBildir:web]', e)
    })

    // 5b) Mobil FCM push — paralel (cihazı yoksa sessiz geçer)
    await Promise.all(aliciIds.map(uid => sendFCMToUser(uid, title, body, channel).catch(() => {})))
  } catch (e) {
    console.error('[musteriDegerlendirmeBildir]', e)
    // Sessiz geç — değerlendirme akışını kırmayalım
  }
}
