import { spawn }              from 'child_process'
import { getPythonCmd }        from '@/lib/python-runner'
import { writeFile, readFile, unlink } from 'fs/promises'
import { tmpdir }              from 'os'
import path                    from 'path'
import { randomUUID }          from 'crypto'

export interface QrKartLokasyon {
  id:        string
  tanim:     string
  ust_tanim?: string | null
  qr_url:    string
}

export interface QrKartAyarlar {
  qr_x?:           number
  qr_y?:           number
  qr_w?:           number
  qr_h?:           number
  metin_x?:        number
  metin_y?:        number
  metin_genislik?: number
  font_boyut?:     number
  ust_metin_x?:    number
  ust_metin_y?:    number
  ust_font_boyut?: number
  minimal_boyut?:  number   // şablonsuz mod için QR boyutu
}

export interface QrKartPayload {
  lokasyonlar: QrKartLokasyon[]
  ayarlar?:    QrKartAyarlar
}

export async function fillQrKartWithPython(
  sablonBuffer: Buffer,
  payload: QrKartPayload,
  sablonExt: string = 'png',
): Promise<Buffer> {
  const id          = randomUUID()
  const minimal     = sablonExt === '-'
  const sablonPath  = minimal ? '-' : path.join(tmpdir(), `qrsync_sablon_${id}.${sablonExt}`)
  const payloadPath = path.join(tmpdir(), `qrsync_qrkart_payload_${id}.json`)
  const outputPath  = path.join(tmpdir(), `qrsync_qrkart_output_${id}.zip`)
  const scriptPath  = path.join(process.cwd(), 'scripts', 'fill_qr_kart.py')

  if (!minimal) await writeFile(sablonPath, sablonBuffer)
  await writeFile(payloadPath, JSON.stringify(payload, null, 0), 'utf-8')

  try {
    await runPython(scriptPath, sablonPath, payloadPath, outputPath)
    return await readFile(outputPath)
  } finally {
    await Promise.all([
      minimal ? Promise.resolve() : unlink(sablonPath).catch(() => {}),
      unlink(payloadPath).catch(() => {}),
      unlink(outputPath).catch(() => {}),
    ])
  }
}

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
