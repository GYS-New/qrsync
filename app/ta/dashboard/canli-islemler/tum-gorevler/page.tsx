import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import Topbar from '@/components/layout/Topbar'
import TumGorevlerClient from '@/components/canli/TumGorevlerClient'
import { redirect } from 'next/navigation'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { getEfektifAyar } from '@/lib/ayarlar/getEfektifAyar'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'
import { getActorMap } from '@/lib/yetki/getActorMap'

export const dynamic = 'force-dynamic'

export default async function TATumGorevlerPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('*').eq('id', authUser.id).single()
  const firmaId = me?.firma_id
  if (!firmaId) redirect('/login')

  const aktifProje = await getAktifProje(firmaId)
  if (!aktifProje) return (
    <div>
      <Topbar title="Tum Gorevler" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: 'Frekansiyel Gorevler' }, { label: 'Tum Gorevler' }]} />
      <ProjeSecilmedi />
    </div>
  )

  const sel = '*,lokasyonlar(tanim),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim),olusturan:users!olusturan_id(isim_soyisim),tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim),iptalEden:users!iptal_eden_id(isim_soyisim)'

  // Modül izolasyonu: Oto Yıkama lokasyonları + bunlara ait görevler GYS UI'da gizlenir.
  const gizliOtoYikamaIds = await getOtoYikamaLokasyonIds(supabase as any, firmaId)
  const gizliFilterArg = gizliOtoYikamaIds.size > 0 ? `(${[...gizliOtoYikamaIds].join(',')})` : null

  const gorevler = await fetchAll(() => {
    let q = supabase.from('canli_gorevler').select(sel)
      .eq('firma_id', firmaId)
      .or(`proje_id.eq.${aktifProje.id},proje_id.is.null`)
      .order('aktif_olma_tarihi', { ascending: false })
    if (gizliFilterArg) q = (q as any).not('lokasyon_id', 'in', gizliFilterArg)
    return q
  })

  let lokQ = supabase
    .from('lokasyonlar')
    .select('id,tanim,parent_id,checklist_sablon_id')
    .eq('firma_id', firmaId)
    .eq('proje_id', aktifProje.id)
    .eq('aktif', true)
    .order('tanim')
  if (gizliFilterArg) lokQ = (lokQ as any).not('id', 'in', gizliFilterArg)

  const [{ data: lokasyonlar }, { data: kullanicilar }, ayarlar, actorAdMap] = await Promise.all([
    lokQ,
    (() => { let q = supabase.from('users').select('id,isim_soyisim').eq('firma_id', firmaId).eq('aktif', true); q = (q as any).eq('proje_id', aktifProje.id); return q.order('isim_soyisim') })(),
    getEfektifAyar(firmaId, aktifProje.id),
    getActorMap((gorevler as any) ?? []),
  ])

  return (
    <div>
      <Topbar
        title="Tum Gorevler"
        base="/ta"
        breadcrumbs={[{ label: 'Yonetim' }, { label: aktifProje.ad }, { label: 'Frekansiyel Gorevler' }, { label: 'Tum Gorevler' }]}
      />
      <TumGorevlerClient
        base="/ta"
        firmaId={firmaId}
        meId={me.id}
        meName={me.isim_soyisim ?? undefined}
        readonly={me.rol === 'tenant_user'}
        lokasyonlar={(lokasyonlar as any) ?? []}
        kullanicilar={(kullanicilar as any) ?? []}
        initialGorevler={(gorevler as any) ?? []}
        actorAdMap={actorAdMap}
        projeId={aktifProje.id}
        personelAtamaAktif={ayarlar.frekansiyel_personel_atama_aktif}
        ceklistAktif={ayarlar.frekansiyel_ceklist_aktif}
        islemSureleriAktif={ayarlar.islem_sureleri_aktif}
      />
    </div>
  )
}
