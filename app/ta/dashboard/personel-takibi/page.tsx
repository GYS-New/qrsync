import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PersonelTakibiClient from '@/components/personel-takibi/PersonelTakibiClient'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import Topbar from '@/components/layout/Topbar'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
export const dynamic = 'force-dynamic'

export default async function TAPersonelTakibiPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')

  const firmaId    = me.firma_id!
  const aktifProje = await getAktifProje(firmaId)

  if (!aktifProje) {
    return (
      <div>
        <Topbar title="Personel Takibi" base="/ta" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Personel Takibi' }]} />
        <ProjeSecilmedi />
      </div>
    )
  }

  return <PersonelTakibiClient base="/ta" isSA={false} initialFirmaId={firmaId} />
}
