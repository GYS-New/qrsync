/**
 * POST /api/tasks/arsivle
 *
 * Cron job: 6 saatte birden çalışır
 * 24 saati geçen veriyi fiziksel olarak arşive taşır
 *
 * İşleyiş:
 * 1. personel_mesai_kayitlari
 * 2. musteri_degerlendirmeleri
 * 3. gorevler
 * 4. checklist_sonuc_basliklari + maddeleri
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const MS24H = 24 * 60 * 60 * 1000
const cutoff24h = new Date(Date.now() - MS24H).toISOString()

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('x-cron-token')
    const envToken = process.env.CRON_SECRET

    // Cron token kontrolü
    if (!envToken || !token || token !== envToken) {
      return NextResponse.json(
        { ok: false, error: 'Yetkisiz cron isteği' },
        { status: 401 }
      )
    }

    const admin = createAdminClient()
    const results: any = {}

    // ───────────────────────────────────────────────────────────────
    // 1. PERSONEL MESAI ARŞIVLE
    // ───────────────────────────────────────────────────────────────
    try {
      const { data: personelKayitlar, error: selectErr } = await admin
        .from('personel_mesai_kayitlari')
        .select('id')
        .lt('kayit_tarihi', cutoff24h)
        .eq('arsivlendi', false)
        .limit(5000)

      if (selectErr) throw selectErr

      if (personelKayitlar && personelKayitlar.length > 0) {
        const ids = personelKayitlar.map(k => k.id)

        // Get full records before delete
        const { data: fullRecords } = await admin
          .from('personel_mesai_kayitlari')
          .select('*')
          .in('id', ids)

        // Insert to archive
        if (fullRecords && fullRecords.length > 0) {
          const arsivRecords = fullRecords.map(r => ({
            ...r,
            arsivleme_tarihi: new Date().toISOString(),
          }))

          const { error: insertErr } = await admin
            .from('personel_mesai_kayitlari_arsiv')
            .insert(arsivRecords)

          if (insertErr) throw insertErr

          // Delete from main
          const { error: deleteErr } = await admin
            .from('personel_mesai_kayitlari')
            .delete()
            .in('id', ids)

          if (deleteErr) throw deleteErr

          results.personel = { moved: ids.length, ok: true }
        }
      } else {
        results.personel = { moved: 0, ok: true }
      }
    } catch (e: any) {
      results.personel = { ok: false, error: e.message }
    }

    // ───────────────────────────────────────────────────────────────
    // 2. MÜŞTERI DEĞERLENDİRMELERİ ARŞIVLE
    // ───────────────────────────────────────────────────────────────
    try {
      const { data: musteriKayitlar } = await admin
        .from('musteri_degerlendirmeleri')
        .select('id')
        .lt('olusturma_tarihi', cutoff24h)
        .eq('arsivlendi', false)
        .limit(5000)

      if (musteriKayitlar && musteriKayitlar.length > 0) {
        const ids = musteriKayitlar.map(k => k.id)

        // Get full records
        const { data: fullRecords } = await admin
          .from('musteri_degerlendirmeleri')
          .select('*')
          .in('id', ids)

        // Insert to archive
        if (fullRecords && fullRecords.length > 0) {
          const arsivRecords = fullRecords.map(r => ({
            ...r,
            arsivleme_tarihi: new Date().toISOString(),
          }))

          const { error: insertErr } = await admin
            .from('musteri_degerlendirmeleri_arsiv')
            .insert(arsivRecords)

          if (insertErr) throw insertErr

          // Update main table flag
          const { error: updateErr } = await admin
            .from('musteri_degerlendirmeleri')
            .update({ arsivlendi: true, arsivleme_tarihi: new Date().toISOString() })
            .in('id', ids)

          if (updateErr) throw updateErr

          results.musteri = { moved: ids.length, ok: true }
        }
      } else {
        results.musteri = { moved: 0, ok: true }
      }
    } catch (e: any) {
      results.musteri = { ok: false, error: e.message }
    }

    // ───────────────────────────────────────────────────────────────
    // 3. SPESİFİK GÖREVLER ARŞIVLE
    // ───────────────────────────────────────────────────────────────
    try {
      const { data: gorevler } = await admin
        .from('gorevler')
        .select('id')
        .or(
          `durum.eq.IPTAL,and(durum.eq.TAMAMLANDI,durum_degisim_tarihi.lt.${cutoff24h})`
        )
        .limit(5000)

      if (gorevler && gorevler.length > 0) {
        const ids = gorevler.map(g => g.id)

        // Get full records
        const { data: fullRecords } = await admin
          .from('gorevler')
          .select('*')
          .in('id', ids)

        // Insert to archive
        if (fullRecords && fullRecords.length > 0) {
          const arsivRecords = fullRecords.map(r => ({
            ...r,
            arsivleme_tarihi: new Date().toISOString(),
          }))

          const { error: insertErr } = await admin
            .from('gorevler_arsiv')
            .insert(arsivRecords)

          if (insertErr) throw insertErr

          // Delete from main
          const { error: deleteErr } = await admin
            .from('gorevler')
            .delete()
            .in('id', ids)

          if (deleteErr) throw deleteErr

          results.spesifik = { moved: ids.length, ok: true }
        }
      } else {
        results.spesifik = { moved: 0, ok: true }
      }
    } catch (e: any) {
      results.spesifik = { ok: false, error: e.message }
    }

    // ───────────────────────────────────────────────────────────────
    // 4. ÇEKLIST ARŞIVLE
    // ───────────────────────────────────────────────────────────────
    try {
      const { data: ceklistler } = await admin
        .from('checklist_sonuc_basliklari')
        .select('id')
        .lt('kayit_tarihi', cutoff24h)
        .limit(5000)

      if (ceklistler && ceklistler.length > 0) {
        const ids = ceklistler.map(c => c.id)

        // Get full records
        const { data: fullRecords } = await admin
          .from('checklist_sonuc_basliklari')
          .select('*')
          .in('id', ids)

        // Insert to archive
        if (fullRecords && fullRecords.length > 0) {
          const arsivRecords = fullRecords.map(r => ({
            ...r,
            arsivleme_tarihi: new Date().toISOString(),
          }))

          const { error: insertErr } = await admin
            .from('checklist_sonuc_basliklari_arsiv')
            .insert(arsivRecords)

          if (insertErr) throw insertErr

          // Archive maddeleri de taşı
          const { data: maddeler } = await admin
            .from('checklist_sonuc_maddeleri')
            .select('*')
            .in('sonuc_id', ids)

          if (maddeler && maddeler.length > 0) {
            const { error: insertMErr } = await admin
              .from('checklist_sonuc_maddeleri_arsiv')
              .insert(maddeler)

            if (insertMErr) throw insertMErr
          }

          // Delete from main
          const { error: deleteErr } = await admin
            .from('checklist_sonuc_basliklari')
            .delete()
            .in('id', ids)

          if (deleteErr) throw deleteErr

          results.ceklist = { moved: ids.length, madde_count: maddeler?.length ?? 0, ok: true }
        }
      } else {
        results.ceklist = { moved: 0, madde_count: 0, ok: true }
      }
    } catch (e: any) {
      results.ceklist = { ok: false, error: e.message }
    }

    return NextResponse.json({
      ok: true,
      message: '24+ saatlik veriler başarıyla arşivlendi',
      results,
    })
  } catch (e: any) {
    console.error('[arsivle] Hata:', e)
    return NextResponse.json(
      {
        ok: false,
        error: e.message,
      },
      { status: 500 }
    )
  }
}
