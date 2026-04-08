'use client'

import { useMemo } from 'react'
import Topbar from '@/components/layout/Topbar'
import QuickReportsClient from '@/components/reports/QuickReportsClient'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'

export default function QuickReportsPageClient({
  base,
  title,
  isSA,
  projeId: propProjeId,
  initialFirmaId,
}: {
  base: '/sa' | '/ta' | '/u'
  title: string
  isSA: boolean
  projeId?: string | null
  initialFirmaId?: string | null
}) {
  const { firmaId: saFirmaId } = useFirma()
  const { aktifProje } = useProje()
  const firmaId = useMemo(() => (isSA ? saFirmaId : (initialFirmaId ?? null)), [isSA, saFirmaId, initialFirmaId])
  const projeId = propProjeId ?? aktifProje?.id ?? null

  return (
    <div>
      <Topbar
        title={title}
        base={base}
        breadcrumbs={[{ label: 'Yonetim' }, { label: 'Rapor Merkezi', href: `${base}/dashboard/raporlar` }, { label: 'Grafiksel Raporlar' }]}
      />

      <div style={{ padding: 24 }}>
        <QuickReportsClient open firmaId={firmaId} base={base} projeId={projeId} />
      </div>
    </div>
  )
}
