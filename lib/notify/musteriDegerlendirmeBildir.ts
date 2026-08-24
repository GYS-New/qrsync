/**
 * Müşteri değerlendirmesi geldiğinde ilgili yetkililere FCM push + web bildirim.
 *
 * Bildirim alıcıları (kuralı) — mig 098 sonrası proje-scope'lu:
 *   - Lokasyonun ait olduğu PROJEYE atanmış TA'lar (tenant_admin_projeler junction)
 *     · Firma-wide TA'lar değil; sadece projeyi görüntüleme yetkisi olanlar
 *   - Lokasyonun ait olduğu projeye atanmış U'lar (users.proje_id = proje)
 *     ve üst lokasyona açık yetki kaydı olanlar (kullanici_lokasyon_yetkileri)
 *     · Yetki kaydı OLMAYAN U'lar (tüm erişim fallback) bildirim ALMAZ
 *   - Lokasyonun ait olduğu projeye atanmış MÜŞTERİ rolü kullanıcılar
 *     (users.rol='musteri' + users.proje_id = proje) — proje müşterisi rapor
 *     tüketicisidir; kendi verdiği anonim QR değerlendirmesi olmaz
 *     (2026-07-28 eklendi, BURAK SEMKİN vakası).
 *     Lokasyon kısıtı: kullanici_lokasyon_yetkileri'nde kaydı YOKSA tüm-proje
 *     bildirim alır (fallback); VARSA sadece o üst lokasyonlara yetkili ise
 *     bildirim alır (UI: "U ve M rolleri hangi üst lokasyonların verilerine
 *     erişebilir" ekranı ile hizalı, 2026-08-14).
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

    // 1) Lokasyondan proje_id + üst lokasyon
    const { data: lokRow } = await admin
      .from('lokasyonlar').select('proje_id').eq('id', p.lokasyonId).maybeSingle()
    const lokasyonProjeId = (lokRow as any)?.proje_id ?? null

    const { data: ustLokId } = await admin.rpc('get_ust_lokasyon_id', { p_lok_id: p.lokasyonId })
    const ustLokasyonId = ustLokId as string | null
    let ustLokasyonTanim: string | null = null
    if (ustLokasyonId) {
      const { data: ustLok } = await admin
        .from('lokasyonlar').select('tanim').eq('id', ustLokasyonId).maybeSingle()
      ustLokasyonTanim = (ustLok as any)?.tanim ?? null
    }

    // 2) Sadece bu PROJEYE atanmış TA'ları çek (mig 098 junction).
    //    Projesiz lokasyon (proje_id NULL) durumunda firma-wide TA fallback.
    let taList: { id: string }[] = []
    if (lokasyonProjeId) {
      const { data: junction } = await admin
        .from('tenant_admin_projeler')
        .select('user_id')
        .eq('proje_id', lokasyonProjeId)
      const taIds = (junction ?? []).map((j: any) => j.user_id)
      if (taIds.length) {
        const { data: aktifTA } = await admin
          .from('users').select('id')
          .in('id', taIds)
          .eq('rol', 'tenant_admin')
          .eq('aktif', true)
        taList = (aktifTA ?? []) as any
      }
    } else {
      // Proje atanmamış lokasyon (eski/legacy) — fallback firma-wide
      const { data: fallbackTA } = await admin
        .from('users').select('id')
        .eq('firma_id', p.firmaId)
        .eq('rol', 'tenant_admin')
        .eq('aktif', true)
      taList = (fallbackTA ?? []) as any
    }

    // 3) Sadece bu üst lokasyona AÇIK yetkisi olan + projeye atanmış U'ları çek
    // (yetki kaydı olmayan U "tüm erişim" sayılıyor ama bildirim ALMAZ)
    let uList: { id: string }[] = []
    if (ustLokasyonId) {
      const { data: yetkiKayitlari } = await admin
        .from('kullanici_lokasyon_yetkileri')
        .select('user_id')
        .eq('ust_lokasyon_id', ustLokasyonId)

      const yetkiliUserIds = Array.from(new Set((yetkiKayitlari ?? []).map((y: any) => y.user_id)))
      if (yetkiliUserIds.length) {
        let uq = admin
          .from('users')
          .select('id')
          .in('id', yetkiliUserIds)
          .eq('firma_id', p.firmaId)
          .eq('rol', 'tenant_user')
          .eq('aktif', true)
        // Lokasyonun projesine atanmış U'lar — başka projenin personeli
        // yetki kaydı olsa bile (yanlış konfig) bildirim almasın.
        if (lokasyonProjeId) uq = uq.eq('proje_id', lokasyonProjeId)
        const { data: aktifU } = await uq
        uList = (aktifU ?? []) as any
      }
    }

    // 4) Projeye atanmış müşteri rolü kullanıcıları (proje müşterisi = rapor
    //    tüketici, ör. tesis sahibi tarafındaki temsilci).
    // Lokasyon kısıtı: yetki kaydı YOKSA proje geneli (tüm-erişim fallback);
    // VARSA sadece bu üst lokasyona yetkili olanlar.
    let musteriList: { id: string }[] = []
    if (lokasyonProjeId) {
      const { data: aktifMusteri } = await admin
        .from('users').select('id')
        .eq('firma_id', p.firmaId)
        .eq('proje_id', lokasyonProjeId)
        .eq('rol', 'musteri')
        .eq('aktif', true)
      const tumMusteriIds = (aktifMusteri ?? []).map((u: any) => u.id)

      if (tumMusteriIds.length && ustLokasyonId) {
        const { data: musteriYetkileri } = await admin
          .from('kullanici_lokasyon_yetkileri')
          .select('user_id, ust_lokasyon_id')
          .in('user_id', tumMusteriIds)

        const yetkiKaydiOlanlar = new Set(
          (musteriYetkileri ?? []).map((y: any) => y.user_id as string),
        )
        const buUstYetkilileri = new Set(
          (musteriYetkileri ?? [])
            .filter((y: any) => y.ust_lokasyon_id === ustLokasyonId)
            .map((y: any) => y.user_id as string),
        )

        musteriList = tumMusteriIds
          .filter((uid: string) => !yetkiKaydiOlanlar.has(uid) || buUstYetkilileri.has(uid))
          .map((uid: string) => ({ id: uid }))
      } else {
        // ustLokasyonId yok (RPC null) — lokasyon filtresi anlamlı değil, tüm proje müşterileri
        musteriList = tumMusteriIds.map((uid: string) => ({ id: uid }))
      }
    }

    const aliciIds = Array.from(new Set([
      ...(taList ?? []).map((u: any) => u.id),
      ...uList.map(u => u.id),
      ...musteriList.map(u => u.id),
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
    // Bildirim mesaj limiti: 300 karakter. FCM push body limiti (Android ~500,
    // iOS ~200 alert body ama collapsed subtitle uzunca destekler). Web toast'ta
    // uzun mesaj olabilir. Kullanici geri bildirim: 80 cok kisa idi.
    const yorumKisa = p.yorum ? (p.yorum.length > 300 ? p.yorum.slice(0, 297) + '...' : p.yorum) : ''
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
