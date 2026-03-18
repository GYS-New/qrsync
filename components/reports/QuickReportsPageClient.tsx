'use client'

import { useMemo } from 'react'
import Topbar from '@/components/layout/Topbar'
import QuickReportsClient from '@/components/reports/QuickReportsClient'
import { useFirma } from '@/components/layout/FirmaContext'

export default function QuickReportsPageClient({
  base,
  title,
  isSA,
  projeId,
  initialFirmaId,
}: {
  base: '/sa' | '/ta'
  title: string
  isSA: boolean
  projeId?: string | null
  initialFirmaId?: string | null
}) {
  const { firmaId: saFirmaId } = useFirma()
  const firmaId = useMemo(() => (isSA ? saFirmaId : (initialFirmaId ?? null)), [isSA, saFirmaId, initialFirmaId])

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
