/**
 * qr-kart-node.ts — Python bağımlılığı olmadan Node.js ile QR kart üretir.
 * Türkçe karakter desteği için SVG içine Noto Sans base64 font embed edilir.
 * Paketler: qrcode (mevcut), jszip (mevcut), sharp (npm install sharp)
 */

import QRCode from 'qrcode'
import JSZip  from 'jszip'
import https  from 'https'

export interface QrKartLokasyon {
  id:     string
  tanim:  string
  qr_url: string
}

export interface QrKartAyarlar {
  qr_x?:           number
  qr_y?:           number
  qr_w?:           number
  qr_h?:           number
  metin_x?:        number
  metin_y?:        number
  balon_genislik?: number
  font_boyut?:     number
  minimal_boyut?:  number
}

export interface QrKartPayload {
  lokasyonlar: QrKartLokasyon[]
  ayarlar?:    QrKartAyarlar
}

// ── XML güvenli escape ───────────────────────────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;')
}

// ── Dosya adı güvenli hale getir ─────────────────────────────────────────────
function safeFilename(text: string): string {
  return text
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .replace(/^-+|-+$/g, '')
    || 'kart'
}

// ── Noto Sans font'u Vercel /tmp'e cache'le ──────────────────────────────────
// Türkçe dahil tüm Latin Extended karakterleri destekler.
const FONT_URL  = 'https://fonts.gstatic.com/s/notosans/v36/o-0IIpQlx3QUlC5A4PNr5TRA.woff2'
let   fontCache: Buffer | null = null

