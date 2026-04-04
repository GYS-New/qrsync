import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import CanliIslemlerClient from '@/components/canli/CanliIslemlerClient'
import { redirect } from 'next/navigation'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'

export default async function CanliIslemlerPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('*').eq('id', authUser.id).single()
  const firmaId = me?.firma_id

  const aktifProje = await getAktifProje(firmaId ?? null)
  if (!aktifProje) return (
    <div>
      <Topbar title="Frekansiyel Gorevler" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: 'Frekansiyel Gorevler' }]} />
      <ProjeSecilmedi />
    </div>
  )

  const [{ data: lokasyonlar }, { data: kullanicilar }, { data: canliGorevler }] = await Promise.all([
    supabase.from('lokasyonlar').select('id,tanim,aktif,parent_id,checklist_sablon_id').eq('firma_id', firmaId).eq('proje_id', aktifProje.id).eq('aktif', true).order('tanim'),
    supabase.from('users').select('id,isim_soyisim,profil_foto').eq('firma_id', firmaId).eq('aktif', true).eq('proje_id', aktifProje.id),
    supabase.from('canli_gorevler').select('*,lokasyonlar(tanim),users!atanan_kullanici_id(isim_soyisim)').eq('firma_id', firmaId).or(`proje_id.eq.${aktifProje.id},proje_id.is.null`).order('olusturma_tarihi', { ascending: false }).limit(50),
  ])

  return (
    <div>
      <Topbar
        title="Frekansiyel Gorevler"
        base="/ta"
        breadcrumbs={[{ label: 'Yonetim' }, { label: aktifProje.ad }, { label: 'Frekansiyel Gorevler' }]}
      />
      <CanliIslemlerClient
        firmaId={firmaId}
        lokasyonlar={lokasyonlar ?? []}
        kullanicilar={kullanicilar ?? []}
        initialGorevler={canliGorevler ?? []}
        meId={me.id}
        projeId={aktifProje.id}
        readonly={me.rol === 'tenant_user'}
      />
    </div>
  )
}
