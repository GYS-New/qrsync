import { createClient, createAdminClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import ArsivClient from '@/components/arsiv/ArsivClient'
import { redirect } from 'next/navigation'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'

export default async function SAArsivPage() {
  const supabase = createClient()
  const admin = createAdminClient()

  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('*').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/login')

  const firmaId = getAktifFirmaId()
  const cookieProje = await getAktifProje(firmaId)
  const projeId = cookieProje?.id ?? null

  // Initial arsiv boş — client tarafında hızlı yükleniyor (FK join timeout önlemi)
  const arsiv: any[] = []

  return (
    <div>
      <Topbar
        title="Arşiv"
        base="/sa"
        breadcrumbs={[
          { label: 'Yönetim' },
          { label: 'Frekansiyel Görevler' },
          { label: 'Arşiv' },
        ]}
      />
      <ArsivClient base="/sa" initialArsiv={(arsiv as any) ?? []} />
    </div>
  )
}
