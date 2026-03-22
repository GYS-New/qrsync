/**
 * GET /api/checklist-results?task_id=...&task_type=...
 * Bir görevin çeklist tamamlanma sonuçlarını döndürür.
 * Şablon maddeleri + doldurulmuş sonuçları birleştirir.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

    const { data: me } = await supabase
      .from('users')
      .select('id, rol, firma_id')
      .eq('id', user.id)
      .single()
    if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 401 })

    const p = new URL(req.url).searchParams
    const taskId   = p.get('task_id')
    const taskType = p.get('task_type') as 'gorevler' | 'canli_gorevler' | null

    if (!taskId || !taskType) {
      return NextResponse.json({ error: 'task_id ve task_type gerekli' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Görevi çek — lokasyon ve checklist şablonu için
    const tableName = taskType === 'canli_gorevler' ? 'canli_gorevler' : 'gorevler'
    const { data: gorev } = await admin
      .from(tableName)
      .select('id, firma_id, tanim, durum, lokasyon_id, tamamlanma_tarihi, atanan_kullanici_id, islemi_yapan_id')
      .eq('id', taskId)
      .single()

    if (!gorev) {
      // Arşivde de bak (canli_gorevler_arsiv)
      if (taskType === 'canli_gorevler') {
        const { data: arsivGorev } = await admin
          .from('canli_gorevler_arsiv')
          .select('id, firma_id, tanim, durum, lokasyon_id, tamamlanma_tarihi, atanan_kullanici_id, islemi_yapan_id')
          .eq('id', taskId)
          .single()
        if (!arsivGorev) return NextResponse.json({ error: 'Görev bulunamadı' }, { status: 404 })
        Object.assign(gorev ?? {}, arsivGorev)
      } else {
        return NextResponse.json({ error: 'Görev bulunamadı' }, { status: 404 })
      }
    }

    const g = gorev as any

    // Firma yetki kontrolü
    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    if (!isSA && g.firma_id !== me.firma_id) {
      return NextResponse.json({ error: 'Bu göreve erişim yetkiniz yok' }, { status: 403 })
    }

    // Lokasyon → checklist şablonu
    const { data: lok } = await admin
      .from('lokasyonlar')
      .select('id, tanim, checklist_sablon_id')
      .eq('id', g.lokasyon_id)
      .maybeSingle()

    // checklist_sablon_id → checklist_templates.id (iki farklı naming mevcut)
    // LokasyonlarClient checklist_sablon_id kullanıyor, scan/core checklist_template_id
    const templateId = lok?.checklist_sablon_id ?? null

    if (!templateId) {
      return NextResponse.json({
        ok: true,
        gorev: { id: g.id, tanim: g.tanim, durum: g.durum, tamamlanma_tarihi: g.tamamlanma_tarihi },
        lokasyon: lok?.tanim ?? '—',
        template: null,
        sonuclar: [],
        mesaj: 'Bu lokasyona bağlı çeklist şablonu yok',
      })
    }

    // Şablon maddeleri
    const { data: items } = await admin
      .from('checklist_items')
      .select('id, sira, madde, zorunlu')
      .eq('template_id', templateId)
      .order('sira', { ascending: true })

    // Doldurulmuş sonuçlar
    const { data: results } = await admin
      .from('checklist_results')
      .select('id, item_id, durum, not_metni, kullanici_id, tarih, kanal')
      .eq('task_id', taskId)
      .eq('task_type', taskType)
      .order('tarih', { ascending: true })

    // Kullanıcı adları
    const userIds = [...new Set((results ?? []).map((r: any) => r.kullanici_id).filter(Boolean))]
    const { data: usersData } = userIds.length
      ? await admin.from('users').select('id, isim_soyisim').in('id', userIds)
      : { data: [] }
    const userMap = new Map<string, string>((usersData ?? []).map((u: any) => [u.id, u.isim_soyisim ?? '']))

    // Madde + sonuç birleştir
    const sonucMap = new Map<string, any>()
    for (const r of (results ?? [])) sonucMap.set(r.item_id, r)

    const birlesik = (items ?? []).map((item: any) => {
      const s = sonucMap.get(item.id)
      return {
        sira:      item.sira,
        madde:     item.madde,
        zorunlu:   item.zorunlu,
        durum:     s?.durum ?? null,
        not:       s?.not_metni ?? null,
        yapan:     s?.kullanici_id ? userMap.get(s.kullanici_id) ?? '—' : null,
        tarih:     s?.tarih ?? null,
        kanal:     s?.kanal ?? null,
        dolduruldu: !!s,
      }
    })

    // Atanan kullanıcı adı
    const atanan = g.atanan_kullanici_id ? userMap.get(g.atanan_kullanici_id) ?? null : null

    return NextResponse.json({
      ok: true,
      gorev: {
        id: g.id, tanim: g.tanim, durum: g.durum,
        tamamlanma_tarihi: g.tamamlanma_tarihi,
        atanan,
      },
      lokasyon: lok?.tanim ?? '—',
      sonuclar: birlesik,
    })
  } catch (err: any) {
    console.error('[checklist-results]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
