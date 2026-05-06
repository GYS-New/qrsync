import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const SAYFA_KODU = 'personel-degerlendirme-raporlari'

/**
 * GET /api/raporlar/personel-degerlendirme
 *
 * Query params:
 *   firma_id        — zorunlu (TA/U için kendi firma_id'si ile eşleşmeli)
 *   proje_id        — opsiyonel
 *   tarih_baslangic — ISO date (YYYY-MM-DD), default: 30 gün önce
 *   tarih_bitis     — ISO date, default: bugün
 *   ust_lokasyon_id — opsiyonel filtre (yalnızca o üst lokasyonda görev yapanlar)
 *   personel_id     — opsiyonel filtre (tek personel)
 *
 * Tarih aralığında personel başına tamamlanan, iptal edilen görev sayısı,
 * ortalama tamamlanma süresi, cihaz eşleşme ve aktiflik durumu döner.
 * Hem canli_gorevler hem de canli_gorevler_arsiv'den veri çeker.
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  if (!isSA) {
    const gorebilir = await sayfaGorebilirMi(me.rol, SAYFA_KODU, me.firma_id ?? null)
    if (!gorebilir) return NextResponse.json({ ok: false, error: 'Yetki yok' }, { status: 403 })
  }

  const p = req.nextUrl.searchParams
  const firmaIdParam = p.get('firma_id')
  const firmaId = isSA ? firmaIdParam : me.firma_id
  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  if (!isSA && firmaIdParam && firmaIdParam !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erişim yok' }, { status: 403 })
  }

  // Proje scope: U/M için kendi proje_id'sine zorla
  let projeId = p.get('proje_id') || null
  if (me.rol === 'tenant_user' || me.rol === 'musteri') {
    projeId = (me as any).proje_id ?? null
  }

  const ustLokFilter = p.get('ust_lokasyon_id') || null
  const personelFilter = p.get('personel_id') || null

  // Tarih aralığı (default: son 30 gün)
  const today = new Date()
  const defaultStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
  const tarihBaslangic = p.get('tarih_baslangic') || defaultStart.toISOString().slice(0, 10)
  const tarihBitis = p.get('tarih_bitis') || today.toISOString().slice(0, 10)
  const tarihBitisInclusive = `${tarihBitis}T23:59:59.999Z`
  const tarihBaslangicInclusive = `${tarihBaslangic}T00:00:00.000Z`

  const admin = createAdminClient()

  // ── 1. Personeller ─────────────────────────────────────────────────────────
  // ust_lokasyon_id doğrudan users tablosunda — kullanıcı oluşturulurken atanır
  let userQ = admin
    .from('users')
    .select('id, isim_soyisim, aktif, rol, ust_lokasyon_id')
    .eq('firma_id', firmaId)
    .in('rol', ['tenant_user', 'musteri'])
  if (projeId) userQ = (userQ as any).eq('proje_id', projeId)
  const { data: personeller } = await userQ.order('isim_soyisim', { ascending: true })

  const personelIds = (personeller ?? []).map((u: any) => u.id)
  if (personelIds.length === 0) {
    return NextResponse.json({
      ok: true,
      data: [],
      meta: {
        tarih_baslangic: tarihBaslangic,
        tarih_bitis: tarihBitis,
        ust_lokasyonlar: [],
        personeller: [],
      },
    })
  }

  // ── 2. Üst lokasyonlar (root: parent_id IS NULL) ───────────────────────────
  const { data: ustLokRows } = await admin
    .from('lokasyonlar')
    .select('id, tanim')
    .eq('firma_id', firmaId)
    .is('parent_id', null)
    .order('tanim', { ascending: true })

  const lokAdMap = new Map<string, string>()
  for (const l of ustLokRows ?? []) lokAdMap.set((l as any).id, (l as any).tanim)
  const ustLokasyonlar = (ustLokRows ?? []).map((l: any) => ({ id: l.id, tanim: l.tanim }))

  // ── 3. Görevler — canli_gorevler + canli_gorevler_arsiv ────────────────────
  const SELECT_COLS = 'tamamlayan_kullanici_id, iptal_eden_id, durum, tamamlanma_suresi_saniye'

  let liveQ = admin
    .from('canli_gorevler')
    .select(SELECT_COLS)
    .eq('firma_id', firmaId)
    .gte('aktif_olma_tarihi', tarihBaslangicInclusive)
    .lte('aktif_olma_tarihi', tarihBitisInclusive)
  if (projeId) liveQ = (liveQ as any).eq('proje_id', projeId)
  const { data: liveTasks } = await liveQ

  let arsivQ = admin
    .from('canli_gorevler_arsiv')
    .select(SELECT_COLS)
    .eq('firma_id', firmaId)
    .gte('aktif_olma_tarihi', tarihBaslangicInclusive)
    .lte('aktif_olma_tarihi', tarihBitisInclusive)
  if (projeId) arsivQ = (arsivQ as any).eq('proje_id', projeId)
  const { data: arsivTasks } = await arsivQ

  const allTasks = [...(liveTasks ?? []), ...(arsivTasks ?? [])]

  // ── 4. Cihaz eşleşme ───────────────────────────────────────────────────────
  const { data: deviceRows } = await admin
    .from('device_tokens')
    .select('user_id')
    .in('user_id', personelIds)
    .eq('aktif', true)
    .not('fcm_token', 'is', null)
  const eslesenSet = new Set((deviceRows ?? []).map((r: any) => r.user_id))

  // ── 5. Personel başına agregasyon ──────────────────────────────────────────
  // NOT: Tamamlanma — frekansiyel görevlerde atanan_kullanici_id NULL,
  //      iş mobilde tamamlanınca tamamlayan_kullanici_id dolar. O yüzden
  //      "tamamladığı görev" = tamamlayan_kullanici_id eşleşmesi.
  type Agg = {
    tamamlandi: number
    iptal: number
    sureToplam: number
    sureSayi: number
  }
  const aggMap = new Map<string, Agg>()
  for (const pid of personelIds) {
    aggMap.set(pid, { tamamlandi: 0, iptal: 0, sureToplam: 0, sureSayi: 0 })
  }

  for (const t of allTasks as any[]) {
    const tamamlayan = t.tamamlayan_kullanici_id as string | null
    const iptalEden = t.iptal_eden_id as string | null
    const durum = t.durum as string

    if (tamamlayan && aggMap.has(tamamlayan) && durum === 'TAMAMLANDI') {
      const a = aggMap.get(tamamlayan)!
      a.tamamlandi++
      if (typeof t.tamamlanma_suresi_saniye === 'number' && t.tamamlanma_suresi_saniye > 0) {
        a.sureToplam += t.tamamlanma_suresi_saniye
        a.sureSayi++
      }
    }

    if (iptalEden && aggMap.has(iptalEden) && durum === 'IPTAL') {
      const a = aggMap.get(iptalEden)!
      a.iptal++
    }
  }

  // ── 6. Sonuç satırları ─────────────────────────────────────────────────────
  let rows = (personeller ?? []).map((u: any) => {
    const a = aggMap.get(u.id)!
    const ustLokId = u.ust_lokasyon_id ?? null
    return {
      personel_id: u.id,
      isim_soyisim: u.isim_soyisim,
      aktif: u.aktif === true,
      cihaz_eslesti: eslesenSet.has(u.id),
      ust_lokasyon_id: ustLokId,
      ust_lokasyon_adi: ustLokId ? lokAdMap.get(ustLokId) ?? null : null,
      tamamlandi_sayi: a.tamamlandi,
      iptal_sayi: a.iptal,
      ortalama_sure_saniye: a.sureSayi > 0 ? Math.round(a.sureToplam / a.sureSayi) : null,
    }
  })

  // Filtreler
  if (ustLokFilter) rows = rows.filter(r => r.ust_lokasyon_id === ustLokFilter)
  if (personelFilter) rows = rows.filter(r => r.personel_id === personelFilter)

  return NextResponse.json({
    ok: true,
    data: rows,
    meta: {
      tarih_baslangic: tarihBaslangic,
      tarih_bitis: tarihBitis,
      ust_lokasyonlar: ustLokasyonlar,
      personeller: (personeller ?? []).map((u: any) => ({ id: u.id, isim_soyisim: u.isim_soyisim })),
    },
  })
}
