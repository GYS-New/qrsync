'use client'

import dynamic from 'next/dynamic'

const FirmaSwitcher = dynamic(() => import('@/components/layout/FirmaSwitcher'), { ssr: false })
const ProjeSwitcher = dynamic(() => import('@/components/projeler/ProjeSwitcher'), { ssr: false })

export default function DashboardScopeControls({ base }: { base: string }) {
  const isSA = base === '/sa'
  const isU = base === '/u'

  // U kullanıcıları proje seçemez
  if (isU) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {isSA ? (
        <div style={{ width: 260 }}>
          <FirmaSwitcher />
        </div>
      ) : null}

      {/* TA ve SA: proje seçimi */}
      <div style={{ width: 260 }}>
        <ProjeSwitcher />
      </div>
    </div>
  )
}
