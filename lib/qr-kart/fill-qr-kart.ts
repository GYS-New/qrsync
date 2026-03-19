/**
 * lib/qr-kart/fill-qr-kart.ts
 * QR kart oluşturma — Node.js (qrcode + sharp + jszip)
 * Python bağımlılığı yok.
 */
import sharp   from 'sharp'
import QRCode  from 'qrcode'
import JSZip   from 'jszip'
import https   from 'https'

export interface QrKartLokasyon {
  id:         string
  tanim:      string
  ust_tanim?: string | null
  qr_url:     string
}

export interface QrKartAyarlar {
  qr_x?:           number
  qr_y?:           number
  qr_w?:           number
  qr_h?:           number
  metin_x?:        number
  metin_y?:        number
  metin_genislik?: number
  balon_genislik?: number
  font_boyut?:     number
  ust_metin_x?:    number
  ust_metin_y?:    number
  ust_font_boyut?: number
  minimal_boyut?:  number
}

export interface QrKartPayload {
  lokasyonlar: QrKartLokasyon[]
  ayarlar?:    QrKartAyarlar
}

// ── Font cache ────────────────────────────────────────────────────────────────
const FONT_URL = 'https://fonts.gstatic.com/s/notosans/v36/o-0IIpQlx3QUlC5A4PNr5TRA.woff2'
let fontCache: Buffer | null = null

async function getFontBase64(): Promise<string> {
  if (fontCache) return fontCache.toString('base64')
  return new Promise((resolve, reject) => {
    https.get(FONT_URL, res => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => { fontCache = Buffer.concat(chunks); resolve(fontCache.toString('base64')) })
      res.on('error', reject)
    }).on('error', reject)
  })
}

// ── XML escape ────────────────────────────────────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// ── Metin satır kırma ─────────────────────────────────────────────────────────
function wrapText(text: string, maxPx: number, fontSizePx: number): string[] {
  const charsPerLine = Math.max(1, Math.floor(maxPx / (fontSizePx * 0.58)))
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w
    if (test.length <= charsPerLine) { cur = test }
    else { if (cur) lines.push(cur); cur = w }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : [text]
}

function autoFontSize(text: string, balonW: number, balonH: number, max = 22, min = 10) {
  for (let fs = max; fs >= min; fs--) {
    const lines = wrapText(text, balonW, fs)
    if (lines.length * (fs + 6) <= balonH) return { fontSize: fs, lines }
  }
  return { fontSize: min, lines: wrapText(text, balonW, min) }
}

