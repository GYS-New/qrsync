const cron = require('node-cron')

let cronJobStarted = false

function initArsivCron() {
  if (cronJobStarted) return
  cronJobStarted = true

  const getBaseUrl = () =>
    process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

  const cronHeaders = {
    'x-cron-token': process.env.CRON_SECRET || '',
    'Content-Type': 'application/json',
  }

  // Cron log kaydet
  async function logCron(tip, sonuc) {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (!supabaseUrl || !supabaseKey) return
      await fetch(`${supabaseUrl}/rest/v1/cron_log`, {
        method: 'POST',
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ tip, sonuc }),
      })
      // Eski logları temizle (24 saatten eski)
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      await fetch(`${supabaseUrl}/rest/v1/cron_log?tarih=lt.${cutoff}`, {
        method: 'DELETE',
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      })
    } catch {}
  }

  // Her 6 saatte: arşivleme
  cron.schedule('0 */6 * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/tasks/arsivle`, { method: 'POST', headers: cronHeaders })
      const result = await response.json()
      console.log('[CRON-ARSIVLE]', new Date().toISOString(), result)
      await logCron('arsivleme', result)
    } catch (error) {
      console.error('[CRON-ARSIVLE] Hata:', error)
      await logCron('arsivleme', { hata: String(error) })
    }
  })

  // Her 5 dakikada: max süre kontrolü
  cron.schedule('*/5 * * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/tasks/max-sure-kontrol`, { method: 'POST', headers: cronHeaders })
      const result = await response.json()
      if (result.gorevler_iptal > 0 || result.canli_gorevler_iptal > 0) {
        console.log('[CRON-MAX-SURE]', new Date().toISOString(), result)
        await logCron('max_sure', result)
      }
    } catch (error) {
      console.error('[CRON-MAX-SURE] Hata:', error)
    }
  })

  // Her 15 dakikada: rapor gönderimi
  cron.schedule('*/15 * * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/reports/rapor-gonder`, { method: 'POST', headers: cronHeaders })
      const result = await response.json()
      if (result.processed > 0) {
        console.log('[CRON-RAPOR-GONDER]', new Date().toISOString(), result)
        await logCron('rapor_gonder', result)
      }
    } catch (error) {
      console.error('[CRON-RAPOR-GONDER] Hata:', error)
    }
  })

  // Her 5 dakikada: personel takip bildirimi
  cron.schedule('*/5 * * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/tasks/personel-takip-bildirim`, { method: 'POST', headers: cronHeaders })
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
      const response = await fetch(`${getBaseUrl()}/api/simulasyon/calistir`, { method: 'POST', headers: cronHeaders })
      const result = await response.json()
      const toplam = (result.sonuclar ?? []).reduce((s, r) => s + (r.tamamlanan ?? 0), 0)
      if (toplam > 0) {
        console.log('[CRON-SIMULASYON]', new Date().toISOString(), `${toplam} görev simüle edildi`, result.sonuclar)
        await logCron('simulasyon', { tamamlanan: toplam })
      }
    } catch (error) {
      console.error('[CRON-SIMULASYON] Hata:', error)
    }
  })

  // Vardiya sonları: 08:00, 16:00, 00:00 TRT → 05:00, 13:00, 21:00 UTC
  cron.schedule('0 5,13,21 * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/personel-destek/calistir`, { method: 'POST', headers: cronHeaders })
      const result = await response.json()
      const toplam = (result.sonuclar ?? []).reduce((s, r) => s + (r.tamamlanan ?? 0), 0)
      if (toplam > 0) {
        console.log('[CRON-PERSONEL-DESTEK]', new Date().toISOString(), `${toplam} görev tamamlandı`, result.sonuclar)
        await logCron('personel_destek', result)
      }
    } catch (error) {
      console.error('[CRON-PERSONEL-DESTEK] Hata:', error)
    }
  })

  console.log('[CRON] Arşiv cron job başlatıldı (her 6 saat)')
  console.log('[CRON] Simülasyon motoru cron job başlatıldı (her 1 dakika)')
  console.log('[CRON] Max süre kontrol cron job başlatıldı (her 5 dakika)')
  console.log('[CRON] Rapor gönderme cron job başlatıldı (her 15 dakika)')
  console.log('[CRON] Personel takip bildirim cron job başlatıldı (her 5 dakika)')
  console.log('[CRON] Personel görev desteği cron başlatıldı (vardiya sonları: 08:00, 16:00, 00:00 TRT)')
}

module.exports = { initArsivCron }
