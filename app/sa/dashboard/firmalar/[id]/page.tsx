import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import FirmaDetayClient from '@/components/firmalar/FirmaDetayClient'

export default async function FirmaDetayPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: firma } = await supabase.from('firmalar').select('*').eq('id', params.id).single()

  return (
    <div>
      <Topbar
        title="Firma Detayı"
        base="/sa"
        breadcrumbs={[{ label: 'Firmalar', href: '/sa/dashboard/firmalar' }, { label: firma?.firma_adi || firma?.ticari_unvan || 'Detay' }]}
      />
      <div style={{ padding: '24px 28px' }}>
        {firma ? <FirmaDetayClient firma={firma as any} /> : <div className="verde-card" style={{ padding: 18 }}>Firma bulunamadı.</div>}
      </div>
    </div>
  )
}
