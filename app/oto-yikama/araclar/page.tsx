import Topbar from '@/components/layout/Topbar'
import AraclarClient from '@/components/oto-yikama/AraclarClient'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaAraclarPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'

  const firmaId = isSA ? getAktifFirmaId() : me.firma_id
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null
  const projeId = aktifProje?.id ?? null

  return (
    <div>
      <Topbar title="Araç Kayıtları" base={rolBase} hideScopeControls hideNotifBar
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
