import nodemailer from 'nodemailer'

/**
 * SMTP mail sender.
 * Önce DB'den (smtp_ayarlari tablosu), yoksa env'dan SMTP ayarlarını okur.
 */
export async function sendMail(opts: { to: string; subject: string; text: string; html?: string; attachments?: { filename: string; content: Buffer; contentType?: string }[] }) {
  let host: string | undefined, port: number = 587, user: string | undefined, pass: string | undefined, secure: boolean = false, from: string | undefined

  // 1. DB'den oku
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (supabaseUrl && supabaseKey) {
      const res = await fetch(`${supabaseUrl}/rest/v1/smtp_ayarlari?limit=1&select=smtp_host,smtp_port,smtp_secure,smtp_user,smtp_pass,smtp_from,aktif`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      })
      const rows = await res.json()
      if (Array.isArray(rows) && rows.length > 0 && rows[0].aktif && rows[0].smtp_user) {
        host = rows[0].smtp_host
        port = rows[0].smtp_port || 587
        secure = rows[0].smtp_secure === true
        user = rows[0].smtp_user
        pass = rows[0].smtp_pass
        from = rows[0].smtp_from || rows[0].smtp_user
      }
    }
  } catch {}

  // 2. DB'de yoksa env fallback
  if (!host || !user || !pass) {
    host = process.env.SMTP_HOST
    port = Number(process.env.SMTP_PORT || 587)
    user = process.env.SMTP_USER
    pass = process.env.SMTP_PASS
    secure = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true'
    from = process.env.SMTP_FROM || user
  }

  if (!host || !user || !pass || !from) {
    console.warn('[mail] SMTP ayarları bulunamadı (DB veya env); skip sending', { to: opts.to, subject: opts.subject })
    return { ok: false, skipped: true as const }
  }

  const transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } })

  await transporter.sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: opts.attachments?.map(a => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  })

  return { ok: true as const }
}
