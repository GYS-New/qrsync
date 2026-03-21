/**
 * GET /api/reports/spesifik-rapor
 * Spesifik Görevler (gorevler tablosu) için özelleştirilebilir rapor verisi.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'

function fmt(v: string | null | undefined) {
  if (!v) return '—'
  const d = new Date(v)
  if (isNaN(d.getTime())) return String(v)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth()+1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function fmtSure(sn: number | null | undefined) {
  if (!sn) return '—'
  const h = Math.floor(sn / 3600)
  const m = Math.floor((sn % 3600) / 60)
  const s = sn % 60
  if (h > 0) return `${h}s ${m}dk`
  if (m > 0) return `${m}dk ${s}sn`
  return `${s}sn`
}

function withinRange(v: string | null | undefined, from?: string | null, to?: string | null) {
  if (!v) return false
  const t = new Date(v).getTime()
  if (from && t < new Date(`${from}T00:00:00`).getTime()) return false
  if (to   && t > new Date(`${to}T23:59:59.999`).getTime()) return false
  return true
}

export async function GET(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id,rol,firma_id,isim_soyisim').eq('id', authUser.id).single()
    if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı.' }, { status: 401 })

    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const isTA = me.rol === 'tenant_admin'
    if (!isSA && !isTA) return NextResponse.json({ error: 'Yetkisiz erişim.' }, { status: 403 })

    const p = new URL(req.url).searchParams
    const firmaId       = isSA ? p.get('firmaId') : me.firma_id
    const projeId       = p.get('projeId')       ?? null
    const baslangic     = p.get('baslangic')      ?? null
    const bitis         = p.get('bitis')          ?? null
    const raporuAlan    = p.get('raporuAlan')     ?? (me.isim_soyisim ?? '')
    const lokasyonId    = p.get('lokasyonId')     ?? null
    const atananId      = p.get('atananId')       ?? null
    const durumFiltreRaw = p.get('durum')         ?? null

    if (!firmaId) return NextResponse.json({ error: 'Firma ID gerekli.' }, { status: 400 })

    const admin = createAdminClient()

    // Firma adı
    const { data: firma } = await admin.from('firmalar').select('firma_adi,ticari_unvan').eq('id', firmaId).single()
    const firmaAdi = firma?.firma_adi || firma?.ticari_unvan || '—'

    // Proje adı
    let projeAdi = ''
    if (projeId) {
      const { data: proje } = await admin.from('projeler').select('ad').eq('id', projeId).single()
      projeAdi = proje?.ad ?? ''
    }

    // Lokasyonlar
    let lokQ = admin.from('lokasyonlar').select('id,tanim,parent_id').eq('firma_id', firmaId).eq('aktif', true)
    if (projeId) lokQ = (lokQ as any).eq('proje_id', projeId)
    const { data: lokasyonlar } = await lokQ
    const lokMap = new Map<string, any>((lokasyonlar ?? []).map((l: any) => [l.id, l]))

    // Kullanıcılar
    const { data: kullanicilar } = await admin.from('users').select('id,isim_soyisim').eq('firma_id', firmaId).eq('aktif', true)
    const userMap = new Map<string, string>((kullanicilar ?? []).map((u: any) => [u.id, u.isim_soyisim ?? '']))

    // Görevler (aktif tablo)
    let qAktif = admin.from('gorevler')
      .select('id,tanim,durum,lokasyon_id,atanan_kullanici_id,olusturan_id,islemi_yapan_id,olusturma_tarihi,tamamlanma_tarihi,tamamlanma_suresi_saniye,durum_degisim_tarihi')
      .eq('firma_id', firmaId)
    if (projeId)     qAktif = (qAktif as any).eq('proje_id', projeId)
    if (lokasyonId)  qAktif = (qAktif as any).eq('lokasyon_id', lokasyonId)
    if (atananId)    qAktif = (qAktif as any).eq('atanan_kullanici_id', atananId)
    if (durumFiltreRaw && durumFiltreRaw !== 'TUMU') qAktif = (qAktif as any).eq('durum', durumFiltreRaw)

    const { data: aktif } = await qAktif

    // Filtreleme: tarih aralığı
    const tumGorevler = (aktif ?? []).filter((g: any) => {
      if (baslangic || bitis) return withinRange(g.olusturma_tarihi, baslangic, bitis)
      return true
    })

    // ── İstatistikler ──────────────────────────────────────────────
    const toplam       = tumGorevler.length
    const tamamlanan   = tumGorevler.filter((g: any) => g.durum === 'TAMAMLANDI').length
    const acik         = tumGorevler.filter((g: any) => g.durum === 'ACIK').length
    const islemde      = tumGorevler.filter((g: any) => g.durum === 'ISLEMDE').length
    const iptal        = tumGorevler.filter((g: any) => g.durum === 'IPTAL').length
    const basariOrani  = toplam > 0 ? Math.round((tamamlanan / toplam) * 100) : 0

    // Ortalama tamamlanma süresi
    const sureler = tumGorevler
      .filter((g: any) => g.tamamlanma_suresi_saniye)
      .map((g: any) => g.tamamlanma_suresi_saniye as number)
    const ortSure = sureler.length > 0 ? Math.round(sureler.reduce((a, b) => a + b, 0) / sureler.length) : null

    // Lokasyon bazlı dağılım
    const lokBazli: Record<string, { toplam: number; tamamlanan: number; iptal: number }> = {}
    for (const g of tumGorevler) {
      const lid = g.lokasyon_id ?? '__yok'
      if (!lokBazli[lid]) lokBazli[lid] = { toplam: 0, tamamlanan: 0, iptal: 0 }
      lokBazli[lid].toplam++
      if (g.durum === 'TAMAMLANDI') lokBazli[lid].tamamlanan++
      if (g.durum === 'IPTAL') lokBazli[lid].iptal++
    }
    const lokBazliRows = Object.entries(lokBazli)
      .map(([lid, v]) => ({
        lokasyon: lid === '__yok' ? '—' : (lokMap.get(lid)?.tanim ?? '—'),
        toplam: v.toplam,
        tamamlanan: v.tamamlanan,
        iptal: v.iptal,
        basari: v.toplam > 0 ? `%${Math.round(v.tamamlanan / v.toplam * 100)}` : '%0',
      }))
      .sort((a, b) => b.toplam - a.toplam)

    // Personel bazlı dağılım
    const persBazli: Record<string, { toplam: number; tamamlanan: number }> = {}
    for (const g of tumGorevler) {
      const uid = g.atanan_kullanici_id ?? '__yok'
      if (!persBazli[uid]) persBazli[uid] = { toplam: 0, tamamlanan: 0 }
      persBazli[uid].toplam++
      if (g.durum === 'TAMAMLANDI') persBazli[uid].tamamlanan++
    }
    const persBazliRows = Object.entries(persBazli)
      .map(([uid, v]) => ({
        personel: uid === '__yok' ? 'Atanmamış' : (userMap.get(uid) ?? '—'),
        toplam: v.toplam,
        tamamlanan: v.tamamlanan,
        basari: v.toplam > 0 ? `%${Math.round(v.tamamlanan / v.toplam * 100)}` : '%0',
      }))
      .sort((a, b) => b.toplam - a.toplam)

    // Tamamlanan görevler listesi
    const tamamlananGorevler = tumGorevler
      .filter((g: any) => g.durum === 'TAMAMLANDI')
      .sort((a: any, b: any) => new Date(b.tamamlanma_tarihi ?? 0).getTime() - new Date(a.tamamlanma_tarihi ?? 0).getTime())
      .map((g: any, i: number) => ({
        sn: i + 1,
        tanim: g.tanim ?? '—',
        lokasyon: lokMap.get(g.lokasyon_id)?.tanim ?? '—',
        atanan: g.atanan_kullanici_id ? userMap.get(g.atanan_kullanici_id) ?? '—' : '—',
        tamamlayan: g.islemi_yapan_id ? userMap.get(g.islemi_yapan_id) ?? '—' : '—',
        olusturma: fmt(g.olusturma_tarihi),
        tamamlanma: fmt(g.tamamlanma_tarihi),
        sure: fmtSure(g.tamamlanma_suresi_saniye),
      }))

    // İptal / açık görevler listesi
    const aktifGorevler = tumGorevler
      .filter((g: any) => ['ACIK', 'ISLEMDE', 'IPTAL'].includes(g.durum))
      .sort((a: any, b: any) => new Date(b.olusturma_tarihi ?? 0).getTime() - new Date(a.olusturma_tarihi ?? 0).getTime())
      .map((g: any, i: number) => ({
        sn: i + 1,
        tanim: g.tanim ?? '—',
        lokasyon: lokMap.get(g.lokasyon_id)?.tanim ?? '—',
        atanan: g.atanan_kullanici_id ? userMap.get(g.atanan_kullanici_id) ?? '—' : '—',
        durum: g.durum,
        olusturma: fmt(g.olusturma_tarihi),
        sonIslem: fmt(g.durum_degisim_tarihi),
      }))

    // Tarih aralığı etiketi
    const raporTarihLabel = baslangic && bitis
      ? `${baslangic} – ${bitis}`
      : baslangic ? `${baslangic} sonrası`
      : bitis ? `${bitis} öncesi`
      : 'Tüm zamanlar'

    return NextResponse.json({
      ok: true,
      meta: { firmaAdi, projeAdi, raporTarihLabel, raporuAlan },
      ozet: { toplam, tamamlanan, acik, islemde, iptal, basariOrani, ortSure },
      lokBazliRows,
      persBazliRows,
      tamamlananGorevler,
      aktifGorevler,
      lokasyonlar: (lokasyonlar ?? []).map((l: any) => ({ id: l.id, tanim: l.tanim })),
      kullanicilar: (kullanicilar ?? []).map((u: any) => ({ id: u.id, isim_soyisim: u.isim_soyisim })),
    })
  } catch (err: any) {
    console.error('[spesifik-rapor]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası.' }, { status: 500 })
  }
}
