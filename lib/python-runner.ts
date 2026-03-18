/**
 * Platform bağımsız Python çalıştırıcı.
 * Windows'ta 'python', Linux/Mac'te 'python3' kullanır.
 * Vercel/production'da 'python3' her zaman çalışır.
 */
import { spawn } from 'child_process'

export function getPythonCmd(): string {
  return process.platform === 'win32' ? 'python' : 'python3'
}

export function runPythonScript(
  scriptPath: string,
  args: string[],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd  = getPythonCmd()
    const proc = spawn(cmd, [scriptPath, ...args])
    let stderr = ''
    proc.stderr.on('data', (c: Buffer) => { stderr += c.toString() })
    proc.stdout.on('data', (c: Buffer) => { process.stdout.write(c) })
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Python script hata kodu ${code}:\n${stderr}`))
    })
    proc.on('error', (e) => {
      const hint = process.platform === 'win32'
        ? 'Windows\'ta Python kurulu mu? Kontrol: python --version'
        : 'python3 kurulu mu? Kontrol: python3 --version'
      reject(new Error(`Python başlatılamadı: ${e.message}\n${hint}`))
    })
  })
}
