import Topbar from '@/components/layout/Topbar'
import AraclarClient from '@/components/oto-yikama/AraclarClient'
import { createAdminClient } from '@/lib/supabase/server'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import { getOtoYikamaFirmaId } from '@/lib/oto-yikama/getOtoYikamaFirmaId'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaAraclarPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const firmaId = await getOtoYikamaFirmaId(createAdminClient() as any, me)
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null
  const projeId = aktifProje?.id ?? null

  return (
    <div>
      <Topbar title="Araç Kayıtları" base={rolBase} hideScopeControls hideNotifBar hideNotifBell
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Araç Kayıtları' }]} />
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
