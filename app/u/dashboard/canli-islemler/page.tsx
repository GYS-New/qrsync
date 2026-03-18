import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import CanliIslemlerClient from '@/components/canli/CanliIslemlerClient'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function UserCanliIslemler() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase
    .from('users')
    .select('id,firma_id,proje_id,rol')
    .eq('id', authUser.id)
    .single()
  if (!me) redirect('/login')

  const firmaId = me.firma_id
  const projeId = me.proje_id  // U sadece kendi projesini görür

  // Lokasyonlar: sadece U'nun projesine ait
  let lokQ = supabase
    .from('lokasyonlar')
    .select('id,tanim,aktif,parent_id')
    .eq('firma_id', firmaId)
    .eq('aktif', true)
    .order('tanim')
  if (projeId) lokQ = (lokQ as any).eq('proje_id', projeId)

  const { data: kullanicilar } = await supabase
    .from('users')
    .select('id,isim_soyisim,profil_foto')
    .eq('firma_id', firmaId)
    .eq('aktif', true)

  // Canlı görevler: sadece U'nun projesine ait
  let gorevQ = supabase
    .from('canli_gorevler')
    .select('*,lokasyonlar(tanim),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim),olusturan:users!olusturan_id(isim_soyisim),tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim),iptalEden:users!iptal_eden_id(isim_soyisim)')
    .eq('firma_id', firmaId)
    .order('olusturma_tarihi', { ascending: false })
    .limit(50)
  if (projeId) gorevQ = (gorevQ as any).eq('proje_id', projeId)

  const [{ data: lokasyonlar }, { data: canliGorevler }] = await Promise.all([lokQ, gorevQ])

  return (
    <div>
      <Topbar title="Frekansiyel Görevler" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Frekansiyel Görevler' }]} />
      <CanliIslemlerClient
        firmaId={firmaId}
        lokasyonlar={lokasyonlar ?? []}
        kullanicilar={kullanicilar ?? []}
        initialGorevler={canliGorevler ?? []}
        meId={me.id}
        projeId={projeId ?? null}
        readonly={true}
      />
    </div>
  )
}
