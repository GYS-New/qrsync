import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import TumGorevlerClient from '@/components/canli/TumGorevlerClient'
import { redirect } from 'next/navigation'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

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

  const [{ data: gorevler }, { data: lokasyonlar }, { data: kullanicilar }] = await Promise.all([
    supabase
      .from('canli_gorevler')
      .select(sel)
      .eq('firma_id', firmaId)
      .or(`proje_id.eq.${aktifProje.id},proje_id.is.null`)
      .in('durum', ['HAZIR', 'ACIK', 'BEKLEMEDE', 'ISLEMDE', 'TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS', 'IPTAL', 'KAPATILDI'])
      .order('aktif_olma_tarihi', { ascending: false })
      .limit(500),
    supabase
      .from('lokasyonlar')
      .select('id,tanim,parent_id,checklist_sablon_id')
      .eq('firma_id', firmaId)
      .eq('proje_id', aktifProje.id)
      .eq('aktif', true)
      .order('tanim'),
    (() => { let q = supabase.from('users').select('id,isim_soyisim').eq('firma_id', firmaId).eq('aktif', true); q = (q as any).eq('proje_id', aktifProje.id); return q.order('isim_soyisim') })(),
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
        readonly={me.rol === 'tenant_user'}
        lokasyonlar={(lokasyonlar as any) ?? []}
        kullanicilar={(kullanicilar as any) ?? []}
        initialGorevler={(gorevler as any) ?? []}
        projeId={aktifProje.id}
      />
    </div>
  )
}
