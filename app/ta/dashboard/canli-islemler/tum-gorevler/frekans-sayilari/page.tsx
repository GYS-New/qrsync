import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Topbar from '@/components/layout/Topbar'
import FrekansSayilariClient from '@/components/frekans/FrekansSayilariClient'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'

export default async function TAFrekansSayilariPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: me } = await supabase.from('users').select('rol, firma_id').eq('id', user.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/login')

  const firmaId = me.firma_id ?? null
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null

  return (
    <div>
      <Topbar title="Frekans Sayıları" base="/ta"
        breadcrumbs={[
          { label: 'Yönetim' },
          { label: 'Frekansiyel Görevler' },
          { label: 'Tüm Görevler', href: '/ta/dashboard/canli-islemler/tum-gorevler' },
          { label: 'Frekans Sayıları' },
        ]} />
      <FrekansSayilariClient firmaId={firmaId} projeId={aktifProje?.id ?? null} />
    </div>
  )
}
