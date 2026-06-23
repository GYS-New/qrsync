import Topbar from '@/components/layout/Topbar'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'

export const dynamic = 'force-dynamic'

/**
 * Oto Yıkama → Bildirimler
 *
 * ŞİMDİLİK BOŞ. ATALIAN TA talebi: GYS bildirimleri Oto Yıkama
 * modülünde görünmesin. Oto Yıkama'ya özel bildirim akışı henüz
 * ayrıştırılmadı; ayrıştırılınca BildirimlerClient burada tekrar
 * sadece oto_yikama kategorili bildirimlerle render edilecek.
 *
 * Şu an için bildirim verisi çekilmiyor — sayfa kasıtlı olarak boş.
 */
export default async function OtoYikamaBildirimlerPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)

  return (
    <div>
      <Topbar
        title="Bildirimler"
        base={rolBase}
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Bildirimler' }]}
        hideScopeControls hideNotifBar
      />
      <div style={{ padding: '24px 28px' }}>
        <div className="verde-card" style={{ padding: '64px 24px', textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.5 }}>🔔</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
            Bildirim yok
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af' }}>
            Oto Yıkama'ya özel bildirimler henüz aktif değil.
          </div>
        </div>
      </div>
    </div>
  )
}
