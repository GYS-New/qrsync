import { spawn } from "child_process"
import { getPythonCmd } from "@/lib/python-runner"
import { writeFile, readFile, unlink } from "fs/promises"
import { tmpdir } from "os"
import path from "path"
import { randomUUID } from "crypto"
import { GenelRaporData } from "./genel-rapor-data"

/**
 * Python openpyxl script'ini kullanarak Excel şablonunu doldurur.
 * Bu yaklaşım ExcelJS'in aksine grafikleri, merge yapısını ve
 * tüm formatları bozulmadan korur.
 */
export async function fillGenelRaporWithPython(data: GenelRaporData): Promise<Buffer> {
  const id           = randomUUID()
  const payloadPath  = path.join(tmpdir(), `qrsync_payload_${id}.json`)
  const outputPath   = path.join(tmpdir(), `qrsync_output_${id}.xlsx`)
  const templatePath = path.join(process.cwd(), "public", "report-templates", "QR-SYNC_Genel_Rapor.xlsx")
  const scriptPath   = path.join(process.cwd(), "scripts", "fill_genel_rapor.py")

  // Payload'ı temp dosyaya yaz
  await writeFile(payloadPath, JSON.stringify(data, null, 0), "utf-8")

  try {
    // Python script'i çalıştır
    await runPython(scriptPath, templatePath, payloadPath, outputPath)

    // Çıktıyı oku
    const buffer = await readFile(outputPath)
    return buffer
  } finally {
    // Temp dosyaları temizle
    await unlink(payloadPath).catch(() => {})
    await unlink(outputPath).catch(() => {})
  }
}

function runPython(
  scriptPath: string,
  templatePath: string,
  payloadPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getPythonCmd(), [scriptPath, templatePath, payloadPath, outputPath])

    let stderr = ""
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Python script hata ile çıktı (kod ${code}): ${stderr}`))
      }
    })

    proc.on("error", (err) => {
      reject(new Error(`Python başlatılamadı: ${err.message}`))
    })
  })
}
