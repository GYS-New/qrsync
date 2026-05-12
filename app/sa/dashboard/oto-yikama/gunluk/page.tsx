import Topbar from '@/components/layout/Topbar'

export const dynamic = 'force-dynamic'

export default function GunlukPage() {
  return (
    <div>
      <Topbar title="Günlük Tablo" base="/sa"
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/sa/dashboard/oto-yikama' }, { label: 'Günlük Tablo' }]} />
      <div style={{ padding: '24px 28px' }}>
        <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
          Bu sayfa sonraki etapta hazırlanacak — bugün yıkanması gereken / yıkanan araçlar listesi + QR akışı.
        </div>
      </div>
    </div>
  )
}
