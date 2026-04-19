/**
 * POST /api/tasks/max-sure-kontrol
 *
 * Cron job: Her 5 dakikada bir çalışır.
 * ISLEMDE durumundaki görevleri kontrol eder.
 * Lokasyonun max_sure_dakika süresi dolmuş ve görev hâlâ ISLEMDE ise durum IPTAL yapılır.
 *
 * Kontrol edilen tablolar:
 *  - gorevler       (SG - Spesifik Görevler)
 *  - canli_gorevler (FG - Frekansiyel Görevler) [isteğe bağlı - sureli_gorev_aktif kontrolüyle]
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('x-cron-token')
    const envToken = process.env.CRON_SECRET
    if (!envToken || !token || token !== envToken) {
      return NextResponse.json({ ok: false, error: 'Yetkisiz cron isteği' }, { status: 401 })
    }

    const admin = createAdminClient()
    const now = new Date()
    const results: { gorevler_iptal: number; canli_gorevler_iptal: number } = {
      gorevler_iptal: 0,
      canli_gorevler_iptal: 0,
    }

    // ── 1. gorevler (Spesifik Görevler) ─────────────────────────────────────
    // ISLEMDE olan ve lokasyonun max_sure_dakika'sı dolu olan görevleri çek
    const { data: sgRows, error: sgErr } = await admin
      .from('gorevler')
      .select('id, baslatilma_tarihi, lokasyon_id, lokasyonlar(max_sure_dakika)')
      .eq('durum', 'ISLEMDE')
      .not('baslatilma_tarihi', 'is', null)

    if (sgErr) throw sgErr

    const sgIptalIds: string[] = []
    for (const row of (sgRows ?? []) as any[]) {
      const maxSure: number | null = row.lokasyonlar?.max_sure_dakika ?? null
      if (!maxSure || maxSure <= 0) continue
      const baslatilma = new Date(row.baslatilma_tarihi)
      const gecenDakika = (now.getTime() - baslatilma.getTime()) / 60000
      if (gecenDakika >= maxSure) {
        sgIptalIds.push(row.id)
      }
    }

    if (sgIptalIds.length > 0) {
      const { error: updErr } = await admin
        .from('gorevler')
        .update({ durum: 'IPTAL', durum_degisim_tarihi: now.toISOString() })
        .in('id', sgIptalIds)
      if (updErr) throw updErr
      results.gorevler_iptal = sgIptalIds.length
    }

    // ── 2. canli_gorevler (Frekansiyel Görevler) ────────────────────────────
    // Sadece sureli_gorev_aktif=true lokasyonlarda ISLEMDE olanları kontrol et
    const { data: fgRows, error: fgErr } = await admin
      .from('canli_gorevler')
      .select('id, baslatilma_tarihi, lokasyon_id, lokasyonlar(max_sure_dakika, sureli_gorev_aktif)')
      .eq('durum', 'ISLEMDE')
      .not('baslatilma_tarihi', 'is', null)

    if (fgErr) throw fgErr

    const fgIptalIds: string[] = []
    for (const row of (fgRows ?? []) as any[]) {
      const lok = row.lokasyonlar ?? {}
      if (!lok.sureli_gorev_aktif) continue
      const maxSure: number | null = lok.max_sure_dakika ?? null
      if (!maxSure || maxSure <= 0) continue
      const baslatilma = new Date(row.baslatilma_tarihi)
      const gecenDakika = (now.getTime() - baslatilma.getTime()) / 60000
      if (gecenDakika >= maxSure) {
        fgIptalIds.push(row.id)
      }
    }

    if (fgIptalIds.length > 0) {
      const { error: updErr2 } = await admin
        .from('canli_gorevler')
        .update({ durum: 'IPTAL', durum_degisim_tarihi: now.toISOString() })
        .in('id', fgIptalIds)
      if (updErr2) throw updErr2
      results.canli_gorevler_iptal = fgIptalIds.length
    }

    console.log('[MAX-SURE-KONTROL]', now.toISOString(), results)

    // Cron audit — sadece bir şey değiştiyse
    const toplam = (results.gorevler_iptal ?? 0) + (results.canli_gorevler_iptal ?? 0)
    if (toplam > 0) {
      const { auditLog } = await import('@/lib/audit/log')
      await auditLog({
        tip: 'cron_max_sure', tablo: 'canli_gorevler',
        satir_sayisi: toplam, detay: results,
      })
    }

    return NextResponse.json({ ok: true, ...results })
  } catch (err: any) {
    console.error('[max-sure-kontrol]', err)
    try {
      const { auditLog } = await import('@/lib/audit/log')
      await auditLog({
        tip: 'cron_max_sure', tablo: 'canli_gorevler', basarili: false, hata_mesaji: err?.message ?? 'hata',
      })
    } catch {}
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