// ── SVG metin overlay ─────────────────────────────────────────────────────────
async function buildTextOverlay(
  imgW: number, imgH: number,
  lines: string[], cx: number, cy: number,
  fontSize: number, color = '#333333',
): Promise<Buffer> {
  let fontB64 = ''
  try { fontB64 = await getFontBase64() } catch { /* fallback */ }

  const lineH  = fontSize + 6
  const totalH = lines.length * lineH
  const startY = cy - totalH / 2 + fontSize * 0.75

  const fontFace = fontB64
    ? `<defs><style>@font-face{font-family:'NotoSans';src:url('data:font/woff2;base64,${fontB64}')format('woff2');font-weight:bold;}</style></defs>`
    : ''

  const texts = lines.map((l, i) =>
    `<text x="${cx}" y="${startY + i * lineH}" text-anchor="middle"
      font-family="NotoSans,Arial,sans-serif" font-weight="bold"
      font-size="${fontSize}" fill="${color}">${esc(l)}</text>`
  ).join('\n')

  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${imgW}" height="${imgH}">
  ${fontFace}${texts}
</svg>`, 'utf-8')
}

// ── Minimal mod: şablonsuz QR + isim PNG ─────────────────────────────────────
async function buildMinimalKart(lok: QrKartLokasyon, boyut: number): Promise<Buffer> {
  const qrSize    = Math.round(boyut * 0.7)
  const padding   = 16
  const textH     = Math.round(boyut * 0.18)
  const totalH    = qrSize + padding * 2 + textH
  const totalW    = qrSize + padding * 2

  // QR PNG
  const qrBuf = await QRCode.toBuffer(lok.qr_url, {
    type: 'png', width: qrSize, margin: 1, errorCorrectionLevel: 'M',
  }) as Buffer

  // Beyaz arka plan + QR
  const canvas = await sharp({
    create: { width: totalW, height: totalH, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .png()
    .toBuffer()

  // İsim overlay
  const fontSize = Math.max(10, Math.min(16, Math.floor(totalW / (lok.tanim.length * 0.7 + 2))))
  const textOverlay = await buildTextOverlay(
    totalW, totalH,
    [lok.tanim.toUpperCase()],
    totalW / 2,
    qrSize + padding * 2 + textH / 2,
    fontSize,
  )

  return sharp(canvas)
    .composite([
      { input: qrBuf,       left: padding, top: padding },
      { input: textOverlay, left: 0,       top: 0       },
    ])
    .png()
    .toBuffer()
}

// ── Şablonlu mod: şablon üzerine QR + metin ──────────────────────────────────
async function buildSablonluKart(
  lok:          QrKartLokasyon,
  sablonBuffer: Buffer,
  ayarlar:      QrKartAyarlar,
): Promise<Buffer> {
  const meta    = await sharp(sablonBuffer).metadata()
  const imgW    = meta.width  ?? 404
  const imgH    = meta.height ?? 593

  // QR
  const qrW    = ayarlar.qr_w ?? 100
  const qrH    = ayarlar.qr_h ?? 110
  const qrX    = ayarlar.qr_x ?? 25
  const qrY    = ayarlar.qr_y ?? 20
  const qrSize = Math.min(qrW, qrH)

  const qrBuf = await QRCode.toBuffer(lok.qr_url, {
    type: 'png', width: qrSize, margin: 1, errorCorrectionLevel: 'M',
  }) as Buffer

  // Metin
  const mX      = ayarlar.metin_x        ?? 286
  const mY      = ayarlar.metin_y        ?? 261
  const balonW  = ayarlar.balon_genislik ?? 196
  const balonH  = 78
  const label   = lok.tanim.toUpperCase()

  const { fontSize, lines } = ayarlar.font_boyut
    ? { fontSize: ayarlar.font_boyut, lines: wrapText(label, balonW, ayarlar.font_boyut) }
    : autoFontSize(label, balonW, balonH)

  const textOverlay = await buildTextOverlay(imgW, imgH, lines, mX, mY, fontSize)

  const composites: sharp.OverlayOptions[] = [
    { input: qrBuf,       left: qrX, top: qrY },
    { input: textOverlay, left: 0,   top: 0   },
  ]

  // Üst metin (ust_tanim)
  if (lok.ust_tanim && ayarlar.ust_metin_x != null && ayarlar.ust_metin_y != null) {
    const uFS    = ayarlar.ust_font_boyut ?? 12
    const uLines = wrapText(lok.ust_tanim.toUpperCase(), balonW, uFS)
    const uOverlay = await buildTextOverlay(imgW, imgH, uLines, ayarlar.ust_metin_x, ayarlar.ust_metin_y, uFS)
    composites.push({ input: uOverlay, left: 0, top: 0 })
  }

  return sharp(sablonBuffer).composite(composites).png().toBuffer()
}

// ── Dosya adı oluştur ─────────────────────────────────────────────────────────
function safeFileName(tanim: string): string {
  return tanim
    .toUpperCase()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .replace(/^-+|-+$/g, '') || 'kart'
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * QR kartlarını oluşturur ve ZIP buffer döndürür.
 * - sablonExt === '-' → minimal mod (şablonsuz)
 * - sablonBuffer geçerli PNG ise → şablonlu mod
 */
export async function fillQrKartWithPython(
  sablonBuffer: Buffer,
  payload:      QrKartPayload,
  sablonExt:    string = 'png',
): Promise<Buffer> {
  const minimal  = sablonExt === '-'
  const ayarlar  = payload.ayarlar ?? {}
  const boyut    = ayarlar.minimal_boyut ?? 320
  const zip      = new JSZip()

  await Promise.all(
    payload.lokasyonlar.map(async lok => {
      try {
        const png = minimal
          ? await buildMinimalKart(lok, boyut)
          : await buildSablonluKart(lok, sablonBuffer, ayarlar)
        zip.file(`${safeFileName(lok.tanim)}.png`, png)
      } catch (e) {
        // Hata olan lokasyonu atla
        console.error(`QR kart oluşturulamadı: ${lok.tanim}`, e)
      }
    })
  )

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
