// Generates iogys-logo.png from inline SVG (matches landing.html nav logo)
const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

// Light variant (transparent background) — text white, suitable for dark BG
const svgDark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 110">
  <g transform="translate(14,21)">
    <rect width="68" height="68" rx="15" fill="#185FA5"/>
    <circle cx="14" cy="8" r="4" fill="white"/>
    <rect x="11" y="16" width="6" height="36" rx="2.5" fill="white"/>
    <circle cx="39" cy="34" r="18" fill="none" stroke="white" stroke-width="4.5"/>
  </g>
  <text x="98" y="58" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="39" letter-spacing="-1.2" font-weight="700" fill="#ffffff">İO-GYS</text>
  <text x="98" y="87" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="18" font-weight="400" fill="#85B7EB">Akıllı Operasyon Görev Yönetim Sistemi</text>
</svg>`

// Dark variant (transparent background) — text dark, for light BG
const svgLight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 540 110">
  <g transform="translate(14,21)">
    <rect width="68" height="68" rx="15" fill="#185FA5"/>
    <circle cx="14" cy="8" r="4" fill="white"/>
    <rect x="11" y="16" width="6" height="36" rx="2.5" fill="white"/>
    <circle cx="39" cy="34" r="18" fill="none" stroke="white" stroke-width="4.5"/>
  </g>
  <text x="98" y="58" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="39" letter-spacing="-1.2" font-weight="700" fill="#0F2A4A">İO-GYS</text>
  <text x="98" y="87" font-family="'Plus Jakarta Sans', system-ui, sans-serif" font-size="18" font-weight="400" fill="#3B6FA8">Akıllı Operasyon Görev Yönetim Sistemi</text>
</svg>`

const outDir = path.join(__dirname, '..', 'public', 'brand')
fs.mkdirSync(outDir, { recursive: true })

async function render(svg, name, height) {
  const buf = Buffer.from(svg)
  // 540×110 viewBox; scale by height
  const scale = height / 110
  const width = Math.round(540 * scale)
  await sharp(buf, { density: 600 })
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(outDir, name))
  console.log(`✓ ${name} (${width}×${height})`)
}

;(async () => {
  await render(svgDark, 'iogys-logo-dark.png', 220)   // for dark backgrounds
  await render(svgLight, 'iogys-logo-light.png', 220) // for light backgrounds
  await render(svgDark, 'iogys-logo-dark@2x.png', 440)
  await render(svgLight, 'iogys-logo-light@2x.png', 440)
  console.log('\nPNG dosyaları: public/brand/')
})().catch(e => { console.error(e); process.exit(1) })
