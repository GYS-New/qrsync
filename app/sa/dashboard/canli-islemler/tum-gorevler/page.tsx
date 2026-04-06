import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import TumGorevlerClient from '@/components/canli/TumGorevlerClient'
import { redirect } from 'next/navigation'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { getEfektifAyar } from '@/lib/ayarlar/getEfektifAyar'

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
          <div style={{ color: '#9a7b6a', fontSize: 14 }}>Önce firma seçmelisin (sağ üstten).</div>
        </div>
      </div>
    )
  }

  const aktifProje = await getAktifProje(firmaId)
  const projeId = aktifProje?.id ?? null

  const sel = '*,lokasyonlar(tanim),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim),olusturan:users!olusturan_id(isim_soyisim),tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim),iptalEden:users!iptal_eden_id(isim_soyisim)'

  let gorevQ = supabase
    .from('canli_gorevler')
    .select(sel)
    .eq('firma_id', firmaId)
    .in('durum', ['HAZIR', 'ACIK', 'BEKLEMEDE', 'ISLEMDE', 'TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS', 'IPTAL', 'KAPATILDI', 'SILINDI'])
    .order('aktif_olma_tarihi', { ascending: false })
    .limit(500)
  if (projeId) gorevQ = (gorevQ as any).or(`proje_id.eq.${projeId},proje_id.is.null`)

  let lokQ = supabase
    .from('lokasyonlar')
    .select('id,tanim,parent_id,checklist_sablon_id')
    .eq('firma_id', firmaId)
    .eq('aktif', true)
    .order('tanim')
  if (projeId) lokQ = (lokQ as any).eq('proje_id', projeId)

  const [{ data: gorevler }, { data: lokasyonlar }, { data: kullanicilar }, ayarlar] = await Promise.all([
    gorevQ,
    lokQ,
    (() => { let q = supabase.from('users').select('id,isim_soyisim').eq('firma_id', firmaId).eq('aktif', true); if (projeId) q = (q as any).eq('proje_id', projeId); return q.order('isim_soyisim') })(),
    getEfektifAyar(firmaId, projeId),
  ])

  return (
    <div>
      <Topbar title="Tüm Görevler" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Frekansiyel Görevler' }, { label: 'Tüm Görevler' }]} />
      <TumGorevlerClient
        base="/sa"
        firmaId={firmaId}
        projeId={projeId}
        meId={me.id}
        readonly={false}
        lokasyonlar={(lokasyonlar as any) ?? []}
        kullanicilar={(kullanicilar as any) ?? []}
        initialGorevler={(gorevler as any) ?? []}
        personelAtamaAktif={ayarlar.frekansiyel_personel_atama_aktif}
      />
    </div>
  )
}
