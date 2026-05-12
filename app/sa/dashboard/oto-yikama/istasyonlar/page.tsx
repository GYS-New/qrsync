import Topbar from '@/components/layout/Topbar'
import IstasyonlarClient from '@/components/oto-yikama/IstasyonlarClient'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaIstasyonlarPage() {
  // Modül + firma kontrolü üst layout'ta yapılıyor (oto-yikama/layout.tsx)
  const firmaId = getAktifFirmaId()!

  return (
    <div>
      <Topbar
        title="Yıkama İstasyonları"
        base="/sa"
        breadcrumbs={[
          { label: 'Oto Yıkama', href: '/sa/dashboard/oto-yikama' },
          { label: 'İstasyonlar' },
        ]}
      />
      <IstasyonlarClient firmaId={firmaId} />
    </div>
  )
}
