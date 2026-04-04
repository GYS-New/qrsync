/**
 * POST /api/tasks/arsivle
 *
 * Cron job: 6 saatte bir çalışır (00:00, 06:00, 12:00, 18:00 UTC)
 *
 * 1. personel_mesai_kayitlari   → firma ayarı (varsayılan 24h) → _arsiv'e hard taşı
 * 2. musteri_degerlendirmeleri  → firma ayarı (varsayılan 24h) → _arsiv'e hard taşı
 * 3. gorevler                   → firma ayarı (varsayılan 48h) → _arsiv'e hard taşı + çeklistleri birlikte taşı
 *
 * Not: canli_gorevler arşivlenmesi Supabase RPC (gece_tam_dongu) ile yapılır.
 *      Frekansiyel çeklist arşivlenmesi DB trigger (trg_canli_gorev_arsiv_ceklist) ile anlık yapılır.
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
    const now = Date.now()
    const results: any = {}

    // Tüm firmaları ve arşiv ayarlarını çek
    const { data: firmalar } = await admin
      .from('firmalar')
      .select('id,arsiv_mesai_saat,arsiv_musteri_saat,arsiv_spesifik_saat')
      .eq('aktif', true)

    for (const firma of firmalar ?? []) {
      const firmaId = firma.id
      const mesaiSaat    = firma.arsiv_mesai_saat    ?? 24
      const musteriSaat  = firma.arsiv_musteri_saat  ?? 24
      const spesifikSaat = firma.arsiv_spesifik_saat ?? 48

      const cutoffMesai    = new Date(now - mesaiSaat    * 60 * 60 * 1000).toISOString()
      const cutoffMusteri  = new Date(now - musteriSaat  * 60 * 60 * 1000).toISOString()
      const cutoffSpesifik = new Date(now - spesifikSaat * 60 * 60 * 1000).toISOString()

      const firmaResult: any = {}

      // ── 1. PERSONEL MESAİ ──────────────────────────────────────────────
      try {
        const { data: rows } = await admin
          .from('personel_mesai_kayitlari')
          .select('*')
          .eq('firma_id', firmaId)
          .eq('arsivlendi', false)
          .lt('kayit_tarihi', cutoffMesai)
          .limit(5000)

        if (rows?.length) {
          const arsivRows = rows.map(r => ({ ...r, arsivleme_tarihi: new Date().toISOString() }))
          const { error: insErr } = await admin.from('personel_mesai_kayitlari_arsiv').insert(arsivRows)
          if (insErr) throw insErr
          const ids = rows.map(r => r.id)
          const { error: delErr } = await admin.from('personel_mesai_kayitlari').delete().in('id', ids)
          if (delErr) throw delErr
          firmaResult.personel = { moved: ids.length, ok: true }
        } else {
          firmaResult.personel = { moved: 0, ok: true }
        }
      } catch (e: any) {
        firmaResult.personel = { ok: false, error: e.message }
      }

      // ── 2. MÜŞTERİ DEĞERLENDİRMELERİ ─────────────────────────────────
      try {
        const { data: yeniRows } = await admin
          .from('musteri_degerlendirmeleri')
          .select('*')
          .eq('firma_id', firmaId)
          .eq('arsivlendi', false)
          .lt('olusturma_tarihi', cutoffMusteri)
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

        // Eski soft arşivler (arsivlendi=true) — ana tablodan sil
        const { data: softRows } = await admin
          .from('musteri_degerlendirmeleri')
          .select('id')
          .eq('firma_id', firmaId)
          .eq('arsivlendi', true)
          .limit(5000)

        if (softRows?.length) {
          const softIds = softRows.map(r => r.id)
          await admin.from('musteri_degerlendirmeleri').delete().in('id', softIds)
          moved += softIds.length
        }

        firmaResult.musteri = { moved, ok: true }
      } catch (e: any) {
        firmaResult.musteri = { ok: false, error: e.message }
      }

      // ── 3. SPESİFİK GÖREVLER ──────────────────────────────────────────
      try {
        const { data: gorevler } = await admin
          .from('gorevler')
          .select('*')
          .eq('firma_id', firmaId)
          .lt('olusturma_tarihi', cutoffSpesifik)
          .limit(5000)

        if (gorevler?.length) {
          const gorevIds = gorevler.map(g => g.id)

          // Çeklist başlıklarını bul ve taşı
          const { data: basliklar } = await admin
            .from('checklist_sonuc_basliklari')
            .select('*')
            .in('gorev_id', gorevIds)

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
          }

          const arsivGorevler = gorevler.map(g => ({ ...g, arsivleme_tarihi: new Date().toISOString() }))
          const { error: insErr } = await admin.from('gorevler_arsiv').insert(arsivGorevler)
          if (insErr) throw insErr
          const { error: delErr } = await admin.from('gorevler').delete().in('id', gorevIds)
          if (delErr) throw delErr

          firmaResult.spesifik = { moved: gorevIds.length, ceklist: basliklar?.length ?? 0, ok: true }
        } else {
          firmaResult.spesifik = { moved: 0, ceklist: 0, ok: true }
        }
      } catch (e: any) {
        firmaResult.spesifik = { ok: false, error: e.message }
      }

      // Sadece bir şey taşındıysa logla
      const anyMoved = (firmaResult.personel?.moved || 0) + (firmaResult.musteri?.moved || 0) + (firmaResult.spesifik?.moved || 0)
      if (anyMoved > 0) results[firmaId] = firmaResult
    }

    return NextResponse.json({ ok: true, message: 'Arşivleme tamamlandı', results })
  } catch (e: any) {
    console.error('[arsivle] Hata:', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
