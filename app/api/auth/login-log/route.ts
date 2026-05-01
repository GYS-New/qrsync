/**
 * POST /api/auth/login-log
 *
 * Başarısız login denemesini audit_log'a yazar.
 * Login page'i Supabase signInWithPassword hata aldığında bu endpoint'i çağırır.
 *
 * NOT: Bu endpoint rate limit YAPMAZ — sadece visibility içindir.
 * Asıl rate limit Aşama 3'teki middleware tarafından sağlanır.
 *
 * Saldırı tespiti açısından önemli: bu kayıtlar sayesinde guvenlik-mail cron'u
 * ('login_basarisiz' tipini izliyor) bir saatlik pencere içinde anormal sayıda
 * başarısız giriş olursa email gönderir.
 */
import { NextResponse } from 'next/server'
import { auditLog } from '@/lib/audit/log'
import { getRequestMeta } from '@/lib/device/getRequestMeta'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: Request) {
  // Auth gerekmez — endpoint anonymous (login öncesi çağrılır)
  // Body küçük tutulmalı; içerik manipule edilebilir, sadece istatistik olarak değerli
  let email = ''
  let errorMsg = ''
  try {
    const body = await req.json()
    email = String(body?.email ?? '').trim().toLowerCase().slice(0, 200)
    errorMsg = String(body?.error ?? '').slice(0, 300)
  } catch {
    // Body parse hatası — sessiz geç (yine de log'la)
  }

  const { ip, ua } = getRequestMeta(req)

  await auditLog({
    tip: 'login_basarisiz',
    tablo: 'auth',
    basarili: false,
    hata_mesaji: errorMsg || null,
    detay: { email: email || null, ip, ua },
  })

  return NextResponse.json({ ok: true })
}
