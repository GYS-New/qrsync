/**
 * Mail sender — Resend HTTP API (SMTP port kısıtlaması yok)
 * Fallback: nodemailer (SMTP) — DB veya env'dan ayar okur
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY

interface MailOpts {
  to: string
  subject: string
  text: string
  html?: string
  attachments?: { filename: string; content: Buffer; contentType?: string }[]
}

// Resend HTTP API ile gönder
async function sendViaResend(opts: MailOpts, from: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const body: Record<string, unknown> = {
    from,
    to: [opts.to],
    subject: opts.subject,
    text: opts.text,
  }
  if (opts.html) body.html = opts.html
  if (opts.attachments?.length) {
    body.attachments = opts.attachments.map(a => ({
      filename: a.filename,
      content: a.content.toString('base64'),
      content_type: a.contentType,
    }))
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (res.ok) return { ok: true }
  const err = await res.text()
  console.error('[mail:resend] Hata:', res.status, err)
  return { ok: false, error: err }
}

// Nodemailer SMTP fallback
async function sendViaSMTP(opts: MailOpts): Promise<{ ok: true } | { ok: false; skipped: true }> {
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
    return { ok: false, skipped: true }
  }

  const nodemailer = (await import('nodemailer')).default
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

  return { ok: true }
}

// Ana fonksiyon — Resend varsa onu kullan, yoksa SMTP fallback
export async function sendMail(opts: MailOpts) {
  // Gönderen adresini DB'den oku
  let from = 'info@iogys.com.tr'
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (supabaseUrl && supabaseKey) {
      const res = await fetch(`${supabaseUrl}/rest/v1/smtp_ayarlari?limit=1&select=smtp_from,aktif`, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
      })
      const rows = await res.json()
      if (Array.isArray(rows) && rows.length > 0 && rows[0].smtp_from) {
        from = rows[0].smtp_from
      }
    }
  } catch {}

  // Resend API varsa onu kullan
  if (RESEND_API_KEY) {
    return sendViaResend(opts, from)
  }

  // Yoksa SMTP fallback
  return sendViaSMTP(opts)
}
