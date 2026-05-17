import Topbar from '@/components/layout/Topbar'
import RaporlarClient from '@/components/oto-yikama/RaporlarClient'

export const dynamic = 'force-dynamic'

export default function RaporlarPage() {
  return (
    <div>
      <Topbar title="Raporlar" base="/sa"
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/sa/dashboard/oto-yikama' }, { label: 'Raporlar' }]} />
      <RaporlarClient />
    </div>
  )
}
