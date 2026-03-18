/**
 * qr-kart-node.ts
 * Python'a gerek duymadan Node.js ile QR kart üretir.
 * Minimal mod: beyaz arka plan + QR + lokasyon adı (PNG)
 * Şablonlu mod: şablon PNG üzerine QR + metin yerleştirir (sharp gerekli)
 *
 * Kullanılan paketler: qrcode (mevcut), jszip (mevcut), sharp (eklenmeli)
 */

import QRCode from 'qrcode'
import JSZip  from 'jszip'

export interface QrKartLokasyon {
  id:       string
  tanim:    string
  qr_url:   string
}

export interface QrKartAyarlar {
  qr_x?:          number
  qr_y?:          number
  qr_w?:          number
  qr_h?:          number
  metin_x?:       number
  metin_y?:       number
  balon_genislik?: number
  font_boyut?:    number
  minimal_boyut?: number
}

export interface QrKartPayload {
  lokasyonlar: QrKartLokasyon[]
  ayarlar?:    QrKartAyarlar
}

// Dosya adı için güvenli string
function safeFilename(text: string): string {
  return text
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .replace(/^-+|-+$/g, '')
    || 'kart'
}

/**
 * Minimal mod: saf SVG → PNG (sharp olmadan da çalışır)
 * Her lokasyon için beyaz kart + QR + lokasyon adı üretir.
 */
async function buildMinimalKartPng(
  lok: QrKartLokasyon,
  boyut: number = 320,
): Promise<Buffer> {
  // QR'ı SVG olarak üret
  const qrSvg = await QRCode.toString(lok.qr_url, {
    type: 'svg',
    width: boyut,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  })

  const fontSize  = Math.max(14, Math.round(boyut / 16))
  const padding   = 16
  const textAreaH = fontSize * 3 + padding
  const totalW    = boyut + padding * 2
  const totalH    = boyut + padding * 2 + textAreaH

  const label = lok.tanim.toUpperCase()

  // Tüm kart SVG olarak — sharp olmadan da tarayıcı açabilir
  const cardSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">
  <rect width="${totalW}" height="${totalH}" fill="white"/>
  <!-- QR -->
  <image x="${padding}" y="${padding}" width="${boyut}" height="${boyut}"
    xlink:href="data:image/svg+xml;base64,${Buffer.from(qrSvg).toString('base64')}"/>
  <!-- Lokasyon adı -->
  <text
    x="${totalW / 2}"
    y="${boyut + padding * 2 + fontSize}"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Arial, Helvetica, sans-serif"
    font-weight="bold"
    font-size="${fontSize}"
    fill="#000000"
  >${escapeXml(label)}</text>
</svg>`

  // sharp varsa PNG'ye çevir, yoksa SVG buffer döndür
  try {
    const sharp = (await import('sharp')).default
    return await sharp(Buffer.from(cardSvg)).png().toBuffer()
  } catch {
    // sharp yoksa SVG döndür — zip içinde .svg uzantısıyla kaydedilecek
    return Buffer.from(cardSvg)
  }
}

/**
 * Şablonlu mod: şablon PNG üzerine QR + metin yerleştirir.
 * sharp zorunlu.
 */
async function buildSablonluKartPng(
  sablonBuffer: Buffer,
  lok: QrKartLokasyon,
  ayarlar: QrKartAyarlar,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default

  const qr_x   = ayarlar.qr_x   ?? 190
  const qr_y   = ayarlar.qr_y   ?? 415
  const qr_w   = ayarlar.qr_w   ?? 100
  const qr_h   = ayarlar.qr_h   ?? 110

  const metin_x      = ayarlar.metin_x       ?? 290
  const metin_y      = ayarlar.metin_y       ?? 255
  const font_boyut   = ayarlar.font_boyut    ?? 24
  const balon_px     = ayarlar.balon_genislik ?? 200

  // QR PNG üret
  const qrPng = await QRCode.toBuffer(lok.qr_url, {
    type: 'png',
    width: qr_w,
    margin: 1,
    color: { dark: '#000000', light: '#ffffff' },
  })
  const qrResized = await sharp(qrPng).resize(qr_w, qr_h).png().toBuffer()

  // Metni satırlara böl (basit karakter bazlı)
  const label     = lok.tanim.toUpperCase()
  const charPerLine = Math.max(1, Math.floor(balon_px / (font_boyut * 0.6)))
  const words = label.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if ((cur + ' ' + w).trim().length <= charPerLine) {
      cur = (cur + ' ' + w).trim()
    } else {
      if (cur) lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)

  const lineHeight = font_boyut + 6
  const textH      = lines.length * lineHeight

  // Metin SVG overlay
  const textSvgLines = lines.map((line, i) => `
    <text
      x="${metin_x}"
      y="${metin_y - textH / 2 + i * lineHeight + font_boyut / 2}"
      text-anchor="middle"
      dominant-baseline="middle"
      font-family="Arial, Helvetica, sans-serif"
      font-weight="bold"
      font-size="${font_boyut}"
      fill="#000000"
    >${escapeXml(line)}</text>`).join('')

  const { width: sw = 500, height: sh = 700 } = await sharp(sablonBuffer).metadata()

  const textSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sw}" height="${sh}">
    ${textSvgLines}
  </svg>`

  const result = await sharp(sablonBuffer)
    .composite([
      { input: qrResized,              left: qr_x,    top: qr_y },
      { input: Buffer.from(textSvg),   left: 0,       top: 0    },
    ])
    .png()
    .toBuffer()

  return result
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;')
}

/**
 * Ana fonksiyon — ZIP buffer döndürür.
 * sablonBuffer boş / null ise minimal mod kullanılır.
 */
export async function buildQrKartZip(
  payload: QrKartPayload,
  sablonBuffer?: Buffer | null,
  sablonExt?: string,
): Promise<Buffer> {
  const zip      = new JSZip()
  const folder   = zip.folder('qr-kartlar')!
  const ayarlar  = payload.ayarlar ?? {}
  const minimal  = !sablonBuffer || sablonBuffer.length === 0

  let basarili = 0
  let hata     = 0
  const hatalar: string[] = []

  for (let i = 0; i < payload.lokasyonlar.length; i++) {
    const lok = payload.lokasyonlar[i]
    try {
      let imgBuf: Buffer
      let ext: string

      if (minimal) {
        imgBuf = await buildMinimalKartPng(lok, ayarlar.minimal_boyut ?? 320)
        // sharp yoksa SVG gelir
        ext = imgBuf.toString('utf8', 0, 5).startsWith('<?xml') ? 'svg' : 'png'
      } else {
        imgBuf = await buildSablonluKartPng(sablonBuffer!, lok, ayarlar)
        ext = 'png'
      }

      const dosyaAdi = `${safeFilename(lok.tanim)}.${ext}`
      folder.file(dosyaAdi, imgBuf)
      basarili++
    } catch (e: any) {
      hata++
      hatalar.push(`[${lok.tanim}]: ${e.message}`)
    }
  }

  const ozet = [
    'QR Kart Paketi',
    `Başarılı: ${basarili}`,
    `Hata: ${hata}`,
    '',
    ...hatalar,
  ].join('\n')

  folder.file('OZET.txt', ozet)

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
