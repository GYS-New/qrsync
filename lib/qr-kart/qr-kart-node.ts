/**
 * qr-kart-node.ts
 * Vercel'de Python olmadan QR kart üretir.
 * Metin için satori kullanır — Türkçe dahil tüm Unicode tam desteklenir.
 * Paketler: qrcode, jszip, sharp, satori (npm install satori)
 */

import QRCode  from 'qrcode'
import JSZip   from 'jszip'
import https   from 'https'

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
  balon_yukseklik?: number
  font_boyut?:     number
  minimal_boyut?:  number
}

export interface QrKartPayload {
  lokasyonlar: QrKartLokasyon[]
  ayarlar?:    QrKartAyarlar
}

// ── Dosya adı güvenli hale getir ─────────────────────────────────────────────
function safeFilename(text: string): string {
  return text.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').replace(/^-+|-+$/g, '') || 'kart'
}

// ── Noto Sans font cache — satori için ArrayBuffer gerekli ───────────────────
const FONT_URL = 'https://fonts.gstatic.com/s/notosans/v36/o-0IIpQlx3QUlC5A4PNr5TRA.woff2'
let fontCache: ArrayBuffer | null = null

async function getFont(): Promise<ArrayBuffer> {
  if (fontCache) return fontCache
  return new Promise((resolve, reject) => {
    https.get(FONT_URL, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        fontCache = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
        resolve(fontCache)
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

// ── Satori ile metin → SVG → sharp ile PNG ───────────────────────────────────
async function buildTextPng(
  pngW:     number,
  pngH:     number,
  text:     string,
  cx:       number,   // merkez X
  cy:       number,   // merkez Y
  balonW:   number,   // max genişlik
  balonH:   number,   // max yükseklik
  fontSize: number,
  color     = '#333333',
): Promise<Buffer> {
  const satori = (await import('satori')).default
  const sharp  = (await import('sharp')).default
  const font   = await getFont()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          display:        'flex',
          width:          `${balonW}px`,
          height:         `${balonH}px`,
          alignItems:     'center',
          justifyContent: 'center',
          textAlign:      'center',
          flexWrap:       'wrap',
          wordBreak:      'break-word',
          overflow:       'hidden',
        },
        children: [{
          type: 'span',
          props: {
            style: {
              fontFamily:  'NotoSans',
              fontWeight:  700,
              fontSize:    `${fontSize}px`,
              color,
              lineHeight:  1.3,
              textAlign:   'center',
            },
            children: text,
          },
        }],
      },
    } as any,
    {
      width:  balonW,
      height: balonH,
      fonts: [{ name: 'NotoSans', data: font, weight: 700, style: 'normal' }],
    }
  )

  // Satori SVG'sini PNG'ye çevir
  const textPng = await sharp(Buffer.from(svg)).png().toBuffer()

  // Tam görüntü boyutunda şeffaf canvas oluştur, metni cx-balonW/2, cy-balonH/2'ye yerleştir
  const left = Math.round(cx - balonW / 2)
  const top  = Math.round(cy - balonH / 2)

  const canvas = await sharp({
    create: { width: pngW, height: pngH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).png().toBuffer()

  return sharp(canvas)
    .composite([{ input: textPng, left, top }])
    .png()
    .toBuffer()
}

// ── Font boyutunu otomatik sığdır ────────────────────────────────────────────
function autoFontSize(text: string, balonW: number, balonH: number, max = 20, min = 10): number {
  const avgCharW = 0.58
  for (let fs = max; fs >= min; fs--) {
    const charsPerLine = Math.floor(balonW / (fs * avgCharW))
    const words = text.split(' ')
    let lines = 1, cur = ''
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w
      if (test.length <= charsPerLine) { cur = test }
      else { lines++; cur = w }
    }
    if (lines * (fs * 1.3) <= balonH) return fs
  }
  return min
}

// ── Minimal mod: beyaz arka plan + QR + metin ────────────────────────────────
async function buildMinimalKartPng(lok: QrKartLokasyon, boyut = 320): Promise<Buffer> {
  const sharp = (await import('sharp')).default

  const qrPng    = await QRCode.toBuffer(lok.qr_url, { type: 'png', width: boyut, margin: 1 })
  const fontSize = Math.max(14, Math.round(boyut / 14))
  const padding  = 20
  const balonW   = boyut - padding * 2
  const balonH   = fontSize * 4
  const totalW   = boyut + padding * 2
  const totalH   = boyut + padding * 2 + balonH + padding

  const bg = await sharp({
    create: { width: totalW, height: totalH, channels: 3, background: { r: 255, g: 255, b: 255 } },
  }).png().toBuffer()

  const label   = lok.tanim.toUpperCase()
  const fs      = autoFontSize(label, balonW, balonH)
  const textPng = await buildTextPng(
    totalW, totalH, label,
    totalW / 2,
    boyut + padding * 2 + balonH / 2,
    balonW, balonH, fs,
  )

  return sharp(bg)
    .composite([
      { input: qrPng,   left: padding, top: padding },
      { input: textPng, left: 0,       top: 0 },
    ])
    .png()
    .toBuffer()
}

// ── Şablonlu mod: şablon üzerine QR + metin ──────────────────────────────────
async function buildSablonluKartPng(
  sablonBuffer: Buffer,
  lok:          QrKartLokasyon,
  ayarlar:      QrKartAyarlar,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default

  // QR koordinatları — Python'daki mevcut varsayılanlarla aynı
  const qr_x = ayarlar.qr_x ?? 190
  const qr_y = ayarlar.qr_y ?? 415
  const qr_w = ayarlar.qr_w ?? 100
  const qr_h = ayarlar.qr_h ?? 110

  // Balon koordinatları — Atalian MMA şablonu (404x593px)
  const metin_x  = ayarlar.metin_x         ?? 286   // balon merkez X
  const metin_y  = ayarlar.metin_y         ?? 261   // balon merkez Y
  const balonW   = ayarlar.balon_genislik  ?? 196   // iç genişlik
  const balonH   = ayarlar.balon_yukseklik ?? 78    // iç yükseklik

  const meta = await sharp(sablonBuffer).metadata()
  const sw   = meta.width  ?? 404
  const sh   = meta.height ?? 593

  // QR
  const qrRaw     = await QRCode.toBuffer(lok.qr_url, { type: 'png', width: qr_w * 2, margin: 1 })
  const qrResized = await sharp(qrRaw).resize(qr_w, qr_h).png().toBuffer()

  // Metin
  const label = lok.tanim.toUpperCase()
  const fs    = ayarlar.font_boyut ?? autoFontSize(label, balonW, balonH)
  const textPng = await buildTextPng(sw, sh, label, metin_x, metin_y, balonW, balonH, fs)

  return sharp(sablonBuffer)
    .composite([
      { input: qrResized, left: qr_x, top: qr_y },
      { input: textPng,   left: 0,    top: 0    },
    ])
    .png()
    .toBuffer()
}

// ── Ana fonksiyon ─────────────────────────────────────────────────────────────
export async function buildQrKartZip(
  payload:       QrKartPayload,
  sablonBuffer?: Buffer | null,
): Promise<Buffer> {
  const zip     = new JSZip()
  const folder  = zip.folder('qr-kartlar')!
  const ayarlar = payload.ayarlar ?? {}
  const minimal = !sablonBuffer || sablonBuffer.length === 0
  let basarili = 0, hata = 0
  const hatalar: string[] = []

  for (const lok of payload.lokasyonlar) {
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

  folder.file('OZET.txt', [`Başarılı: ${basarili}`, `Hata: ${hata}`, '', ...hatalar].join('\n'))
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
