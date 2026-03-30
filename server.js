/**
 * Railway Custom Server
 * Runs cron job alongside Next.js
 *
 * Start: node server.js
 */

const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const { initArsivCron } = require('./lib/cron/job')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()
const PORT = process.env.PORT || 3000

app.prepare().then(() => {
  // Başlat cron job
  initArsivCron()

  createServer((req, res) => {
    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  }).listen(PORT, (err) => {
    if (err) throw err
    console.log(`> Server başlatıldı: http://localhost:${PORT}`)
    console.log(`> Cron job aktif: Her 6 saat`)
  })
})
