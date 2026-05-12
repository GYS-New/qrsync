import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import { redirect } from 'next/navigation'
import AraclarClient from '@/components/oto-yikama/AraclarClient'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaAraclarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('rol').eq('id', authUser.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) redirect('/sa/dashboard')

  const firmaId = getAktifFirmaId()
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null
  const projeId = aktifProje?.id ?? null

  return (
    <div>
      <Topbar title="Araç Kayıtları" base="/sa"
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/sa/dashboard/oto-yikama' }, { label: 'Araç Kayıtları' }]} />
      {!firmaId ? (
        <div style={{ padding: '24px 28px' }}>
          <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Araç kayıtları için üstten bir firma seçin.
          </div>
        </div>
      ) : (
        <AraclarClient firmaId={firmaId} projeId={projeId} />
      )}
    </div>
  )
}
