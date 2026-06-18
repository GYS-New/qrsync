import Topbar from '@/components/layout/Topbar'
import GorevOlusturPageClient from '@/components/oto-yikama/GorevOlusturPageClient'
import { createAdminClient } from '@/lib/supabase/server'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import { getOtoYikamaFirmaId } from '@/lib/oto-yikama/getOtoYikamaFirmaId'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaGorevOlusturPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const firmaId = await getOtoYikamaFirmaId(createAdminClient() as any, me)
  if (!firmaId) redirect('/oto-yikama/dashboard')

  return (
    <div>
      <Topbar
        title="Ekstra Görev Oluştur"
        base={rolBase}
        breadcrumbs={[
          { label: 'Oto Yıkama', href: '/oto-yikama/dashboard' },
          { label: 'Ekstra Görev' },
        ]}
        hideScopeControls hideNotifBar
      />
      <GorevOlusturPageClient firmaId={firmaId} />
    </div>
  )
}
