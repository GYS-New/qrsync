const cron = require('node-cron')

let cronJobStarted = false

function initArsivCron() {
  if (cronJobStarted) return
  cronJobStarted = true

  const getBaseUrl = () => {
    const port = process.env.PORT || 3000
    return `http://localhost:${port}`
  }

  const cronHeaders = {
    'x-cron-token': process.env.CRON_SECRET || '',
    'Content-Type': 'application/json',
  }

  // Cron log kaydet (bildirim barı için) — firma_id/proje_id opsiyonel
  async function logCron(tip, sonuc, firma_id, proje_id) {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!supabaseUrl || !supabaseKey) return
      const row = { tip, sonuc }
      if (firma_id) row.firma_id = firma_id
      if (proje_id) row.proje_id = proje_id
      await fetch(`${supabaseUrl}/rest/v1/cron_log`, {
        method: 'POST',
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(row),
      })
      // Eski logları temizle (24 saatten eski)
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      await fetch(`${supabaseUrl}/rest/v1/cron_log?tarih=lt.${cutoff}`, {
        method: 'DELETE',
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      })
    } catch {}
  }

  // Her 6 saatte: 00:00, 06:00, 12:00, 18:00
  cron.schedule('0 */6 * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/tasks/arsivle`, {
        method: 'POST',
        headers: cronHeaders,
      })
      const result = await response.json()
      console.log('[CRON-ARSIVLE]', new Date().toISOString(), result)
      // Heartbeat — her zaman log at, iş olmasa da (sistem-kontrol false positive engellenir)
      await logCron('arsivleme', { heartbeat: true, ok: result.ok ?? true, firma_sayisi: Object.keys(result.results ?? {}).length })
      // Firma bazlı log yaz (sadece iş yapıldıysa)
      for (const [key, val] of Object.entries(result.results ?? {})) {
        const [fId, pId] = key.split('/')
        if (fId) await logCron('arsivleme', { results: { [key]: val } }, fId, pId || null)
      }
    } catch (error) {
      console.error('[CRON-ARSIVLE] Hata:', error)
    }
  })

  // Her 5 dakikada: max süre kontrolü — ISLEMDE görevler süre dolunca IPTAL edilir
  cron.schedule('*/5 * * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/tasks/max-sure-kontrol`, {
        method: 'POST',
        headers: cronHeaders,
      })
      const result = await response.json()
      // Heartbeat — her zaman log at
      await logCron('max_sure', {
        heartbeat: true,
        ok: result.ok ?? true,
        gorevler_otomatik_tamamla: result.gorevler_otomatik_tamamla ?? 0,
        canli_gorevler_otomatik_tamamla: result.canli_gorevler_otomatik_tamamla ?? 0,
        uyari_gonderildi: result.uyari_gonderildi ?? 0,
      })
      if (result.gorevler_otomatik_tamamla > 0 || result.canli_gorevler_otomatik_tamamla > 0 || result.uyari_gonderildi > 0) {
        console.log('[CRON-MAX-SURE]', new Date().toISOString(), result)
      }
    } catch (error) {
      console.error('[CRON-MAX-SURE] Hata:', error)
    }
  })

  // Her 15 dakikada: zamanlanmış rapor gönderimi
  cron.schedule('*/15 * * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/reports/rapor-gonder`, {
        method: 'POST',
        headers: cronHeaders,
      })
      const result = await response.json()
      // Heartbeat — her zaman log at
      await logCron('rapor_gonder', { heartbeat: true, ok: result.ok ?? true, processed: result.processed ?? 0 })
      if (result.processed > 0) {
        console.log('[CRON-RAPOR-GONDER]', new Date().toISOString(), result)
      }
    } catch (error) {
      console.error('[CRON-RAPOR-GONDER] Hata:', error)
    }
  })

  // Her 5 dakikada: personel takip bildirimi
  cron.schedule('*/5 * * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/tasks/personel-takip-bildirim`, {
        method: 'POST',
        headers: cronHeaders,
      })
      const result = await response.json()
      if (result.gonderilen > 0) {
        console.log('[CRON-PERSONEL-TAKIP]', new Date().toISOString(), result)
        await logCron('personel_takip', result)
      }
    } catch (error) {
      console.error('[CRON-PERSONEL-TAKIP] Hata:', error)
    }
  })

  // Her 1 dakikada: simülasyon motoru
  cron.schedule('*/1 * * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/simulasyon/calistir`, {
        method: 'POST',
        headers: cronHeaders,
      })
      const result = await response.json()
      // Her çalışmada logla — debug için
      console.log('[CRON-SIMULASYON]', new Date().toISOString(), JSON.stringify(result).slice(0, 300))
      // Heartbeat — her çalışmada log at
      const toplamTamamlanan = (result.sonuclar ?? []).reduce((s, r) => s + (r.tamamlanan ?? 0), 0)
      await logCron('simulasyon', { heartbeat: true, ok: result.ok ?? true, ayar_sayisi: (result.sonuclar ?? []).length, toplam_tamamlanan: toplamTamamlanan })
      // Firma bazlı log yaz (sadece iş yapıldıysa)
      for (const s of result.sonuclar ?? []) {
        if ((s.tamamlanan ?? 0) > 0 && s.firma_id) {
          await logCron('simulasyon', { tamamlanan: s.tamamlanan }, s.firma_id, s.proje_id)
        }
      }
    } catch (error) {
      console.error('[CRON-SIMULASYON] Hata:', error)
    }
  })

  // Her saat başı: sistem kontrol (5 kritik sistem taraması)
  cron.schedule('0 * * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/cron/sistem-kontrol`, {
        method: 'POST',
        headers: cronHeaders,
      })
      const result = await response.json()
      if (result.toplam_sorun > 0) {
        console.log('[CRON-SISTEM-KONTROL]', new Date().toISOString(), `${result.toplam_sorun}/${result.toplam_sistem} sistemde sorun`)
      }
      // Sonuç zaten endpoint içinde cron_log'a yazılıyor, ek logCron çağrısı gerekmez
    } catch (error) {
      console.error('[CRON-SISTEM-KONTROL] Hata:', error)
    }
  })

  // Her 30 dakikada bir: güvenlik bildirim maili
  // (Bildirilmemiş kritik/yüksek alert ve güvenlik audit olayları için email)
  cron.schedule('*/30 * * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/cron/guvenlik-mail`, {
        method: 'POST',
        headers: cronHeaders,
      })
      const result = await response.json()
      if (result.gonderildi) {
        console.log('[CRON-GUVENLIK-MAIL]', new Date().toISOString(), `${result.alert_sayisi} alert + ${result.audit_olay_sayisi} olay → ${result.alici}`)
      }
    } catch (error) {
      console.error('[CRON-GUVENLIK-MAIL] Hata:', error)
    }
  })

  // Her gece 02:00 TRT (23:00 UTC): veri bütünlük kontrolü
  cron.schedule('0 23 * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/cron/veri-butunluk-kontrol`, {
        method: 'GET',
        headers: { 'x-cron-secret': process.env.CRON_SECRET || '' },
      })
      const result = await response.json()
      console.log('[CRON-BUTUNLUK]', new Date().toISOString(), JSON.stringify(result).slice(0, 300))
      if (result.toplam > 0) {
        await logCron('veri_butunluk', { toplam: result.toplam, firma_sayisi: (result.firmalar ?? []).length })
      }
    } catch (error) {
      console.error('[CRON-BUTUNLUK] Hata:', error)
    }
  })

  // Vardiya bitişinden 30 dk SONRA: 00:30, 08:30, 16:30 TRT → 21:30, 05:30, 13:30 UTC
  // Bitmiş vardiyanın BEKLEMEDE'ye düşmüş görevlerini hedef % oranında kapatır
  // (ZAMANINDA_YAPILAMAYAN durumuyla). Aktif vardiyanın yeni ACIK görevlerine
  // dokunmaz — sadece BEKLEMEDE filtresi.
  //
  // NOT (2026-05-08): Schedule 15 → 30 dk değiştirildi. Sebebi: gun_ici_durum_guncelle
  // her dakika çalışıp ACIK→BEKLEMEDE geçişini yapıyor; vardiya bitiminde hepsi
  // tam saat üzerinde değil 16:00-16:14 arası dağılıyor. 16:15 PD çalışırken
  // bir kısmı henüz BEKLEMEDE değildi → yetim kalıp 12 saat sonra ZAMANI_GECMIS
  // oluyordu. 16:30 ile 30 dk grace verildi, tüm BEKLEMEDE geçişler tamamlanmış olur.
  cron.schedule('30 21,5,13 * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/personel-destek/calistir`, {
        method: 'POST',
        headers: cronHeaders,
      })
      const result = await response.json()
      const toplam = (result.sonuclar ?? []).reduce((acc, r) => acc + (r.tamamlanan ?? 0), 0)
      // Heartbeat — her çalışmada log at
      await logCron('personel_destek', { heartbeat: true, ok: result.ok ?? true, ayar_sayisi: (result.sonuclar ?? []).length, toplam_tamamlanan: toplam })
      // Firma bazlı log yaz (sadece iş yapıldıysa)
      for (const s of result.sonuclar ?? []) {
        if ((s.tamamlanan ?? 0) > 0 && s.firma_id) {
          await logCron('personel_destek', { tamamlanan: s.tamamlanan }, s.firma_id, s.proje_id)
        }
      }
      if (toplam > 0) console.log('[CRON-PERSONEL-DESTEK]', new Date().toISOString(), `${toplam} görev tamamlandı`)
    } catch (error) {
      console.error('[CRON-PERSONEL-DESTEK] Hata:', error)
    }
  })

  // Her gece TR 00:30 (UTC 21:30): kritik tabloların JSON+gzip yedeği
  // Supabase Storage 'backups' bucket'ına yazılır. 90 günden eski yedekler silinir.
  // Pro tier'ın built-in backup'larına ek bir katman — tablo-bazlı self-service restore sağlar.
  cron.schedule('30 21 * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/cron/yedekleme`, {
        method: 'POST',
        headers: cronHeaders,
      })
      const result = await response.json()
      console.log('[CRON-YEDEKLEME]', new Date().toISOString(),
        `${result.basarili_tablo}/${result.toplam_tablo} tablo, ${result.toplam_satir} satır, ${Math.round((result.boyut_gzip_byte ?? 0) / 1024)} KB gzip, ${result.sure_saniye} sn`)
      // Heartbeat — cron her çalıştığında log at
      await logCron('yedekleme', {
        heartbeat: true,
        ok: result.ok ?? true,
        basarili_tablo: result.basarili_tablo,
        toplam_tablo: result.toplam_tablo,
        toplam_satir: result.toplam_satir,
        boyut_gzip_byte: result.boyut_gzip_byte,
        retention_silinen_klasor: result.retention_silinen_klasor,
      })
    } catch (error) {
      console.error('[CRON-YEDEKLEME] Hata:', error)
    }
  })

  console.log('[CRON] Arşiv cron job başlatıldı (her 6 saat)')
  console.log('[CRON] Yedekleme cron başlatıldı (her gece TR 00:30)')
  console.log('[CRON] Max süre kontrol cron job başlatıldı (her 5 dakika)')
  console.log('[CRON] Rapor gönderme cron job başlatıldı (her 15 dakika)')
  console.log('[CRON] Personel takip bildirim cron job başlatıldı (her 5 dakika)')
  console.log('[CRON] Simülasyon motoru cron job başlatıldı (her 1 dakika)')
  console.log('[CRON] Personel görev desteği cron başlatıldı (vardiya bitişinden 30 dk sonra: 00:30, 08:30, 16:30 TRT)')
  console.log('[CRON] Sistem kontrol cron başlatıldı (her saat başı)')
  console.log('[CRON] Veri bütünlük kontrol cron başlatıldı (her gece 02:00 TRT)')
}

module.exports = { initArsivCron }