async function getFontBase64(): Promise<string> {
  if (fontCache) return fontCache.toString('base64')
  return new Promise((resolve, reject) => {
    https.get(FONT_URL, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        fontCache = Buffer.concat(chunks)
        resolve(fontCache.toString('base64'))
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

// ── Metni piksel genişliğine göre satırlara böl (tahmini) ────────────────────
// SVG render edilmeden ölçüm yapılamaz; karakter başına ortalama genişlik tahmin edilir.
function wrapText(text: string, maxPx: number, fontSizePx: number): string[] {
  const avgCharW  = fontSizePx * 0.55   // bold sans-serif için yaklaşık oran
  const charsPerLine = Math.max(1, Math.floor(maxPx / avgCharW))
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w
    if (test.length <= charsPerLine) {
      cur = test
    } else {
      if (cur) lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  return lines.length ? lines : [text]
}

// ── SVG metin overlay (font embedded) ────────────────────────────────────────
async function buildTextSvg(
  svgW:     number,
  svgH:     number,
  lines:    string[],
  cx:       number,
  cy:       number,
  fontSize: number,
  color:    string = '#000000',
): Promise<Buffer> {
  let fontB64: string
  try {
    fontB64 = await getFontBase64()
  } catch {
    fontB64 = ''   // font indirilemezse sistem fontu — Türkçe bozulabilir ama crash olmaz
  }

  const lineH   = fontSize + 6
  const totalTH = lines.length * lineH
  const startY  = cy - totalTH / 2 + fontSize / 2

  const fontFaceBlock = fontB64
    ? `<defs><style>
        @font-face {
          font-family: 'NotoSans';
          src: url('data:font/woff2;base64,${fontB64}') format('woff2');
          font-weight: bold;
        }
      </style></defs>`
    : ''

  const textEls = lines.map((line, i) => `
    <text
      x="${cx}" y="${startY + i * lineH}"
      text-anchor="middle" dominant-baseline="middle"
      font-family="NotoSans, Arial, sans-serif"
      font-weight="bold" font-size="${fontSize}" fill="${color}"
    >${esc(line)}</text>`).join('\n')

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}">
  ${fontFaceBlock}
  ${textEls}
</svg>`

  return Buffer.from(svg, 'utf-8')
}

// ── Minimal mod: beyaz kart + QR + lokasyon adı ──────────────────────────────
async function buildMinimalKartPng(
  lok:   QrKartLokasyon,
  boyut: number = 320,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default

  // QR PNG
  const qrPng = await QRCode.toBuffer(lok.qr_url, {
    type:   'png',
    width:  boyut,
    margin: 1,
    color:  { dark: '#000000', light: '#ffffff' },
  })

  const fontSize  = Math.max(14, Math.round(boyut / 14))
  const padding   = 20
  const label     = lok.tanim.toUpperCase()
  const lines     = wrapText(label, boyut, fontSize)
  const lineH     = fontSize + 6
  const textAreaH = lines.length * lineH + padding * 2
  const totalW    = boyut + padding * 2
  const totalH    = boyut + padding * 2 + textAreaH

  // Beyaz arka plan
  const bg = await sharp({
    create: { width: totalW, height: totalH, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png().toBuffer()

  // Metin SVG overlay
  const textSvg = await buildTextSvg(
    totalW, textAreaH,
    lines,
    totalW / 2,
    textAreaH / 2,
    fontSize,
  )

  const result = await sharp(bg)
    .composite([
      { input: qrPng,    left: padding, top: padding },
      { input: textSvg,  left: 0,       top: boyut + padding * 2 },
    ])
    .png()
    .toBuffer()

  return result
}

// ── Şablonlu mod: şablon üzerine QR + metin ──────────────────────────────────
async function buildSablonluKartPng(
  sablonBuffer: Buffer,
  lok:          QrKartLokasyon,
  ayarlar:      QrKartAyarlar,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default

  const qr_x  = ayarlar.qr_x  ?? 190
  const qr_y  = ayarlar.qr_y  ?? 415
  const qr_w  = ayarlar.qr_w  ?? 100
  const qr_h  = ayarlar.qr_h  ?? 110

  const metin_x    = ayarlar.metin_x       ?? 290
  const metin_y    = ayarlar.metin_y       ?? 255
  const font_boyut = ayarlar.font_boyut    ?? 24
  const balon_px   = ayarlar.balon_genislik ?? 200

  // QR PNG üret ve yeniden boyutlandır
  const qrRaw     = await QRCode.toBuffer(lok.qr_url, { type: 'png', width: qr_w * 2, margin: 1 })
  const qrResized = await sharp(qrRaw).resize(qr_w, qr_h).png().toBuffer()

  // Şablon boyutunu al
  const meta      = await sharp(sablonBuffer).metadata()
  const sw        = meta.width  ?? 500
  const sh        = meta.height ?? 700

  // Metin satırları
  const label = lok.tanim.toUpperCase()
  const lines = wrapText(label, balon_px, font_boyut)

  // Metin SVG overlay (tam şablon boyutunda, sadece metin var)
  const textSvg = await buildTextSvg(sw, sh, lines, metin_x, metin_y, font_boyut)

  const result = await sharp(sablonBuffer)
    .composite([
      { input: qrResized, left: qr_x, top: qr_y },
      { input: textSvg,   left: 0,    top: 0    },
    ])
    .png()
    .toBuffer()

  return result
}

// ── Ana fonksiyon ─────────────────────────────────────────────────────────────
export async function buildQrKartZip(
  payload:       QrKartPayload,
  sablonBuffer?: Buffer | null,
  _sablonExt?:   string,
): Promise<Buffer> {
  const zip     = new JSZip()
  const folder  = zip.folder('qr-kartlar')!
  const ayarlar = payload.ayarlar ?? {}
  const minimal = !sablonBuffer || sablonBuffer.length === 0

  let basarili = 0
  let hata     = 0
  const hatalar: string[] = []

  for (let i = 0; i < payload.lokasyonlar.length; i++) {
    const lok = payload.lokasyonlar[i]
    try {
      const imgBuf = minimal
        ? await buildMinimalKartPng(lok, ayarlar.minimal_boyut ?? 320)
        : await buildSablonluKartPng(sablonBuffer!, lok, ayarlar)

      folder.file(`${safeFilename(lok.tanim)}.png`, imgBuf)
      basarili++
    } catch (e: any) {
      hata++
      hatalar.push(`[${lok.tanim}]: ${e.message}`)
    }
  }

  folder.file('OZET.txt', [
    'QR Kart Paketi',
    `Başarılı: ${basarili}`,
    `Hata: ${hata}`,
    '',
    ...hatalar,
  ].join('\n'))

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
