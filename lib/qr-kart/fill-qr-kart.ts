import { spawn }                        from 'child_process'
import { getPythonCmd }                 from '@/lib/python-runner'
import { writeFile, readFile, unlink }  from 'fs/promises'
import { tmpdir }                       from 'os'
import path                             from 'path'
import { randomUUID }                   from 'crypto'
import https                            from 'https'
import JSZip                            from 'jszip'

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

// ── Noto Sans font cache (Türkçe + Latin Extended) ───────────────────────────
const FONT_URL = 'https://fonts.gstatic.com/s/notosans/v36/o-0IIpQlx3QUlC5A4PNr5TRA.woff2'
let fontCache: Buffer | null = null

async function getFontBase64(): Promise<string> {
  if (fontCache) return fontCache.toString('base64')
  return new Promise((resolve, reject) => {
    https.get(FONT_URL, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        fontCache = Buffer.concat(chunks)
        resolve(fontCache!.toString('base64'))
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

// ── XML escape ───────────────────────────────────────────────────────────────
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// ── Metin satır kırma ────────────────────────────────────────────────────────
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

// ── Font boyutunu balonun içine otomatik sığdır ──────────────────────────────
function autoFontSize(text: string, balonW: number, balonH: number, max = 22, min = 10) {
  for (let fs = max; fs >= min; fs--) {
    const lines = wrapText(text, balonW, fs)
    if (lines.length * (fs + 6) <= balonH) return { fontSize: fs, lines }
  }
  return { fontSize: min, lines: wrapText(text, balonW, min) }
}

// ── Noto Sans embedded SVG metin overlay ────────────────────────────────────
async function buildTextOverlay(
  imgW:     number,
  imgH:     number,
  lines:    string[],
  cx:       number,
  cy:       number,
  fontSize: number,
  color     = '#333333',
): Promise<Buffer> {
  let fontB64 = ''
  try { fontB64 = await getFontBase64() } catch { /* sistem fontu fallback */ }

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

// ── Ana fonksiyon: Python ile QR yerleştir + Node.js ile metin ekle ──────────
export async function fillQrKartWithPython(
  sablonBuffer: Buffer,
  payload: QrKartPayload,
  sablonExt: string = 'png',
): Promise<Buffer> {
  const id      = randomUUID()
  const minimal = sablonExt === '-'

  const sablonPath  = minimal ? '-' : path.join(tmpdir(), `qrsync_sablon_${id}.${sablonExt}`)
  const payloadPath = path.join(tmpdir(), `qrsync_qrkart_payload_${id}.json`)
  const outputPath  = path.join(tmpdir(), `qrsync_qrkart_output_${id}.zip`)
  const scriptPath  = path.join(process.cwd(), 'scripts', 'fill_qr_kart.py')

  const ayarlar = payload.ayarlar ?? {}

  // Python'a skip_text=true gönder — metin Node.js tarafında eklenecek
  const pythonPayload = {
    ...payload,
    ayarlar: { ...ayarlar, skip_text: true },
  }

  if (!minimal) await writeFile(sablonPath, sablonBuffer)
  await writeFile(payloadPath, JSON.stringify(pythonPayload, null, 0), 'utf-8')

  try {
    await runPython(scriptPath, sablonPath, payloadPath, outputPath)
    const zipBuf = await readFile(outputPath)

    // Python'dan gelen ZIP'i aç, her PNG'ye metin overlay ekle
    return await addTextOverlayToZip(zipBuf, payload)
  } finally {
    await Promise.all([
      minimal ? Promise.resolve() : unlink(sablonPath).catch(() => {}),
      unlink(payloadPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ])
  }
}

// ── ZIP içindeki her PNG'ye metin overlay ekle ───────────────────────────────
async function addTextOverlayToZip(
  zipBuf:  Buffer,
  payload: QrKartPayload,
): Promise<Buffer> {
  const sharp = (await import('sharp')).default

  const inZip  = await JSZip.loadAsync(zipBuf)
  const outZip = new JSZip()
  const ayarlar = payload.ayarlar ?? {}

  // Balon ayarları — Atalian MMA şablonu varsayılanları
  const metin_x      = ayarlar.metin_x        ?? 286   // balon merkezi X
  const metin_y      = ayarlar.metin_y        ?? 261   // balon merkezi Y
  const balon_w      = ayarlar.balon_genislik ?? 196   // balonun iç genişliği
  const balon_h      = 78                              // balonun iç yüksekliği (sabit)

  // Her lokasyon için dosya adı → tanim eşlemesi
  const lokMap = new Map(payload.lokasyonlar.map(l => [
    l.tanim.toUpperCase().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').replace(/^-+|-+$/g, '') || 'kart',
    l,
  ]))

  for (const [filePath, zipEntry] of Object.entries(inZip.files)) {
    if (zipEntry.dir) continue

    const buf = Buffer.from(await zipEntry.async('arraybuffer'))

    if (!filePath.endsWith('.png')) {
      outZip.file(filePath, buf)
      continue
    }

    // Dosya adından lokasyonu bul
    const baseName = path.basename(filePath, '.png')
    const lok = lokMap.get(baseName)

    if (!lok) {
      outZip.file(filePath, buf)
      continue
    }

    try {
      const meta   = await sharp(buf).metadata()
      const imgW   = meta.width  ?? 404
      const imgH   = meta.height ?? 593
      const label  = lok.tanim.toUpperCase()

      const { fontSize, lines } = ayarlar.font_boyut
        ? { fontSize: ayarlar.font_boyut, lines: wrapText(label, balon_w, ayarlar.font_boyut) }
        : autoFontSize(label, balon_w, balon_h)

      const overlay = await buildTextOverlay(imgW, imgH, lines, metin_x, metin_y, fontSize)

      const result = await sharp(buf)
        .composite([{ input: overlay, left: 0, top: 0 }])
        .png()
        .toBuffer()

      outZip.file(filePath, result)
    } catch {
      outZip.file(filePath, buf)  // hata olursa orijinali koy
    }
  }

  return outZip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

// ── Python çalıştır ──────────────────────────────────────────────────────────
function runPython(script: string, sablon: string, payload: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getPythonCmd(), [script, sablon, payload, output])
    let stderr = ''
    proc.stderr.on('data', (c: Buffer) => { stderr += c.toString() })
    proc.stdout.on('data', (c: Buffer) => { process.stdout.write(c) })
    proc.on('close', (code) => { code === 0 ? resolve() : reject(new Error(`Script hata kodu ${code}: ${stderr}`)) })
    proc.on('error', (e) => reject(new Error(`Python başlatılamadı: ${e.message}`)))
  })
}
