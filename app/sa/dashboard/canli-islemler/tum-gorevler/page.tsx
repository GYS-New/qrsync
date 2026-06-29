import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import Topbar from '@/components/layout/Topbar'
import TumGorevlerClient from '@/components/canli/TumGorevlerClient'
import { redirect } from 'next/navigation'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { getEfektifAyar } from '@/lib/ayarlar/getEfektifAyar'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'
import { getActorMap } from '@/lib/yetki/getActorMap'

export const dynamic = 'force-dynamic'

export default async function SATumGorevlerPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('*').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/login')

  const firmaId = getAktifFirmaId()
  if (!firmaId) {
    return (
      <div>
        <Topbar title="Tüm Görevler" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Frekansiyel Görevler' }, { label: 'Tüm Görevler' }]} />
        <div className="verde-card" style={{ padding: 18 }}>
          <div style={{ color: '#6b7280', fontSize: 14 }}>Önce firma seçmelisin (sağ üstten).</div>
        </div>
      </div>
    )
  }

  const aktifProje = await getAktifProje(firmaId)
  const projeId = aktifProje?.id ?? null

  const sel = '*,lokasyonlar(tanim),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim),olusturan:users!olusturan_id(isim_soyisim),tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim),iptalEden:users!iptal_eden_id(isim_soyisim)'

  // Modül izolasyonu: Oto Yıkama lokasyonları + bunlara ait görevler GYS UI'da gizlenir.
  const gizliOtoYikamaIds = await getOtoYikamaLokasyonIds(supabase as any, firmaId)
  const gizliFilterArg = gizliOtoYikamaIds.size > 0 ? `(${[...gizliOtoYikamaIds].join(',')})` : null

  // Aktif tablodaki tüm görevleri çek (arşivlenmemiş olanlar)
  const gorevler = await fetchAll(() => {
    let q = supabase.from('canli_gorevler').select(sel)
      .eq('firma_id', firmaId)
      .order('aktif_olma_tarihi', { ascending: false })
    if (projeId) q = (q as any).or(`proje_id.eq.${projeId},proje_id.is.null`)
    if (gizliFilterArg) q = (q as any).not('lokasyon_id', 'in', gizliFilterArg)
    return q
  })

  let lokQ = supabase
    .from('lokasyonlar')
    .select('id,tanim,parent_id,checklist_sablon_id')
    .eq('firma_id', firmaId)
    .eq('aktif', true)
    .order('tanim')
  if (projeId) lokQ = (lokQ as any).eq('proje_id', projeId)
  if (gizliFilterArg) lokQ = (lokQ as any).not('id', 'in', gizliFilterArg)

  const [{ data: lokasyonlar }, { data: kullanicilar }, ayarlar, actorAdMap] = await Promise.all([
    lokQ,
    (() => { let q = supabase.from('users').select('id,isim_soyisim').eq('firma_id', firmaId).eq('aktif', true); if (projeId) q = (q as any).eq('proje_id', projeId); return q.order('isim_soyisim') })(),
    getEfektifAyar(firmaId, projeId),
    getActorMap((gorevler as any) ?? []),
  ])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <Topbar title="Tüm Görevler" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Frekansiyel Görevler' }, { label: 'Tüm Görevler' }]} />
      <TumGorevlerClient
        base="/sa"
        firmaId={firmaId}
        projeId={projeId}
        meId={me.id}
        meName={me.isim_soyisim ?? undefined}
        readonly={false}
        lokasyonlar={(lokasyonlar as any) ?? []}
        kullanicilar={(kullanicilar as any) ?? []}
        initialGorevler={(gorevler as any) ?? []}
        actorAdMap={actorAdMap}
        personelAtamaAktif={ayarlar.frekansiyel_personel_atama_aktif}
        ceklistAktif={ayarlar.frekansiyel_ceklist_aktif}
        islemSureleriAktif={ayarlar.islem_sureleri_aktif}
      />
    </div>
  )
}
