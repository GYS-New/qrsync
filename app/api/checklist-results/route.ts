/**
 * GET /api/checklist-results?task_id=...&task_type=gorevler|canli_gorevler
 *
 * Gerçek şema:
 *   checklist_sablonlari          → şablon başlık
 *   checklist_sablon_maddeleri    → şablon maddeleri  (sablon_id)
 *   checklist_sonuc_basliklari    → görev sonuç başlığı (gorev_id | canli_gorev_id)
 *   checklist_sonuc_maddeleri     → madde cevapları   (sonuc_id, madde_id, secenek_degeri, aciklama, gorsel_url)
 *   lokasyonlar.checklist_sablon_id → şablon bağlantısı
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

function fmt(v: string | null | undefined) {
  if (!v) return '—'
  const d = new Date(v); if (isNaN(d.getTime())) return '—'
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

    const { data: me } = await supabase
      .from('users').select('id,rol,firma_id').eq('id', user.id).single()
    if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 401 })

    const p    = new URL(req.url).searchParams
    const taskId   = p.get('task_id')
    const taskType = p.get('task_type') as 'gorevler' | 'canli_gorevler' | null
    if (!taskId || !taskType) {
      return NextResponse.json({ error: 'task_id ve task_type gerekli' }, { status: 400 })
    }

    const admin = createAdminClient()
    const isSA  = me.rol === 'super_admin' || me.rol === 'alt_super_admin'

    // ── 1. Görevi çek (aktif + arşiv fallback) ──────────────────────────
    const tables = taskType === 'canli_gorevler'
      ? ['canli_gorevler', 'canli_gorevler_arsiv']
      : ['gorevler']

    let gorev: any = null
    for (const tbl of tables) {
      const { data } = await admin.from(tbl)
        .select('id,firma_id,tanim,durum,lokasyon_id,tamamlanma_tarihi,atanan_kullanici_id,islemi_yapan_id')
        .eq('id', taskId).maybeSingle()
      if (data) { gorev = data; break }
    }
    if (!gorev) return NextResponse.json({ error: 'Görev bulunamadı' }, { status: 404 })
    if (!isSA && gorev.firma_id !== me.firma_id) {
      return NextResponse.json({ error: 'Bu göreve erişim yetkiniz yok' }, { status: 403 })
    }

    // ── 2. Lokasyon → şablon ID ──────────────────────────────────────────
    const { data: lok } = await admin.from('lokasyonlar')
      .select('id,tanim,checklist_sablon_id').eq('id', gorev.lokasyon_id).maybeSingle()

    const sablonId = lok?.checklist_sablon_id ?? null
    if (!sablonId) {
      return NextResponse.json({
        ok: true,
        gorev: { id: gorev.id, tanim: gorev.tanim, durum: gorev.durum, tamamlanma_tarihi: gorev.tamamlanma_tarihi, atanan: null },
        lokasyon:    lok?.tanim ?? '—',
        lokasyon_id: lok?.id ?? null,
        sablon: null,
        sonuclar: [],
        mesaj: 'Bu lokasyona bağlı çeklist şablonu yok',
      })
    }

    // ── 3. Şablon + maddeler ─────────────────────────────────────────────
    const { data: sablonRow } = await admin.from('checklist_sablonlari')
      .select('id,baslik,tanim,versiyon').eq('id', sablonId).maybeSingle()

    const { data: maddeler } = await admin.from('checklist_sablon_maddeleri')
      .select('id,sira_no,baslik,zorunlu_cevap,gorsel_gerekli,checklist_madde_secenekleri(id,deger,sira_no)')
      .eq('sablon_id', sablonId).order('sira_no', { ascending: true })

    // ── 4. Sonuç başlığını bul (bu göreve ait) ───────────────────────────
    const gorevIdKolonu = taskType === 'gorevler' ? 'gorev_id' : 'canli_gorev_id'
    const { data: sonuclar } = await admin.from('checklist_sonuc_basliklari')
      .select('id,kullanici_id,kanal,kayit_tarihi')
      .eq(gorevIdKolonu, taskId)
      .order('kayit_tarihi', { ascending: false })
      .limit(1)

    const sonucBaslik = sonuclar?.[0] ?? null

    // ── 5. Madde cevapları ───────────────────────────────────────────────
    let cevapMap = new Map<string, any>()
    if (sonucBaslik) {
      const { data: cevaplar } = await admin.from('checklist_sonuc_maddeleri')
        .select('id,madde_id,secenek_degeri,aciklama,gorsel_url')
        .eq('sonuc_id', sonucBaslik.id)
      for (const c of cevaplar ?? []) cevapMap.set(c.madde_id, c)
    }

    // ── 6. Yapan kullanıcı ───────────────────────────────────────────────
    const yapanId  = sonucBaslik?.kullanici_id ?? gorev.islemi_yapan_id ?? gorev.atanan_kullanici_id
    let yapanAdi: string | null = null
    if (yapanId) {
      const { data: u } = await admin.from('users').select('isim_soyisim').eq('id', yapanId).maybeSingle()
      yapanAdi = u?.isim_soyisim ?? null
    }

    // ── 7. Birleştir ─────────────────────────────────────────────────────
    const birlesik = (maddeler ?? []).map((m: any) => {
      const c   = cevapMap.get(m.id)
      const sec = (m.checklist_madde_secenekleri ?? [])
        .sort((a: any, b: any) => (a.sira_no ?? 0) - (b.sira_no ?? 0))
      return {
        madde_id:  m.id,
        sira:      m.sira_no,
        madde:     m.baslik,
        zorunlu:   m.zorunlu_cevap !== false,
        gorsel_gerekli: !!m.gorsel_gerekli,
        secenekler: sec.map((s: any) => s.deger),
        durum:     c ? true : null,
        secenek:   c?.secenek_degeri ?? null,
        not:       c?.aciklama ?? null,
        gorsel_url: c?.gorsel_url ?? null,
        yapan:     sonucBaslik ? yapanAdi : null,
        tarih:     sonucBaslik?.kayit_tarihi ? fmt(sonucBaslik.kayit_tarihi) : null,
        kanal:     sonucBaslik?.kanal ?? null,
        dolduruldu: !!c,
      }
    })

    return NextResponse.json({
      ok: true,
      gorev: {
        id: gorev.id, tanim: gorev.tanim, durum: gorev.durum,
        tamamlanma_tarihi: gorev.tamamlanma_tarihi, atanan: yapanAdi,
      },
      lokasyon:    lok?.tanim ?? '—',
      lokasyon_id: lok?.id ?? null,
      sablon: sablonRow ? { baslik: (sablonRow as any).baslik, tanim: (sablonRow as any).tanim } : null,
      sonuclar: birlesik,
    })
  } catch (err: any) {
    console.error('[checklist-results]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}

// POST /api/checklist-results — Çeklist cevaplarını kaydet (web düzenleme)
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

    const { data: me } = await supabase
      .from('users').select('id,rol,firma_id').eq('id', user.id).single()
    if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 401 })

    const body = await req.json()
    const { task_id, task_type, maddeler } = body as {
      task_id: string
      task_type: 'gorevler' | 'canli_gorevler'
      maddeler: { madde_id: string; secenek_degeri: string | null; aciklama: string | null; gorsel_url?: string | null }[]
    }
    if (!task_id || !task_type) return NextResponse.json({ error: 'task_id ve task_type gerekli' }, { status: 400 })

    const admin = createAdminClient()
    const isSA  = me.rol === 'super_admin' || me.rol === 'alt_super_admin'

    // Firma kontrolü
    const tables = task_type === 'canli_gorevler' ? ['canli_gorevler', 'canli_gorevler_arsiv'] : ['gorevler']
    let gorev: any = null
    for (const tbl of tables) {
      const { data } = await admin.from(tbl).select('id,firma_id,lokasyon_id').eq('id', task_id).maybeSingle()
      if (data) { gorev = data; break }
    }
    if (!gorev) return NextResponse.json({ error: 'Görev bulunamadı' }, { status: 404 })
    if (!isSA && gorev.firma_id !== me.firma_id) return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

    const gorevIdKolonu = task_type === 'gorevler' ? 'gorev_id' : 'canli_gorev_id'

    // Lokasyon → sablon bilgisi
    const { data: lokasyon } = await admin.from('lokasyonlar')
      .select('id,checklist_sablon_id').eq('id', gorev.lokasyon_id).maybeSingle()
    const sablonId = lokasyon?.checklist_sablon_id ?? null
    let templateVersion = 1
    if (sablonId) {
      const { data: sablon } = await admin.from('checklist_sablonlari')
        .select('versiyon').eq('id', sablonId).maybeSingle()
      templateVersion = sablon?.versiyon ?? 1
    }

    // Mevcut sonuç başlığını bul veya oluştur
    const { data: mevcutlar } = await admin.from('checklist_sonuc_basliklari')
      .select('id').eq(gorevIdKolonu, task_id).order('kayit_tarihi', { ascending: false }).limit(1)

    let sonucId: string
    if (mevcutlar && mevcutlar.length > 0) {
      sonucId = mevcutlar[0].id
    } else {
      const insertPayload: any = {
        kullanici_id:     me.id,
        kanal:            'WEB',
        lokasyon_id:      gorev.lokasyon_id,
        sablon_id:        sablonId,
        template_version: templateVersion,
      }
      insertPayload[gorevIdKolonu] = task_id
      const { data: yeni, error: insertErr } = await admin
        .from('checklist_sonuc_basliklari').insert(insertPayload).select('id').single()
      if (insertErr || !yeni) return NextResponse.json({ error: insertErr?.message ?? 'Sonuç başlığı oluşturulamadı' }, { status: 500 })
      sonucId = yeni.id
    }

    // ── Şablon maddelerini çek (validasyon için) ─────────────────────────
    const { data: sablonMaddeler } = await admin.from('checklist_sablon_maddeleri')
      .select('id,zorunlu_cevap,gorsel_gerekli')
      .in('id', maddeler.map(m => m.madde_id))

    if (sablonMaddeler) {
      const cevapMap = new Map(maddeler.map(m => [m.madde_id, m]))
      for (const sm of sablonMaddeler) {
        const cevap = cevapMap.get(sm.id)
        const dolu = !!(cevap?.secenek_degeri || cevap?.aciklama)
        if (sm.zorunlu_cevap !== false && !dolu) {
          return NextResponse.json({ error: 'Zorunlu alanlar eksik', validation: true }, { status: 422 })
        }
      }
    }

    // ── Mevcut gorsel_url'leri koru, diğerlerini sil ─────────────────────
    const { data: mevcutCevaplar } = await admin.from('checklist_sonuc_maddeleri')
      .select('madde_id,gorsel_url').eq('sonuc_id', sonucId)
    const gorselMap = new Map<string, string | null>()
    for (const mc of mevcutCevaplar ?? []) {
      if (mc.gorsel_url) gorselMap.set(mc.madde_id, mc.gorsel_url)
    }

    await admin.from('checklist_sonuc_maddeleri').delete().eq('sonuc_id', sonucId)

    const doldurulanlar = maddeler.filter(m => m.secenek_degeri || m.aciklama || m.gorsel_url || gorselMap.has(m.madde_id))
    if (doldurulanlar.length > 0) {
      const { error: maddeErr } = await admin.from('checklist_sonuc_maddeleri').insert(
        doldurulanlar.map(m => ({
          sonuc_id:       sonucId,
          madde_id:       m.madde_id,
          secenek_degeri: m.secenek_degeri || null,
          aciklama:       m.aciklama?.trim() || null,
          gorsel_url:     m.gorsel_url !== undefined ? (m.gorsel_url || null) : (gorselMap.get(m.madde_id) ?? null),
        }))
      )
      if (maddeErr) return NextResponse.json({ error: maddeErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[checklist-results POST]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
