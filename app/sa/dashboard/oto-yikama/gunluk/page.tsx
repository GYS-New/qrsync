import Topbar from '@/components/layout/Topbar'
import GunlukClient from '@/components/oto-yikama/GunlukClient'

export const dynamic = 'force-dynamic'

export default function GunlukPage() {
  return (
    <div>
      <Topbar title="Günlük Tablo" base="/sa"
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/sa/dashboard/oto-yikama' }, { label: 'Günlük Tablo' }]} />
      <GunlukClient />
    </div>
  )
}
