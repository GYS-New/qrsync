/**
 * PDKS rotasyon token uretimi + dogrulama.
 *
 * TOKEN FORMATI (~42 karakter — kisa versiyon, 14.09.2026):
 *   `${payload_b64}.${sig_b64}`
 *
 *   payload_bytes = terminal_uuid (16 bayt) + pencere_no (uint32 BE, 4 bayt) = 20 bayt
 *   payload_b64   = base64url(payload_bytes)                     → 27 karakter
 *   sig_bytes     = HMAC-SHA256(SECRET, payload_bytes).slice(0,10) → 80 bit
 *   sig_b64       = base64url(sig_bytes)                          → 14 karakter
 *   token         = payload_b64 + "." + sig_b64                   → 42 karakter ✓
 *
 * exp_ms artik payload'da YOK — pencere_no + PENCERE_SANIYE'den turetiliyor.
 *
 * URL formu: https://iogys.com.tr/mesai/tarat/<token>
 *
 * SAHA APK'SI KORUMASI: mobil ekip decoder'da 50+ karakterli non-UUID
 * QR'lari bozuk sayip sessizce yok sayıyor (S24 Ultra 4K stream fix, v1.0.26).
 * 122+ cihazda APK dağıtımı yerine token'i 45 karakter altında tutmak gerekiyordu.
 *
 * Neden tablosuz (HMAC)?
 *   - Her 30 sn'de 1 token/terminal => gunde 2880 satir/terminal. 10 terminal
 *     bir yilda 10.5M satir. Cron ile silmek yerine hic kaydetmemek daha temiz.
 *   - Sunucu tek kaynak: SECRET. Rotasyon patlamiyorsa DB'ye baski yok.
 *   - Kullanilmis token izini pdks_kullanilan_tokenlar tutar (~10 dk retention).
 */
import { createHmac, timingSafeEqual, randomBytes, createHash } from 'node:crypto'

const SECRET = process.env.PDKS_HMAC_SECRET

// Pencere/paket sabitleri — spec'te 30 sn / 30 dk. Env'den override edilebilir.
export const PENCERE_SANIYE = Number(process.env.PDKS_PENCERE_SANIYE ?? 30)
export const PAKET_DAKIKA   = Number(process.env.PDKS_PAKET_DAKIKA ?? 30)

// Imza uzunlugu — 10 bayt (80 bit). 30 sn'lik pencere icin fazlasiyla yeterli.
const SIG_BYTES = 10

function requireSecret(): string {
  if (!SECRET || SECRET.length < 32) {
    throw new Error('PDKS_HMAC_SECRET tanimli degil (en az 32 karakter olmali)')
  }
  return SECRET
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(input: string): Buffer {
  const s = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s + pad, 'base64')
}

// UUID string → 16 bayt Buffer
function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, '')
  if (hex.length !== 32) throw new Error('Gecersiz UUID: ' + uuid)
  return Buffer.from(hex, 'hex')
}

// 16 bayt → UUID string
function bytesToUuid(buf: Buffer): string {
  const h = buf.toString('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

/** Bir pencere_no icin token uret. */
export function tokenUret(terminalId: string, pencereNo: number, _expMs?: number): string {
  const secret = requireSecret()
  const payload = Buffer.alloc(20)
  uuidToBytes(terminalId).copy(payload, 0)
  payload.writeUInt32BE(pencereNo >>> 0, 16)  // uint32 BE (~1360 yila kadar yeter)

  const sigFull = createHmac('sha256', secret).update(payload).digest()
  const sig = sigFull.subarray(0, SIG_BYTES)

  return `${b64urlEncode(payload)}.${b64urlEncode(sig)}`
}

export type CozulenToken = {
  terminalId: string
  pencereNo: number
  expMs: number
}

export type TokenCozumSonuc =
  | { ok: true; icerik: CozulenToken }
  | { ok: false; code: 'MALFORMED' | 'IMZA_GECERSIZ' }

export function tokenCoz(token: string): TokenCozumSonuc {
  try {
    const secret = requireSecret()
    const parts = token.split('.')
    if (parts.length !== 2) return { ok: false, code: 'MALFORMED' }

    const [payloadB64, sigB64] = parts
    const payload = b64urlDecode(payloadB64)
    if (payload.length !== 20) return { ok: false, code: 'MALFORMED' }

    const sig = b64urlDecode(sigB64)
    if (sig.length !== SIG_BYTES) return { ok: false, code: 'MALFORMED' }

    const beklenenSig = createHmac('sha256', secret).update(payload).digest().subarray(0, SIG_BYTES)

    if (!timingSafeEqual(sig, beklenenSig)) {
      return { ok: false, code: 'IMZA_GECERSIZ' }
    }

    const terminalId = bytesToUuid(payload.subarray(0, 16))
    const pencereNo = payload.readUInt32BE(16)
    const expMs = (pencereNo + 1) * PENCERE_SANIYE * 1000  // pencere bitisi (turetilir)

    return { ok: true, icerik: { terminalId, pencereNo, expMs } }
  } catch {
    return { ok: false, code: 'MALFORMED' }
  }
}

/** Zaman (ms) icin ait oldugu pencere numarasi. */
export function pencereNoBul(zamanMs: number): number {
  return Math.floor(zamanMs / (PENCERE_SANIYE * 1000))
}

/** Rotasyon token'ini string olarak taniyalim (tokenler `.` icerir + 42 karakter). */
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
  return randomBytes(32).toString('hex')
}

/** SHA-256 hash — kullanilan token hash'lemek icin. */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}
