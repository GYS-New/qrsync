import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import LokasyonlarClient from '@/components/lokasyon/LokasyonlarClient'
import { redirect } from 'next/navigation'

export default async function ULokasyonlarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')
const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', authUser.id).single()
  const firmaId = me?.firma_id
  const { data: lokasyonlar } = await supabase
    .from('lokasyonlar')
    .select('*')
    .eq('firma_id', firmaId)
    .eq('aktif', true)
    .order('kayit_tarihi', { ascending: true })

  return (
    <div>
      <Topbar title="Lokasyonlar" base="/u" breadcrumbs={[{ label:'Yönetim' }, { label:'Lokasyonlar' }]} />
      <LokasyonlarClient
        base="/u"
        initialFirmaId={firmaId}
        initialLokasyonlar={(lokasyonlar as any) ?? []}
        readonly={true}
      />
    </div>
  )
}
