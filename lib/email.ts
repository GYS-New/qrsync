import nodemailer from 'nodemailer'

/**
 * Best-effort SMTP mail sender.
 * Configure with env vars:
 *  - SMTP_HOST, SMTP_PORT, SMTP_SECURE(true/false)
 *  - SMTP_USER, SMTP_PASS
 *  - SMTP_FROM (optional)
 */
export async function sendMail(opts: { to: string; subject: string; text: string }) {
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true'
  const from = process.env.SMTP_FROM || user

  if (!host || !user || !pass || !from) {
    // SMTP not configured; do not throw to avoid breaking app.
    console.warn('[mail] SMTP env missing; skip sending', { to: opts.to, subject: opts.subject })
    return { ok: false, skipped: true as const }
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  })

  await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
  })

  return { ok: true as const }
}
