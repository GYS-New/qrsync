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
        lokasyon: lok?.tanim ?? '—',
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
      .select('id,kullanici_id,kanal,created_at')
      .eq(gorevIdKolonu, taskId)
      .order('created_at', { ascending: false })
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
        sira:      m.sira_no,
        madde:     m.baslik,
        zorunlu:   m.zorunlu_cevap !== false,
        gorsel_gerekli: !!m.gorsel_gerekli,
        secenekler: sec.map((s: any) => s.deger),
        durum:     c ? true : null,          // cevap verilmişse "tamamlandı" say
        secenek:   c?.secenek_degeri ?? null,
        not:       c?.aciklama ?? null,
        gorsel_url: c?.gorsel_url ?? null,
        yapan:     sonucBaslik ? yapanAdi : null,
        tarih:     sonucBaslik?.created_at ? fmt(sonucBaslik.created_at) : null,
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
      lokasyon: lok?.tanim ?? '—',
      sablon: sablonRow ? { baslik: (sablonRow as any).baslik, tanim: (sablonRow as any).tanim } : null,
      sonuclar: birlesik,
    })
  } catch (err: any) {
    console.error('[checklist-results]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
