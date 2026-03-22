/**
 * GET /api/checklist-results?task_id=...&task_type=...
 * Görevin çeklist tamamlanma sonuçlarını döndürür. gorsel_url dahil.
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

    const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
    if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 401 })

    const p = new URL(req.url).searchParams
    const taskId   = p.get('task_id')
    const taskType = p.get('task_type') as 'gorevler' | 'canli_gorevler' | null
    if (!taskId || !taskType) return NextResponse.json({ error: 'task_id ve task_type gerekli' }, { status: 400 })

    const admin = createAdminClient()
    const isSA  = me.rol === 'super_admin' || me.rol === 'alt_super_admin'

    const tables = taskType === 'canli_gorevler'
      ? ['canli_gorevler', 'canli_gorevler_arsiv']
      : ['gorevler']

    const SEL = 'id,firma_id,tanim,durum,lokasyon_id,tamamlanma_tarihi,atanan_kullanici_id,islemi_yapan_id'
    let gorev: any = null
    for (const tbl of tables) {
      const { data } = await admin.from(tbl).select(SEL).eq('id', taskId).maybeSingle()
      if (data) { gorev = data; break }
    }
    if (!gorev) return NextResponse.json({ error: 'Görev bulunamadı' }, { status: 404 })
    if (!isSA && gorev.firma_id !== me.firma_id) {
      return NextResponse.json({ error: 'Bu göreve erişim yetkiniz yok' }, { status: 403 })
    }

    const { data: lok } = await admin.from('lokasyonlar')
      .select('id,tanim,checklist_sablon_id').eq('id', gorev.lokasyon_id).maybeSingle()

    const templateId = lok?.checklist_sablon_id ?? null
    if (!templateId) {
      return NextResponse.json({
        ok: true,
        gorev: { id: gorev.id, tanim: gorev.tanim, durum: gorev.durum, tamamlanma_tarihi: gorev.tamamlanma_tarihi },
        lokasyon: lok?.tanim ?? '—', sonuclar: [],
        mesaj: 'Bu lokasyona bağlı çeklist şablonu yok',
      })
    }

    const { data: items } = await admin.from('checklist_items')
      .select('id,sira,madde,zorunlu').eq('template_id', templateId).order('sira', { ascending: true })

    // gorsel_url dahil tüm alanlar
    const { data: results } = await admin.from('checklist_results')
      .select('id,item_id,durum,not_metni,kullanici_id,tarih,kanal,gorsel_url')
      .eq('task_id', taskId).eq('task_type', taskType).order('tarih', { ascending: true })

    const userIds = [...new Set((results ?? []).map((r: any) => r.kullanici_id).filter(Boolean))]
    const { data: usersData } = userIds.length
      ? await admin.from('users').select('id,isim_soyisim').in('id', userIds)
      : { data: [] }
    const userMap = new Map<string, string>((usersData ?? []).map((u: any) => [u.id, u.isim_soyisim ?? '']))

    const sonucMap = new Map<string, any>()
    for (const r of (results ?? [])) sonucMap.set(r.item_id, r)

    const sonuclar = (items ?? []).map((item: any) => {
      const s = sonucMap.get(item.id)
      return {
        sira: item.sira, madde: item.madde, zorunlu: item.zorunlu,
        durum: s?.durum ?? null, not: s?.not_metni ?? null,
        gorsel_url: s?.gorsel_url ?? null,
        yapan: s?.kullanici_id ? userMap.get(s.kullanici_id) ?? '—' : null,
        tarih: s?.tarih ? fmt(s.tarih) : null, kanal: s?.kanal ?? null,
        dolduruldu: !!s,
      }
    })

    return NextResponse.json({
      ok: true,
      gorev: {
        id: gorev.id, tanim: gorev.tanim, durum: gorev.durum,
        tamamlanma_tarihi: gorev.tamamlanma_tarihi,
        atanan: gorev.atanan_kullanici_id ? userMap.get(gorev.atanan_kullanici_id) ?? null : null,
      },
      lokasyon: lok?.tanim ?? '—',
      sonuclar,
    })
  } catch (err: any) {
    console.error('[checklist-results]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
