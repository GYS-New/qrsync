import Topbar from '@/components/layout/Topbar'
import GorevOlusturClient from '@/components/oto-yikama/GorevOlusturClient'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaGorevOlusturPage() {
  // Modül + firma kontrolü üst layout'ta
  const firmaId = getAktifFirmaId()!

  return (
    <div>
      <Topbar
        title="Görev Oluştur"
        base="/sa"
        breadcrumbs={[
          { label: 'Oto Yıkama', href: '/sa/dashboard/oto-yikama' },
          { label: 'Görev Oluştur' },
        ]}
      />
      <GorevOlusturClient firmaId={firmaId} />
    </div>
  )
}
