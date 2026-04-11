/**
 * POST /api/tasks/arsivle
 *
 * Cron job: 6 saatte bir çalışır (00:00, 06:00, 12:00, 18:00 UTC)
 *
 * Her firma + proje için kendi ayarlarına göre:
 * 1. personel_mesai_kayitlari   → arsiv_mesai_saat (varsayılan 24h)
 * 2. musteri_degerlendirmeleri   → arsiv_musteri_saat (varsayılan 24h)
 * 3. gorevler (spesifik)         → arsiv_spesifik_saat (varsayılan 48h)
 * 4. canli_gorevler (frekansiyel)→ arsiv_frekansiyel_saat (varsayılan 24h)
 *
 * Proje ayarı varsa proje ayarı, yoksa firma ayarı kullanılır.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const DEFAULTS = { mesai: 24, musteri: 24, spesifik: 48, frekansiyel: 24 }

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

    // Firmalar ve projeleri çek
    const { data: firmalar } = await admin
      .from('firmalar')
      .select('id,arsiv_mesai_saat,arsiv_musteri_saat,arsiv_spesifik_saat,arsiv_frekansiyel_saat')
      .eq('aktif', true)

    const { data: projeler } = await admin
      .from('projeler')
      .select('id,firma_id,arsiv_mesai_saat,arsiv_musteri_saat,arsiv_spesifik_saat,arsiv_frekansiyel_saat')
      .eq('aktif', true)

    const firmaMap = new Map((firmalar ?? []).map(f => [f.id, f]))
    // Proje → efektif süreler (proje override > firma default)
    type Sureler = { mesai: number; musteri: number; spesifik: number; frekansiyel: number; firmaId: string; projeId: string }

    const projeSureleri: Sureler[] = (projeler ?? []).map(p => {
      const f = firmaMap.get(p.firma_id)
      return {
        firmaId: p.firma_id,
        projeId: p.id,
        mesai:       p.arsiv_mesai_saat       ?? f?.arsiv_mesai_saat       ?? DEFAULTS.mesai,
        musteri:     p.arsiv_musteri_saat     ?? f?.arsiv_musteri_saat     ?? DEFAULTS.musteri,
        spesifik:    p.arsiv_spesifik_saat    ?? f?.arsiv_spesifik_saat    ?? DEFAULTS.spesifik,
        frekansiyel: p.arsiv_frekansiyel_saat ?? f?.arsiv_frekansiyel_saat ?? DEFAULTS.frekansiyel,
      }
    })

    // Projesi olmayan firmalar için de çalış
    const firmaIdlerWithProje = new Set(projeSureleri.map(p => p.firmaId))
    for (const f of firmalar ?? []) {
      if (!firmaIdlerWithProje.has(f.id)) {
        projeSureleri.push({
          firmaId: f.id, projeId: '',
          mesai:       f.arsiv_mesai_saat       ?? DEFAULTS.mesai,
          musteri:     f.arsiv_musteri_saat     ?? DEFAULTS.musteri,
          spesifik:    f.arsiv_spesifik_saat    ?? DEFAULTS.spesifik,
          frekansiyel: f.arsiv_frekansiyel_saat ?? DEFAULTS.frekansiyel,
        })
      }
    }

    for (const s of projeSureleri) {
      const key = s.projeId ? `${s.firmaId}/${s.projeId}` : s.firmaId
      const r: any = {}

      const cutoffMesai    = new Date(now - s.mesai       * 3600000).toISOString()
      const cutoffMusteri  = new Date(now - s.musteri     * 3600000).toISOString()
      const cutoffSpesifik = new Date(now - s.spesifik    * 3600000).toISOString()
      const cutoffFreq     = new Date(now - s.frekansiyel * 3600000).toISOString()

      // ── 1. PERSONEL MESAİ ──────────────────────────────────────────
      try {
        let q = admin.from('personel_mesai_kayitlari').select('*')
          .eq('firma_id', s.firmaId).eq('arsivlendi', false).lt('kayit_tarihi', cutoffMesai).limit(5000)
        if (s.projeId) q = (q as any).eq('proje_id', s.projeId)
        const { data: rows } = await q
        if (rows?.length) {
          await admin.from('personel_mesai_kayitlari_arsiv').insert(rows.map(x => ({ ...x, arsivleme_tarihi: new Date().toISOString() })))
          await admin.from('personel_mesai_kayitlari').delete().in('id', rows.map(x => x.id))
          r.personel = rows.length
        }
      } catch (e: any) { r.personel_err = e.message }

      // ── 2. MÜŞTERİ DEĞERLENDİRMELERİ ─────────────────────────────
      try {
        let q = admin.from('musteri_degerlendirmeleri').select('*')
          .eq('firma_id', s.firmaId).eq('arsivlendi', false).lt('olusturma_tarihi', cutoffMusteri).limit(5000)
        if (s.projeId) q = (q as any).eq('proje_id', s.projeId)
        const { data: yeni } = await q
        let moved = 0
        if (yeni?.length) {
          await admin.from('musteri_degerlendirmeleri_arsiv').insert(yeni.map(x => ({ ...x, arsivleme_tarihi: new Date().toISOString() })))
          await admin.from('musteri_degerlendirmeleri').delete().in('id', yeni.map(x => x.id))
          moved += yeni.length
        }
        // Soft arşivler temizle
        let sq = admin.from('musteri_degerlendirmeleri').select('id').eq('firma_id', s.firmaId).eq('arsivlendi', true).limit(5000)
        if (s.projeId) sq = (sq as any).eq('proje_id', s.projeId)
        const { data: soft } = await sq
        if (soft?.length) {
          await admin.from('musteri_degerlendirmeleri').delete().in('id', soft.map(x => x.id))
          moved += soft.length
        }
        if (moved > 0) r.musteri = moved
      } catch (e: any) { r.musteri_err = e.message }

      // ── 3. SPESİFİK GÖREVLER ──────────────────────────────────────
      try {
        let q = admin.from('gorevler').select('*').eq('firma_id', s.firmaId).lt('olusturma_tarihi', cutoffSpesifik).limit(5000)
        if (s.projeId) q = (q as any).eq('proje_id', s.projeId)
        const { data: gorevler } = await q
        if (gorevler?.length) {
          const ids = gorevler.map(g => g.id)
          // Çeklist taşı
          const { data: basliklar } = await admin.from('checklist_sonuc_basliklari').select('*').in('gorev_id', ids)
          if (basliklar?.length) {
            const bIds = basliklar.map(b => b.id)
            const { data: maddeler } = await admin.from('checklist_sonuc_maddeleri').select('*').in('sonuc_id', bIds)
            if (maddeler?.length) {
              await admin.from('checklist_sonuc_maddeleri_arsiv').insert(maddeler)
              await admin.from('checklist_sonuc_maddeleri').delete().in('sonuc_id', bIds)
            }
            await admin.from('checklist_sonuc_basliklari_arsiv').insert(basliklar.map(b => ({ ...b, arsiv_tarihi: new Date().toISOString() })))
            await admin.from('checklist_sonuc_basliklari').delete().in('id', bIds)
          }
          await admin.from('gorevler_arsiv').insert(gorevler.map(g => ({ ...g, arsivleme_tarihi: new Date().toISOString() })))
          await admin.from('gorevler').delete().in('id', ids)
          r.spesifik = ids.length
        }
      } catch (e: any) { r.spesifik_err = e.message }

      // ── 4. FREKANSİYEL GÖREVLER (canli_gorevler) ──────────────────
      try {
        let q = admin.from('canli_gorevler').select('*').eq('firma_id', s.firmaId)
          .in('durum', ['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS', 'IPTAL', 'SILINDI'])
          .lt('durum_degisim_tarihi', cutoffFreq).limit(5000)
        if (s.projeId) q = (q as any).eq('proje_id', s.projeId)
        const { data: gorevler } = await q
        if (gorevler?.length) {
          const ids = gorevler.map(g => g.id)

          // Çeklist sonuçlarını arşivle (başlık + maddeler)
          try {
            const { data: basliklar } = await admin.from('checklist_sonuc_basliklari').select('*').in('canli_gorev_id', ids)
            if (basliklar?.length) {
              const bIds = basliklar.map(b => b.id)
              const { data: maddeler } = await admin.from('checklist_sonuc_maddeleri').select('*').in('sonuc_id', bIds)
              if (maddeler?.length) {
                await admin.from('checklist_sonuc_maddeleri_arsiv').upsert(maddeler, { onConflict: 'id', ignoreDuplicates: true })
                await admin.from('checklist_sonuc_maddeleri').delete().in('sonuc_id', bIds)
              }
              const arsivBasliklar = basliklar.map(b => ({ ...b, arsiv_tarihi: new Date().toISOString() }))
              await admin.from('checklist_sonuc_basliklari_arsiv').upsert(arsivBasliklar, { onConflict: 'id', ignoreDuplicates: true })
              await admin.from('checklist_sonuc_basliklari').delete().in('id', bIds)
              r.ceklist = basliklar.length
            }
          } catch (e: any) { r.ceklist_err = e.message }

          const arsivRows = gorevler.map(g => ({
            ...g,
            arsiv_tarihi: new Date().toISOString(),
            arsiv_nedeni: 'cron_saat',
          }))
          await admin.from('canli_gorevler_arsiv').upsert(arsivRows, { onConflict: 'id', ignoreDuplicates: true })
          await admin.from('canli_gorevler').delete().in('id', ids)
          r.frekansiyel = ids.length
        }
      } catch (e: any) { r.frekansiyel_err = e.message }

      // Sadece bir şey taşındıysa ekle
      if (Object.keys(r).length > 0) results[key] = r
    }

    return NextResponse.json({ ok: true, message: 'Arşivleme tamamlandı', results })
  } catch (e: any) {
    console.error('[arsivle] Hata:', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
