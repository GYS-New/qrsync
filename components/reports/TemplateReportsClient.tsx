'use client'

import Topbar from '@/components/layout/Topbar'
import { Sparkles } from 'lucide-react'

interface Props {
  base: string
  isSA: boolean
  tenantFirmaId?: string | null
  projeId?: string | null
}

export default function TemplateReportsClient({ base }: Props) {
  return (
    <div>
      <Topbar
        title="Rapor Özelleştir"
        base={base}
        breadcrumbs={[
          { label: 'Yönetim' },
          { label: 'Rapor Merkezi', href: `${base}/dashboard/raporlar` },
          { label: 'Rapor Özelleştir' },
        ]}
      />
      <div style={{ padding: '48px 28px', textAlign: 'center', color: '#7a907a', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <Sparkles size={32} style={{ opacity: 0.3 }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: '#4a6a4a' }}>Rapor Özelleştir</div>
        <div style={{ fontSize: 13.5, maxWidth: 360, lineHeight: 1.6 }}>
          Bu bölüm yakında özelleştirilecek. Frekansiyel ve Spesifik Görev raporlarına Rapor Merkezi'nden ulaşabilirsiniz.
        </div>
      </div>
    </div>
  )
}
