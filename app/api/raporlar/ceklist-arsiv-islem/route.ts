/**
 * POST /api/raporlar/ceklist-arsiv-islem
 * body: { action: 'sil' | 'toplu-sil' | 'geri-yukle', id?, gorev_id?, gorev_task_type?, firma_id }
 *
 * sil         — tek çeklist kaydını sil (checklist_sonuc_basliklari + maddeleri)
 * toplu-sil   — firma + proje bazında tüm çeklist arşiv kayıtlarını sil
 * geri-yukle  — çeklist kaydını + görevi ilgili tabloya geri taşı
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const admin    = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

    const { data: me } = await supabase
      .from('users').select('id,rol,firma_id').eq('id', user.id).single()
    if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const isTA = me.rol === 'tenant_admin'
    if (!isSA && !isTA) return NextResponse.json({ error: 'Yetki yetersiz' }, { status: 403 })

    const body = await req.json()
    const { action, id, gorev_id, gorev_task_type, firma_id, proje_id } = body

    // Firma güvenlik kontrolü
    const hedefFirmaId = isSA ? firma_id : me.firma_id
    if (!hedefFirmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

    // ── SİL: tek çeklist kaydını sil ─────────────────────────────────────
    if (action === 'sil') {
      if (!id) return NextResponse.json({ error: 'id gerekli' }, { status: 400 })

      // Önce maddeleri sil (aktif + arşiv)
      await admin.from('checklist_sonuc_maddeleri').delete().eq('sonuc_id', id)
      await admin.from('checklist_sonuc_maddeleri_arsiv').delete().eq('sonuc_id', id)

      // Sonra başlığı sil (aktif + arşiv)
      await admin.from('checklist_sonuc_basliklari').delete().eq('id', id)
      await admin.from('checklist_sonuc_basliklari_arsiv').delete().eq('id', id)

      return NextResponse.json({ ok: true })
    }

    // ── TOPLU SİL: tüm çeklist arşiv kayıtlarını sil ─────────────────────
    if (action === 'toplu-sil') {
      // checklist_sonuc_basliklari_arsiv'deki firma kayıtlarını bul
      let q = admin.from('checklist_sonuc_basliklari_arsiv')
        .select('id').eq('firma_id', hedefFirmaId)
      if (proje_id) q = (q as any).eq('proje_id', proje_id)

      const { data: basliklar, error: bErr } = await q
      if (bErr) throw bErr

      const ids = (basliklar ?? []).map((b: any) => b.id)
      if (ids.length > 0) {
        await admin.from('checklist_sonuc_maddeleri_arsiv').delete().in('sonuc_id', ids)
        await admin.from('checklist_sonuc_basliklari_arsiv').delete().in('id', ids)
      }

      // Ayrıca aktif tablodaki "arşiv" segmentindeki çeklist kayıtlarını da temizle
      // (gorevler_arsiv veya canli_gorevler_arsiv içindeki görevlere ait olanlar)
      return NextResponse.json({ ok: true, silinen: ids.length })
    }

    // ── GERİ YÜKLE ────────────────────────────────────────────────────────
    if (action === 'geri-yukle') {
      if (!gorev_id || !gorev_task_type) {
        return NextResponse.json({ error: 'gorev_id ve gorev_task_type gerekli' }, { status: 400 })
      }

      const isCanli    = gorev_task_type === 'canli_gorevler'
      const arsivTablo = isCanli ? 'canli_gorevler_arsiv' : 'gorevler_arsiv'
      const aktifTablo = isCanli ? 'canli_gorevler'       : 'gorevler'

      // 1. Görevi arşivden bul
      const { data: gorev, error: gErr } = await admin
        .from(arsivTablo).select('*').eq('id', gorev_id).maybeSingle()
      if (gErr) throw gErr
      if (!gorev) return NextResponse.json({ error: 'Arşivde görev bulunamadı' }, { status: 404 })

      // Firma güvenliği
      if (!isSA && gorev.firma_id !== hedefFirmaId) {
        return NextResponse.json({ error: 'Bu göreve erişim yetkiniz yok' }, { status: 403 })
      }

      // 2. Görevi aktif tabloya taşı (arsiv_tarihi / arsivleme_tarihi kolonunu çıkar)
      const { arsiv_tarihi, arsivleme_tarihi, arsiv_nedeni, ...gorevPayload } = gorev
      const { error: insErr } = await admin.from(aktifTablo).insert(gorevPayload)
      if (insErr) throw insErr

      // 3. Görevi arşivden sil
      await admin.from(arsivTablo).delete().eq('id', gorev_id)

      // 4. Çeklist başlığını arşivden aktif tabloya taşı (varsa)
      if (id) {
        const { data: baslik } = await admin
          .from('checklist_sonuc_basliklari_arsiv').select('*').eq('id', id).maybeSingle()
        if (baslik) {
          const { arsiv_tarihi: _, ...baslikPayload } = baslik
          await admin.from('checklist_sonuc_basliklari').insert(baslikPayload)
          await admin.from('checklist_sonuc_basliklari_arsiv').delete().eq('id', id)

          // 5. Çeklist maddelerini arşivden aktif tabloya taşı
          const { data: maddeler } = await admin
            .from('checklist_sonuc_maddeleri_arsiv').select('*').eq('sonuc_id', id)
          if (maddeler?.length) {
            await admin.from('checklist_sonuc_maddeleri').insert(maddeler)
            await admin.from('checklist_sonuc_maddeleri_arsiv').delete().eq('sonuc_id', id)
          }
        }
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Geçersiz action' }, { status: 400 })
  } catch (err: any) {
    console.error('[ceklist-arsiv-islem]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
