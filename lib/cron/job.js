const cron = require('node-cron')

let cronJobStarted = false

function initArsivCron() {
  if (cronJobStarted) return
  cronJobStarted = true

  const getBaseUrl = () =>
    process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

  // Her 6 saatte: 00:00, 06:00, 12:00, 18:00
  cron.schedule('0 */6 * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/tasks/arsivle`, {
        method: 'POST',
        headers: {
          'x-cron-token': process.env.CRON_SECRET || '',
          'Content-Type': 'application/json',
        },
      })
      const result = await response.json()
      console.log('[CRON-ARSIVLE]', new Date().toISOString(), result)
    } catch (error) {
      console.error('[CRON-ARSIVLE] Hata:', error)
    }
  })

  // Her 5 dakikada: max süre kontrolü — ISLEMDE görevler süre dolunca IPTAL edilir
  cron.schedule('*/5 * * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/tasks/max-sure-kontrol`, {
        method: 'POST',
        headers: {
          'x-cron-token': process.env.CRON_SECRET || '',
          'Content-Type': 'application/json',
        },
      })
      const result = await response.json()
      if (result.gorevler_iptal > 0 || result.canli_gorevler_iptal > 0) {
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
        headers: {
          'x-cron-token': process.env.CRON_SECRET || '',
          'Content-Type': 'application/json',
        },
      })
      const result = await response.json()
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
        headers: {
          'x-cron-token': process.env.CRON_SECRET || '',
          'Content-Type': 'application/json',
        },
      })
      const result = await response.json()
      if (result.gonderilen > 0) {
        console.log('[CRON-PERSONEL-TAKIP]', new Date().toISOString(), result)
      }
    } catch (error) {
      console.error('[CRON-PERSONEL-TAKIP] Hata:', error)
    }
  })

  // Her 10 dakikada: simülasyon motoru
  cron.schedule('*/10 * * * *', async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/simulasyon/calistir`, {
        method: 'POST',
        headers: {
          'x-cron-token': process.env.CRON_SECRET || '',
          'Content-Type': 'application/json',
        },
      })
      const result = await response.json()
      const toplam = (result.sonuclar ?? []).reduce((s, r) => s + (r.tamamlanan ?? 0), 0)
      if (toplam > 0) {
        console.log('[CRON-SIMULASYON]', new Date().toISOString(), `${toplam} görev simüle edildi`, result.sonuclar)
      }
    } catch (error) {
      console.error('[CRON-SIMULASYON] Hata:', error)
    }
  })

  console.log('[CRON] Arşiv cron job başlatıldı (her 6 saat)')
  console.log('[CRON] Max süre kontrol cron job başlatıldı (her 5 dakika)')
  console.log('[CRON] Rapor gönderme cron job başlatıldı (her 15 dakika)')
  console.log('[CRON] Personel takip bildirim cron job başlatıldı (her 5 dakika)')
  console.log('[CRON] Simülasyon motoru cron job başlatıldı (her 10 dakika)')
}

module.exports = { initArsivCron }
