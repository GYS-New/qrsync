import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import GorevKurallariClient from '@/components/gorev-kurallari/GorevKurallariClient'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function TAGorevKurallariPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase
    .from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me) redirect('/login')

  const firmaId = me.firma_id
  const aktifProje = await getAktifProje(firmaId)

  if (!aktifProje) return (
    <div>
      <Topbar title="Gorev Kurallari" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: 'Gorev Kurallari' }]} />
      <ProjeSecilmedi />
    </div>
  )

  const [{ data: kuralar }, { data: lokasyonlar }, { data: kullanicilar }] = await Promise.all([
    supabase
      .from('gorev_kurallari')
      .select('*,lokasyonlar(id,tanim,parent_id),atanan_kullanici:users!gorev_kurallari_atanan_kullanici_id_fkey(id,isim_soyisim)')
      .eq('firma_id', firmaId)
      .eq('proje_id', aktifProje.id)
      .order('kayit_tarihi', { ascending: false }),
    supabase
      .from('lokasyonlar')
      .select('id,tanim,parent_id,aktif')
      .eq('firma_id', firmaId)
      .eq('proje_id', aktifProje.id)
      .eq('aktif', true)
      .order('tanim'),
    supabase
      .from('users')
      .select('id,isim_soyisim')
      .eq('firma_id', firmaId)
      .eq('aktif', true)
      .order('isim_soyisim'),
  ])

  return (
    <div>
      <Topbar
        title="Gorev Kurallari"
        base="/ta"
        breadcrumbs={[{ label: 'Yonetim' }, { label: aktifProje.ad }, { label: 'Gorev Kurallari' }]}
      />
      <GorevKurallariClient
        base="/ta"
        firmaId={firmaId}
        meId={me.id}
        initialKuralar={kuralar ?? []}
        lokasyonlar={lokasyonlar ?? []}
        kullanicilar={kullanicilar ?? []}
        readonly={me.rol !== 'tenant_admin'}
        projeId={aktifProje.id}
      />
    </div>
  )
}
