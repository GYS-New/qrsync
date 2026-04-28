/**
 * qr-kart-node.ts
 * Vercel'de Python olmadan QR kart üretir.
 * Metin için satori kullanır — Türkçe dahil tüm Unicode tam desteklenir.
 * Paketler: qrcode, jszip, sharp, satori (npm install satori)
 */

import QRCode  from 'qrcode'
import JSZip   from 'jszip'
import { getInterBoldFont } from './inter-bold-font'

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
// Inter Bold TTF — base64 gömülü modülden alınır

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
  const font   = getInterBoldFont()

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
      fonts: [{ name: 'NotoSans', data: font, weight: 700, style: 'normal' as const }],
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
// Standart koordinat grid'i (yeni şablon her boyutta yüklenirse buna ölçeklenir)
const STD_W = 404
const STD_H = 593

async function buildSablonluKartPng(
  sablonBuffer: Buffer,
  lok:          QrKartLokasyon,
  ayarlar:      QrKartAyarlar,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default

  // Şablonu standart 404×593 grid'ine ölçekle — koordinatlar bu grid'de tanımlı
  const sablonStd = await sharp(sablonBuffer)
    .resize(STD_W, STD_H, { fit: 'fill' })
    .png()
    .toBuffer()

  // QR koordinatları — Atalian Geri Bildirim şablonu (404×593 grid)
  const qr_x = ayarlar.qr_x ?? 129
  const qr_y = ayarlar.qr_y ?? 311
  const qr_w = ayarlar.qr_w ?? 146
  const qr_h = ayarlar.qr_h ?? 146

  // Balon koordinatları — alt "Alan Adı / Lokasyon" kutusu
  const metin_x  = ayarlar.metin_x         ?? 202   // balon merkez X
  const metin_y  = ayarlar.metin_y         ?? 529   // balon merkez Y
  const balonW   = ayarlar.balon_genislik  ?? 300   // iç genişlik
  const balonH   = ayarlar.balon_yukseklik ?? 30    // iç yükseklik

  // QR
  const qrRaw     = await QRCode.toBuffer(lok.qr_url, { type: 'png', width: qr_w * 2, margin: 1 })
  const qrResized = await sharp(qrRaw).resize(qr_w, qr_h).png().toBuffer()

  // Metin — uzun lokasyon adları için sabit fs=16
  const label = lok.tanim.toUpperCase()
  const fs    = ayarlar.font_boyut ?? 16
  const textPng = await buildTextPng(STD_W, STD_H, label, metin_x, metin_y, balonW, balonH, fs)

  // Şablondaki "Alan Adı / Lokasyon" placeholder'ını örten beyaz dolgu
  // Boyut: kutu içinde kal, orange border'a değme (kutu ~y=512-553)
  const placeholderCover = await sharp({
    create: {
      width: 280, height: 20, channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  }).png().toBuffer()

  return sharp(sablonStd)
    .composite([
      { input: placeholderCover, left: 62, top: 519 }, // dolgu y=519-539, alt border'a ~10px boşluk
      { input: qrResized,        left: qr_x, top: qr_y },
      { input: textPng,          left: 0,    top: 0    },
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
