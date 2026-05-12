import Topbar from '@/components/layout/Topbar'

export const dynamic = 'force-dynamic'

export default function RaporlarPage() {
  return (
    <div>
      <Topbar title="Raporlar" base="/sa"
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/sa/dashboard/oto-yikama' }, { label: 'Raporlar' }]} />
      <div style={{ padding: '24px 28px' }}>
        <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
          Bu sayfa sonraki etapta hazırlanacak — plaka geçmişi, istasyon istatistikleri, gecikme listesi.
        </div>
      </div>
    </div>
  )
}
