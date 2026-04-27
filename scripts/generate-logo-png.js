// Renders iogys-logo PNGs via headless Chromium so Plus Jakarta Sans loads correctly.
const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')

function buildHTML({ topColor, bottomColor, scale }) {
  const W = 540 * scale
  const H = 110 * scale
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700&display=swap" rel="stylesheet">
<style>
  html,body { margin:0; padding:0; background:transparent; }
  body { width:${W}px; height:${H}px; }
  svg { display:block; width:${W}px; height:${H}px; }
</style>
</head><body>
<svg id="logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 110">
  <g transform="translate(14,21)">
    <rect width="68" height="68" rx="15" fill="#185FA5"/>
    <circle cx="14" cy="8" r="4" fill="white"/>
    <rect x="11" y="16" width="6" height="36" rx="2.5" fill="white"/>
    <circle cx="39" cy="34" r="18" fill="none" stroke="white" stroke-width="4.5"/>
  </g>
  <text x="98" y="58" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="39" letter-spacing="-1.2" font-weight="700" fill="${topColor}">İO-GYS</text>
  <text x="98" y="87" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="18" font-weight="400" fill="${bottomColor}">Akıllı Operasyon Görev Yönetim Sistemi</text>
</svg>
</body></html>`
}

const outDir = path.join(__dirname, '..', 'public', 'brand')
fs.mkdirSync(outDir, { recursive: true })

async function render(browser, opts, file) {
  const page = await browser.newPage()
  const W = 540 * opts.scale
  const H = 110 * opts.scale
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 })
  await page.setContent(buildHTML(opts), { waitUntil: 'networkidle0' })
  await page.evaluate(() => document.fonts.ready)
  const el = await page.$('#logo')
  await el.screenshot({ path: path.join(outDir, file), omitBackground: true, type: 'png' })
  await page.close()
  console.log(`✓ ${file} (${W}×${H})`)
}

;(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] })
  // light = dark text on light bg, dark = white text on dark bg
  await render(browser, { topColor: '#0F2A4A', bottomColor: '#3B6FA8', scale: 2 }, 'iogys-logo-light.png')
  await render(browser, { topColor: '#0F2A4A', bottomColor: '#3B6FA8', scale: 4 }, 'iogys-logo-light@2x.png')
  await render(browser, { topColor: '#ffffff', bottomColor: '#85B7EB', scale: 2 }, 'iogys-logo-dark.png')
  await render(browser, { topColor: '#ffffff', bottomColor: '#85B7EB', scale: 4 }, 'iogys-logo-dark@2x.png')
  await browser.close()
  console.log('\nPNG dosyaları: public/brand/')
})().catch(e => { console.error(e); process.exit(1) })
