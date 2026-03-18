import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import RaporSablonlariClient from '@/components/rapor-sablonlari/RaporSablonlariClient'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function SASablonYonetimiPage({
}: {
}) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/sa/dashboard')

  const firmaId = getAktifFirmaId()

  return (
    <div>
      <Topbar
        title="Şablon Yönetimi"
        base="/sa"
        breadcrumbs={[
          { label: 'Yönetim' }, 
          { label: 'Rapor Merkezi', href: '/sa/dashboard/raporlar' }, 
          { label: 'Rapor Özelleştir', href: '/sa/dashboard/raporlar/ozellestir' },
          { label: 'Şablon Yönetimi' }
        ]}
      />
      
      <RaporSablonlariClient base="/sa" />
    </div>
  )
}
