import Topbar from '@/components/layout/Topbar'
import GorevOlusturPageClient from '@/components/oto-yikama/GorevOlusturPageClient'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaGorevOlusturPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'

  const firmaId = isSA ? getAktifFirmaId() : me.firma_id
  if (!firmaId) redirect('/oto-yikama/dashboard')

  return (
    <div>
      <Topbar
        title="Görev Oluştur"
        base={rolBase}
        breadcrumbs={[
          { label: 'Oto Yıkama', href: '/oto-yikama/dashboard' },
          { label: 'Görev Oluştur' },
        ]}
        hideScopeControls
      />
      <GorevOlusturPageClient firmaId={firmaId} />
    </div>
  )
}
