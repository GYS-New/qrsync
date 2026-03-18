import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import GorevlerUserClient from '@/components/gorev/GorevlerUserClient'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function UGorevlerPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase
    .from('users')
    .select('id,firma_id,proje_id')
    .eq('id', authUser.id)
    .single()
  if (!me) redirect('/login')

  const firmaId = me.firma_id
  const projeId = me.proje_id  // U sadece kendi projesini görür
  const meId = me.id

  // Proje filtresi: U sadece kendi projesine ait görevleri görür
  let q = supabase
    .from('gorevler')
    .select('*,lokasyonlar(id,tanim,parent_id),atanan:users!atanan_kullanici_id(isim_soyisim)')
    .eq('firma_id', firmaId)
    .order('olusturma_tarihi', { ascending: false })
    .limit(500)

  if (projeId) q = (q as any).eq('proje_id', projeId)

  const { data: gorevler } = await q

  return (
    <div>
      <Topbar title="Görevler" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Görevler' }]} />
      <GorevlerUserClient meId={meId} firmaId={firmaId} initialGorevler={(gorevler as any) ?? []} />
    </div>
  )
}
