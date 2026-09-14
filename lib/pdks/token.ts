/**
 * PDKS rotasyon token uretimi + dogrulama.
 *
 * Format (tabletin QR'inde gorunur):
 *   `${payload_b64}.${sig_b64}`
 *
 *   payload_b64 = base64url(`${terminal_id}|${pencere_no}|${exp_ms}`)
 *   sig_b64     = base64url(HMAC-SHA256(SECRET, payload_raw)).slice(0, 22)
 *                  ~128 bit entropi
 *
 * URL formu: https://iogys.com.tr/mesai/tarat/<token>
 *
 * Neden tablosuz (HMAC)?
 *   - Her 30 sn'de 1 token/terminal => gunde 2880 satir/terminal. 10 terminal
 *     bir yilda 10.5M satir. Cron ile silmek yerine hic kaydetmemek daha temiz.
 *   - Sunucu tek kaynak: SECRET. Rotasyon patlamiyorsa DB'ye baski yok.
 *   - Kullanilmis token izini pdks_kullanilan_tokenlar tutar (~10 dk retention).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const SECRET = process.env.PDKS_HMAC_SECRET

// Pencere/paket sabitleri — spec'te 30 sn / 30 dk. Env'den override edilebilir.
export const PENCERE_SANIYE = Number(process.env.PDKS_PENCERE_SANIYE ?? 30)
export const PAKET_DAKIKA   = Number(process.env.PDKS_PAKET_DAKIKA ?? 30)

function requireSecret(): string {
  if (!SECRET || SECRET.length < 32) {
    throw new Error('PDKS_HMAC_SECRET tanimli degil (en az 32 karakter olmali)')
  }
  return SECRET
}

function b64urlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(input: string): Buffer {
  const s = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s + pad, 'base64')
}

/** Bir pencere_no icin token uret. */
export function tokenUret(terminalId: string, pencereNo: number, expMs: number): string {
  const secret = requireSecret()
  const payloadRaw = `${terminalId}|${pencereNo}|${expMs}`
  const sigFull = createHmac('sha256', secret).update(payloadRaw).digest()
  const sig = b64urlEncode(sigFull).slice(0, 22)  // ~128 bit
  return `${b64urlEncode(payloadRaw)}.${sig}`
}

export type CozulenToken = {
  terminalId: string
  pencereNo: number
  expMs: number
}

/**
 * Token'i dogrula ve icerigini cikar.
 *
 * Basari: { ok: true, ... }
 * Hata:   { ok: false, code }
 */
export type TokenCozumSonuc =
  | { ok: true; icerik: CozulenToken }
  | { ok: false; code: 'MALFORMED' | 'IMZA_GECERSIZ' }

export function tokenCoz(token: string): TokenCozumSonuc {
  try {
    const secret = requireSecret()
    const parts = token.split('.')
    if (parts.length !== 2) return { ok: false, code: 'MALFORMED' }

    const [payloadB64, sigB64] = parts
    const payloadRaw = b64urlDecode(payloadB64).toString('utf8')
    const beklenenSigFull = createHmac('sha256', secret).update(payloadRaw).digest()
    const beklenenSig = b64urlEncode(beklenenSigFull).slice(0, 22)

    // timing-safe compare
    const a = Buffer.from(sigB64, 'utf8')
    const b = Buffer.from(beklenenSig, 'utf8')
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, code: 'IMZA_GECERSIZ' }
    }

    const [terminalId, pencereNoStr, expMsStr] = payloadRaw.split('|')
    if (!terminalId || !pencereNoStr || !expMsStr) return { ok: false, code: 'MALFORMED' }

    return {
      ok: true,
      icerik: {
        terminalId,
        pencereNo: Number(pencereNoStr),
        expMs: Number(expMsStr),
      },
    }
  } catch {
    return { ok: false, code: 'MALFORMED' }
  }
}

/** Zaman (ms) icin ait oldugu pencere numarasi. */
export function pencereNoBul(zamanMs: number): number {
  return Math.floor(zamanMs / (PENCERE_SANIYE * 1000))
}

/** Rotasyon token'ini string olarak taniyalim (tokenler `.` icerir). */
export function rotasyonTokenMi(token: string): boolean {
  const parts = token.split('.')
  return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0
}

/**
 * Yeni terminal_key uret: PDKS-XXXX-XXXX (okunabilir, karisik base32).
 * I/O/0/1 gibi karisan karakterler cikarilir.
 */
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export function terminalKeyUret(): string {
  const rand = (n: number) => Array.from({ length: n }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('')
  return `PDKS-${rand(4)}-${rand(4)}`
}

/** Uzun omurlu terminal_token (opak, 32 byte hex) uret. */
export function terminalTokenUret(): string {
  const bytes = require('node:crypto').randomBytes(32)
  return bytes.toString('hex')
}

/** SHA-256 hash — kullanilan token hash'lemek icin. */
export function sha256(input: string): string {
  return require('node:crypto').createHash('sha256').update(input).digest('hex')
}
