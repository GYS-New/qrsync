import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Topbar from '@/components/layout/Topbar'
import FrekansSayilariClient from '@/components/frekans/FrekansSayilariClient'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'

export default async function SAFrekansSayilariPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/login')

  const firmaId = getAktifFirmaId()
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null

  return (
    <div>
      <Topbar title="Frekans Sayıları" base="/sa"
        breadcrumbs={[
          { label: 'Yönetim' },
          { label: 'Frekansiyel Görevler' },
          { label: 'Tüm Görevler', href: '/sa/dashboard/canli-islemler/tum-gorevler' },
          { label: 'Frekans Sayıları' },
        ]} />
      <FrekansSayilariClient firmaId={firmaId} projeId={aktifProje?.id ?? null} />
    </div>
  )
}
