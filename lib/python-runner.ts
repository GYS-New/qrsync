/**
 * Platform bağımsız Python çalıştırıcı.
 * Windows'ta 'python', Linux/Mac'te 'python3' kullanır.
 * Vercel/production'da 'python3' her zaman çalışır.
 */
import { spawn } from 'child_process'

export function getPythonCmd(): string {
  if (process.platform === 'win32') return 'python'
  // Railway/Nix ortamında python3.11 olabilir, python3 symlink yoksa dene
  const { execSync } = require('child_process')
  try { execSync('which python3', { stdio: 'ignore' }); return 'python3' } catch {}
  try { execSync('which python3.11', { stdio: 'ignore' }); return 'python3.11' } catch {}
  try { execSync('which python311', { stdio: 'ignore' }); return 'python311' } catch {}
  return 'python3'
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
