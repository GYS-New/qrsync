import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'

function runPython(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    execFile('python3', [path.join(process.cwd(), 'scripts/xlsx_tool.py'), ...args], { maxBuffer: 1024 * 1024 * 50, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message || 'Python komutu çalıştırılamadı'))
        return
      }
      resolve(stdout)
    })
  })
}


export async function readXlsxFromBuffer(buffer: Buffer) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qrsync-xlsx-read-'))
  const filePath = path.join(dir, 'input.xlsx')
  await fs.writeFile(filePath, buffer)
  try {
    const stdout = await runPython(['read', filePath])
    return JSON.parse(stdout) as { headers: string[]; rows: Record<string, string | null>[] }
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}

export async function buildXlsxBuffer(payload: any) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'qrsync-xlsx-write-'))
  const jsonPath = path.join(dir, 'payload.json')
  const outPath = path.join(dir, 'output.xlsx')
  await fs.writeFile(jsonPath, JSON.stringify(payload), 'utf-8')
  try {
    await runPython(['write', jsonPath, outPath])
    return await fs.readFile(outPath)
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
}


