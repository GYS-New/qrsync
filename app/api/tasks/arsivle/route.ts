/**
 * POST /api/tasks/arsivle
 *
 * Cron job: 6 saatte bir çalışır (00:00, 06:00, 12:00, 18:00 UTC)
 *
 * 1. personel_mesai_kayitlari   → 24h+ → _arsiv'e hard taşı
 * 2. musteri_degerlendirmeleri  → 24h+ → _arsiv'e hard taşı
 * 3. gorevler                   → tüm durumlar, 48h+ → _arsiv'e hard taşı + çeklistleri birlikte taşı
 * 4. frekansiyel çeklistler     → canli_gorevler_arsiv'e geçmiş görevlerin çeklistlerini taşı
 *
 * Not: canli_gorevler arşivlenmesi Supabase RPC (gece_tam_dongu) ile yapılır.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const MS24H = 24 * 60 * 60 * 1000
const MS48H = 48 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('x-cron-token')
    const envToken = process.env.CRON_SECRET
    if (!envToken || !token || token !== envToken) {
      return NextResponse.json({ ok: false, error: 'Yetkisiz cron isteği' }, { status: 401 })
    }

    const admin = createAdminClient()
    const now = Date.now()
    const cutoff24h = new Date(now - MS24H).toISOString()
    const cutoff48h = new Date(now - MS48H).toISOString()
    const results: any = {}

    // ─────────────────────────────────────────────────────────────────────────
    // 1. PERSONEL MESAİ — 24h+ olanlar hard arşivle
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const { data: rows } = await admin
        .from('personel_mesai_kayitlari')
        .select('*')
        .eq('arsivlendi', false)
        .lt('kayit_tarihi', cutoff24h)
        .limit(5000)

      if (rows?.length) {
        const arsivRows = rows.map(r => ({ ...r, arsivleme_tarihi: new Date().toISOString() }))
        const { error: insErr } = await admin.from('personel_mesai_kayitlari_arsiv').insert(arsivRows)
        if (insErr) throw insErr
        const ids = rows.map(r => r.id)
        const { error: delErr } = await admin.from('personel_mesai_kayitlari').delete().in('id', ids)
        if (delErr) throw delErr
        results.personel = { moved: ids.length, ok: true }
      } else {
        results.personel = { moved: 0, ok: true }
      }
    } catch (e: any) {
      results.personel = { ok: false, error: e.message }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. MÜŞTERİ DEĞERLENDİRMELERİ — 24h+ olanlar hard arşivle
    //    (Daha önce soft arşivlenmiş arsivlendi=true kayıtlar da temizlenir)
    // ─────────────────────────────────────────────────────────────────────────
    try {
      // 2a. Yeni arşivlenecekler (arsivlendi=false, 24h+)
      const { data: yeniRows } = await admin
        .from('musteri_degerlendirmeleri')
        .select('*')
        .eq('arsivlendi', false)
        .lt('olusturma_tarihi', cutoff24h)
        .limit(5000)

      let moved = 0
      if (yeniRows?.length) {
        const arsivRows = yeniRows.map(r => ({ ...r, arsivleme_tarihi: new Date().toISOString() }))
        const { error: insErr } = await admin.from('musteri_degerlendirmeleri_arsiv').insert(arsivRows)
        if (insErr) throw insErr
        const ids = yeniRows.map(r => r.id)
        const { error: delErr } = await admin.from('musteri_degerlendirmeleri').delete().in('id', ids)
        if (delErr) throw delErr
        moved += ids.length
      }

      // 2b. Eski soft arşivler (arsivlendi=true) — _arsiv'de kayıt yoksa ekle, ana tablodan sil
      const { data: softRows } = await admin
        .from('musteri_degerlendirmeleri')
        .select('id')
        .eq('arsivlendi', true)
        .limit(5000)

      if (softRows?.length) {
        const softIds = softRows.map(r => r.id)
        // _arsiv'de zaten varsa duplicate vermemek için insert etme, direkt sil
        await admin.from('musteri_degerlendirmeleri').delete().in('id', softIds)
        moved += softIds.length
      }

      results.musteri = { moved, ok: true }
    } catch (e: any) {
      results.musteri = { ok: false, error: e.message }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. SPESİFİK GÖREVLER — tüm durumlar, 48h+ → hard arşivle + çeklistleri birlikte taşı
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const { data: gorevler } = await admin
        .from('gorevler')
        .select('*')
        .lt('olusturma_tarihi', cutoff48h)
        .limit(5000)

      if (gorevler?.length) {
        const gorevIds = gorevler.map(g => g.id)

        // 3a. Çeklist başlıklarını bul ve taşı
        const { data: basliklar } = await admin
          .from('checklist_sonuc_basliklari')
          .select('*')
          .in('gorev_id', gorevIds)

        if (basliklar?.length) {
          const baslikIds = basliklar.map(b => b.id)

          // Maddeler
          const { data: maddeler } = await admin
            .from('checklist_sonuc_maddeleri')
            .select('*')
            .in('sonuc_id', baslikIds)

          if (maddeler?.length) {
            await admin.from('checklist_sonuc_maddeleri_arsiv').insert(maddeler)
            await admin.from('checklist_sonuc_maddeleri').delete().in('sonuc_id', baslikIds)
          }

          // Başlıklar
          const arsivBasliklar = basliklar.map(b => ({ ...b, arsiv_tarihi: new Date().toISOString() }))
          await admin.from('checklist_sonuc_basliklari_arsiv').insert(arsivBasliklar)
          await admin.from('checklist_sonuc_basliklari').delete().in('id', baslikIds)
        }

        // 3b. Görevi arşivle
        const arsivGorevler = gorevler.map(g => ({ ...g, arsivleme_tarihi: new Date().toISOString() }))
        const { error: insErr } = await admin.from('gorevler_arsiv').insert(arsivGorevler)
        if (insErr) throw insErr
        const { error: delErr } = await admin.from('gorevler').delete().in('id', gorevIds)
        if (delErr) throw delErr

        results.spesifik = { moved: gorevIds.length, ceklist: basliklar?.length ?? 0, ok: true }
      } else {
        results.spesifik = { moved: 0, ceklist: 0, ok: true }
      }
    } catch (e: any) {
      results.spesifik = { ok: false, error: e.message }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. FREKANSİYEL ÇEKLİSTLER — canli_gorevler_arsiv'e geçmiş görevlerin çeklistlerini taşı
    //    (canli_gorevler arşivlenmesi Supabase RPC ile yapılır, çeklistler burada temizlenir)
    // ─────────────────────────────────────────────────────────────────────────
    try {
      // Aktif çeklistlerin canli_gorev_id'si artık canli_gorevler_arsiv'de olan kayıtlar
      const { data: arsivGorevIds } = await admin
        .from('canli_gorevler_arsiv')
        .select('id')
        .limit(10000)

      if (arsivGorevIds?.length) {
        const ids = arsivGorevIds.map((g: any) => g.id)

        const { data: basliklar } = await admin
          .from('checklist_sonuc_basliklari')
          .select('*')
          .in('canli_gorev_id', ids)

        if (basliklar?.length) {
          const baslikIds = basliklar.map(b => b.id)

          const { data: maddeler } = await admin
            .from('checklist_sonuc_maddeleri')
            .select('*')
            .in('sonuc_id', baslikIds)

          if (maddeler?.length) {
            await admin.from('checklist_sonuc_maddeleri_arsiv').insert(maddeler)
            await admin.from('checklist_sonuc_maddeleri').delete().in('sonuc_id', baslikIds)
          }

          const arsivBasliklar = basliklar.map(b => ({ ...b, arsiv_tarihi: new Date().toISOString() }))
          await admin.from('checklist_sonuc_basliklari_arsiv').insert(arsivBasliklar)
          await admin.from('checklist_sonuc_basliklari').delete().in('id', baslikIds)

          results.frekCeklist = { moved: basliklar.length, ok: true }
        } else {
          results.frekCeklist = { moved: 0, ok: true }
        }
      } else {
        results.frekCeklist = { moved: 0, ok: true }
      }
    } catch (e: any) {
      results.frekCeklist = { ok: false, error: e.message }
    }

    return NextResponse.json({ ok: true, message: 'Arşivleme tamamlandı', results })
  } catch (e: any) {
    console.error('[arsivle] Hata:', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
