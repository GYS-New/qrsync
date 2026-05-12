/**
 * Oto Yıkama bölüm layout'u — modül flag'i kapalı veya firma seçilmemişse
 * alt sayfaları render etmek yerine bilgilendirici kart gösterir.
 *
 * Bu layout SA bölümünün tamamını koruyan SALayout'un içindedir; rol
 * kontrolü zaten orada yapılır. Burada sadece firma + modül flag kontrolü var.
 */
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import Topbar from '@/components/layout/Topbar'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function OtoYikamaLayout({ children }: { children: React.ReactNode }) {
  const firmaId = getAktifFirmaId()

  if (!firmaId) {
    return (
      <div>
        <Topbar title="Oto Yıkama" base="/sa" breadcrumbs={[{ label: 'Oto Yıkama' }]} />
        <div style={{ padding: '24px 28px' }}>
          <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Devam etmek için üstten bir firma seçin.
          </div>
        </div>
      </div>
    )
  }

  const admin = createAdminClient()
  const { data: firma } = await admin
    .from('firmalar')
    .select('id, firma_adi, ticari_unvan, oto_yikama_aktif')
    .eq('id', firmaId)
    .single()

  if (!firma?.oto_yikama_aktif) {
    const ad = firma?.firma_adi || firma?.ticari_unvan || 'Bu firma'
    return (
      <div>
        <Topbar title="Oto Yıkama" base="/sa" breadcrumbs={[{ label: 'Oto Yıkama' }]} />
        <div style={{ padding: '24px 28px' }}>
          <div className="verde-card" style={{ padding: 32, maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🚿</div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Oto Yıkama Modülü Kapalı</h2>
            <p style={{ marginTop: 10, color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
              <strong>{ad}</strong> firması için Oto Yıkama modülü aktif değil. Modülü açmak için firma detay sayfasından
              "Oto Yıkama Modülü" seçeneğini Aktif konuma alın.
            </p>
            <div style={{ marginTop: 20 }}>
              <Link
                href={`/sa/dashboard/firmalar/${firmaId}`}
                style={{
                  display: 'inline-block', padding: '8px 18px', borderRadius: 8,
                  background: '#0f172a', color: '#fff', textDecoration: 'none',
                  fontSize: 13, fontWeight: 700,
                }}
              >
                Firma Detayına Git
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
