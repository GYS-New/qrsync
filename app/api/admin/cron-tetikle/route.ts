/**
 * POST /api/admin/cron-tetikle
 * SA-yetkili manuel cron tetikleme.
 *
 * Body: { tip: 'personel_destek' | 'max_sure' | 'arsivleme' | 'simulasyon' |
 *               'sistem_kontrol' | 'rapor_gonder' | 'gece_dongu' }
 *
 * Mantık:
 *  - SA / alt_super_admin session ile auth
 *  - Body'deki tip'e göre ilgili cron endpoint'ini server-side internal fetch
 *    ile çağır (CRON_SECRET token sunucu tarafında bilinir, kullanıcıya yansımaz)
 *  - gece_dongu pg_cron RPC ile çağrılır (endpoint yok)
 *  - audit_log'a kim ne zaman hangi cron'u manuel tetikledi yazılır
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

const CRON_TIPLERI: Record<string, { yol: string; method: 'POST' | 'GET' }> = {
  personel_destek: { yol: '/api/personel-destek/calistir', method: 'POST' },
  max_sure:        { yol: '/api/tasks/max-sure-kontrol',    method: 'POST' },
  arsivleme:       { yol: '/api/tasks/arsivle',             method: 'POST' },
  simulasyon:      { yol: '/api/simulasyon/calistir',       method: 'POST' },
  sistem_kontrol:  { yol: '/api/cron/sistem-kontrol',       method: 'POST' },
  rapor_gonder:    { yol: '/api/reports/rapor-gonder',      method: 'POST' },
  yedekleme:       { yol: '/api/cron/yedekleme',            method: 'POST' },
  vardiya_bildirim:{ yol: '/api/cron/vardiya-performans-bildirim', method: 'POST' },
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    return NextResponse.json({ ok: false, error: 'Yetkisiz — sadece SA' }, { status: 403 })
  }

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400 })
  }
  const tip = body?.tip as string | undefined
  if (!tip) return NextResponse.json({ ok: false, error: 'tip gerekli' }, { status: 400 })

  // gece_dongu özel — pg_cron RPC ile çağrılır
  if (tip === 'gece_dongu') {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('gece_tam_dongu')
    if (error) {
      await auditLog({
        tip: 'cron_manuel_tetik', tablo: 'cron_log', basarili: false,
        hata_mesaji: error.message, kullanici_id: user.id,
        detay: { cron_tipi: tip },
      })
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }
    await auditLog({
      tip: 'cron_manuel_tetik', tablo: 'cron_log',
      kullanici_id: user.id, detay: { cron_tipi: tip, sonuc: data },
    })
    return NextResponse.json({ ok: true, sonuc: data })
  }

  if (!CRON_TIPLERI[tip]) {
    return NextResponse.json({ ok: false, error: `Bilinmeyen tip: ${tip}` }, { status: 400 })
  }

  const config = CRON_TIPLERI[tip]
  const cronToken = process.env.CRON_SECRET ?? ''
  if (!cronToken) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET tanımlı değil' }, { status: 500 })
  }

  // Base URL: req header'larından çıkar (env'e bağlı kalma)
  const host = req.headers.get('host')
  const protocol = req.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https')
  const baseUrl = `${protocol}://${host}`

  try {
    const res = await fetch(`${baseUrl}${config.yol}`, {
      method: config.method,
      headers: { 'x-cron-token': cronToken, 'Content-Type': 'application/json' },
    })
    const sonuc = await res.json().catch(() => ({}))

    await auditLog({
      tip: 'cron_manuel_tetik', tablo: 'cron_log',
      basarili: res.ok && sonuc?.ok !== false,
      kullanici_id: user.id,
      detay: { cron_tipi: tip, http_status: res.status, sonuc },
    })

    return NextResponse.json({ ok: res.ok, http_status: res.status, sonuc })
  } catch (e: any) {
    await auditLog({
      tip: 'cron_manuel_tetik', tablo: 'cron_log', basarili: false,
      hata_mesaji: e.message, kullanici_id: user.id,
      detay: { cron_tipi: tip },
    })
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
