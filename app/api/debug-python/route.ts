import { NextResponse } from 'next/server'
import { execSync } from 'child_process'

export const dynamic = 'force-dynamic'

export async function GET() {
  const checks: Record<string, string> = {}

  for (const cmd of ['python3', 'python3.11', 'python3.12', 'python311', 'python', 'which python3']) {
    try {
      const out = execSync(`which ${cmd} 2>/dev/null || echo "not found"`, { encoding: 'utf8' }).trim()
      checks[cmd] = out
    } catch {
      checks[cmd] = 'error'
    }
  }

  // PATH içeriği
  checks['PATH'] = process.env.PATH ?? 'unknown'

  // /usr/bin ve /usr/local/bin içindeki python'lar
  try {
    checks['usr_bin'] = execSync('ls /usr/bin/python* 2>/dev/null || echo "yok"', { encoding: 'utf8' }).trim()
    checks['usr_local_bin'] = execSync('ls /usr/local/bin/python* 2>/dev/null || echo "yok"', { encoding: 'utf8' }).trim()
    checks['nix_bin'] = execSync('ls /nix/store/*/bin/python* 2>/dev/null | head -5 || echo "yok"', { encoding: 'utf8' }).trim()
  } catch {}

  return NextResponse.json(checks)
}
