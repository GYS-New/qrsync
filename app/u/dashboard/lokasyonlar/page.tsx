import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import LokasyonlarClient from '@/components/lokasyon/LokasyonlarClient'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ULokasyonlarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('rol,firma_id,proje_id').eq('id', authUser.id).single()
  const firmaId = me?.firma_id
  const projeId = me?.proje_id  // U/Musteri sadece kendi projesini görür

  let q = supabase
    .from('lokasyonlar')
    .select('*')
    .eq('firma_id', firmaId)
    .eq('aktif', true)
    .order('kayit_tarihi', { ascending: true })

  if (projeId) q = (q as any).eq('proje_id', projeId)

  const { data: lokasyonlar } = await q

  return (
    <div>
      <Topbar title="Lokasyonlar" base="/u" breadcrumbs={[{ label:'Yönetim' }, { label:'Lokasyonlar' }]} />
      <LokasyonlarClient
        base="/u"
        initialFirmaId={firmaId}
        initialLokasyonlar={(lokasyonlar as any) ?? []}
        readonly={true}
        projeId={projeId ?? undefined}
      />
    </div>
  )
}
