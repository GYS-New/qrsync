import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import GorevlerClient from '@/components/gorev/GorevlerClient'
import { redirect } from 'next/navigation'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'
import { getEfektifAyar } from '@/lib/ayarlar/getEfektifAyar'
import { getYetkiliLokasyonIds } from '@/lib/yetki/getLokasyonYetki'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

export const dynamic = 'force-dynamic'

export default async function UGorevlerPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase
    .from('users')
    .select('id,rol,firma_id,proje_id')
    .eq('id', authUser.id)
    .single()
  if (!me) redirect('/login')

  const firmaId = me.firma_id
  const projeId = me.proje_id

  // Yetki kontrolü
  const yetki = await sayfaYetkileri(me.rol, 'gorevler', firmaId ?? null)
  if (!yetki.gorebilir) redirect('/u/dashboard')

  const readonly = !yetki.ekleyebilir && !yetki.duzenleyebilir && !yetki.silebilir

  // Yetkili lokasyon kısıtlaması
  const yetkiliLokIds = firmaId ? await getYetkiliLokasyonIds(supabase, firmaId, projeId) : null

  // Modül izolasyonu: Oto Yıkama lokasyonları GYS UI'da gizli (yıkama personeli
  // dahil — yıkama akışı /oto-yikama modülünde)
  const gizliOtoIds = firmaId ? await getOtoYikamaLokasyonIds(supabase as any, firmaId) : new Set<string>()
  const gizliFilterArg = gizliOtoIds.size > 0 ? `(${[...gizliOtoIds].join(',')})` : null

  // CHUNK-AWARE: musteri yetkiliLokIds 2000+ UUID -> URL overflow -> fetch failed.
  const buildGorevQ = (slice: string[] | null) => {
    let q = supabase
      .from('gorevler_normal')
      .select('*,lokasyonlar(id,tanim,parent_id),atanan:users!atanan_kullanici_id(isim_soyisim)')
      .eq('firma_id', firmaId)
      .order('olusturma_tarihi', { ascending: false })
      .limit(500)
    if (projeId) q = (q as any).eq('proje_id', projeId)
    if (slice) q = q.in('lokasyon_id', slice)
    if (gizliFilterArg) q = (q as any).not('lokasyon_id', 'in', gizliFilterArg)
    return q
  }
  const buildLokQ = (slice: string[] | null) => {
    let q = supabase
      .from('lokasyonlar')
      .select('id,tanim,aktif,parent_id')
      .eq('firma_id', firmaId)
      .eq('aktif', true)
      .order('tanim')
    if (projeId) q = (q as any).eq('proje_id', projeId)
    if (slice) q = q.in('id', slice)
    if (gizliFilterArg) q = (q as any).not('id', 'in', gizliFilterArg)
    return q
  }
  const chunkedFetch = async <T,>(buildFn: (slice: string[] | null) => any): Promise<T[]> => {
    if (!yetkiliLokIds) { const { data } = await buildFn(null); return (data ?? []) as T[] }
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

  const [gorevlerRaw, lokasyonlar] = await Promise.all([
    chunkedFetch<any>(buildGorevQ),
    chunkedFetch<any>(buildLokQ),
  ])
  // limit 500 chunk sonrasi re-sort + slice
  const gorevler = gorevlerRaw
    .sort((a: any, b: any) => (b.olusturma_tarihi ?? '').localeCompare(a.olusturma_tarihi ?? ''))
    .slice(0, 500)

  const { data: kullanicilar } = await supabase
    .from('users')
    .select('id,isim_soyisim,aktif')
    .eq('firma_id', firmaId)
    .eq('aktif', true)
    .order('isim_soyisim')

  const ayarlar = await getEfektifAyar(firmaId!, projeId)

  return (
    <div>
      <Topbar title="Spesifik Görevler" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Spesifik Görevler' }]} />
      <GorevlerClient
        base="/u"
        meId={me.id}
        readonly={readonly}
        initialFirmaId={firmaId}
        initialGorevler={(gorevler as any) ?? []}
        initialLokasyonlar={(lokasyonlar as any) ?? []}
        initialKullanicilar={(kullanicilar as any) ?? []}
        projeId={projeId ?? null}
        personelAtamaAktif={ayarlar.spesifik_personel_atama_aktif}
        ceklistAktif={ayarlar.spesifik_ceklist_aktif}
        yetkiliLokIds={yetkiliLokIds}
      />
    </div>
  )
}
