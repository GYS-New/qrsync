const cron = require('node-cron')

let cronJobStarted = false

function initArsivCron() {
  if (cronJobStarted) return
  cronJobStarted = true

  // Her 6 saatte: 00:00, 06:00, 12:00, 18:00
  cron.schedule('0 */6 * * *', async () => {
    try {
      const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

      const response = await fetch(`${baseUrl}/api/tasks/arsivle`, {
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

  console.log('[CRON] Arşiv cron job başlatıldı (her 6 saat)')
}

module.exports = { initArsivCron }
