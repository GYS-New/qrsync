import Topbar from '@/components/layout/Topbar'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaDashboardPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)

  return (
    <div>
      <Topbar title="Oto Yıkama" base={rolBase} breadcrumbs={[{ label: 'Oto Yıkama' }]} />
      <div style={{ padding: '24px 28px' }}>
        <div className="verde-card" style={{ padding: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a' }}>🚿 Oto Yıkama Modülü</h2>
          <p style={{ marginTop: 8, color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
            Araç parkındaki araçların yıkama operasyonlarını yönetir. Mevcut spesifik görev sistemi üzerinden
            çalışır — mobil uygulama değişmeden yıkama görevleri normal görev olarak akar.
          </p>
          <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <a href="/oto-yikama/araclar" style={{ textDecoration: 'none' }}>
              <div style={{ padding: 18, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', cursor: 'pointer' }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>🚗</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Araç Kayıtları</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>Plaka listesi, Excel sync, kullanıcı bilgileri</div>
              </div>
            </a>
            <a href="/oto-yikama/gorev-olustur" style={{ textDecoration: 'none' }}>
              <div style={{ padding: 18, border: '1px solid #1d4ed8', borderRadius: 10, background: '#eff6ff', cursor: 'pointer' }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>➕</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1d4ed8' }}>Görev Oluştur</div>
                <div style={{ fontSize: 12, color: '#1e3a8a', marginTop: 3 }}>Plaka × istasyon × tarih bazlı toplu görev oluştur</div>
              </div>
            </a>
            <a href="/oto-yikama/gunluk" style={{ textDecoration: 'none' }}>
              <div style={{ padding: 18, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', cursor: 'pointer' }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>📋</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Günlük Tablo</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>Bugün yıkanması gereken / yıkanan araçlar</div>
              </div>
            </a>
            <a href="/oto-yikama/raporlar" style={{ textDecoration: 'none' }}>
              <div style={{ padding: 18, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', cursor: 'pointer' }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>📊</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Raporlar</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>Plaka geçmişi, istasyon istatistikleri, gecikmeler</div>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
