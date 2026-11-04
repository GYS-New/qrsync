import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import CanliIslemlerClient from '@/components/canli/CanliIslemlerClient'
import { redirect } from 'next/navigation'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'
import { getYetkiliLokasyonIds } from '@/lib/yetki/getLokasyonYetki'
import { getEfektifAyar } from '@/lib/ayarlar/getEfektifAyar'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

export const dynamic = 'force-dynamic'

export default async function UserCanliIslemler() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase
    .from('users')
    .select('id,firma_id,proje_id,rol,isim_soyisim')
    .eq('id', authUser.id)
    .single()
  if (!me) redirect('/login')

  const firmaId = me.firma_id
  const projeId = me.proje_id

  // Yetki kontrolü
  const [canliYetki, tumGorevlerYetki] = await Promise.all([
    sayfaYetkileri(me.rol, 'canli-islemler', firmaId ?? null),
    sayfaYetkileri(me.rol, 'tum-gorevler', firmaId ?? null),
  ])
  if (!canliYetki.gorebilir) redirect('/u/dashboard')

  // Yetkili lokasyon kısıtlaması
  const yetkiliLokIds = firmaId ? await getYetkiliLokasyonIds(supabase, firmaId, projeId) : null

  // Modül izolasyonu: Oto Yıkama lokasyonları + görevleri GYS UI'da gizli
  const gizliOtoIds = firmaId ? await getOtoYikamaLokasyonIds(supabase as any, firmaId) : new Set<string>()
  const gizliFilterArg = gizliOtoIds.size > 0 ? `(${[...gizliOtoIds].join(',')})` : null

  // CHUNK-AWARE: musteri yetkiliLokIds 2000+ UUID -> URL overflow -> fetch failed.
  const buildLokQ = (slice: string[] | null) => {
    let q = supabase.from('lokasyonlar').select('id,tanim,aktif,parent_id')
      .eq('firma_id', firmaId).eq('aktif', true).order('tanim')
    if (projeId) q = (q as any).eq('proje_id', projeId)
    if (slice) q = q.in('id', slice)
    if (gizliFilterArg) q = (q as any).not('id', 'in', gizliFilterArg)
    return q
  }
  const buildGorevQ = (slice: string[] | null) => {
    let q = supabase.from('canli_gorevler')
      .select('*,lokasyonlar(tanim),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim),olusturan:users!olusturan_id(isim_soyisim),tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim),iptalEden:users!iptal_eden_id(isim_soyisim)')
      .eq('firma_id', firmaId).order('olusturma_tarihi', { ascending: false }).limit(50)
    if (projeId) q = (q as any).eq('proje_id', projeId)
    if (slice) q = q.in('lokasyon_id', slice)
    if (gizliFilterArg) q = (q as any).not('lokasyon_id', 'in', gizliFilterArg)
    return q
  }
  const chunkedFetch = async <T,>(buildFn: (slice: string[] | null) => any): Promise<T[]> => {
    if (!yetkiliLokIds) {
      const { data } = await buildFn(null)
      return (data ?? []) as T[]
    }
    const seen = new Set<string>()
    const out: T[] = []
    for (let i = 0; i < yetkiliLokIds.length; i += 100) {
      const { data } = await buildFn(yetkiliLokIds.slice(i, i + 100))
      for (const r of (data ?? []) as any[]) {
        if (!seen.has(r.id)) { seen.add(r.id); out.push(r) }
      }
    }
    return out
  }

  let kulQ2 = supabase.from('users').select('id,isim_soyisim,profil_foto').eq('firma_id', firmaId).eq('aktif', true)
  if (projeId) kulQ2 = (kulQ2 as any).eq('proje_id', projeId)

  const [lokasyonlarRaw, canliGorevlerRaw, { data: kullanicilar }] = await Promise.all([
    chunkedFetch<any>(buildLokQ),
    chunkedFetch<any>(buildGorevQ),
    kulQ2,
  ])
  const lokasyonlar = lokasyonlarRaw
  // Gorev limit 50 — chunk sonrasi re-sort + slice ile global top-50 garantile
  const canliGorevler = canliGorevlerRaw
    .sort((a: any, b: any) => (b.olusturma_tarihi ?? '').localeCompare(a.olusturma_tarihi ?? ''))
    .slice(0, 50)

  const readonly = !canliYetki.ekleyebilir && !canliYetki.duzenleyebilir && !canliYetki.silebilir

  const efektifAyar = await getEfektifAyar(firmaId!, projeId)

  return (
    <div>
      <Topbar title="Frekansiyel Görevler" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Frekansiyel Görevler' }]} />
      <CanliIslemlerClient
        firmaId={firmaId}
        lokasyonlar={lokasyonlar ?? []}
        kullanicilar={kullanicilar ?? []}
        initialGorevler={canliGorevler ?? []}
        meId={me.id}
        meName={me.isim_soyisim ?? undefined}
        projeId={projeId ?? null}
        readonly={readonly}
        showTumGorevler={tumGorevlerYetki.gorebilir}
        yetkiliLokIds={yetkiliLokIds}
        gizliOtoYikamaLokIds={[...gizliOtoIds]}
        canliAkisSureSaat={efektifAyar.canli_akis_sure_saat}
        ceklistAktif={efektifAyar.frekansiyel_ceklist_aktif}
        personelAtamaAktif={efektifAyar.frekansiyel_personel_atama_aktif}
        islemSureleriAktif={efektifAyar.islem_sureleri_aktif}
      />
    </div>
  )
}
