'use client'

import dynamic from 'next/dynamic'

const FirmaSwitcher = dynamic(() => import('@/components/layout/FirmaSwitcher'), { ssr: false })
const ProjeSwitcher = dynamic(() => import('@/components/projeler/ProjeSwitcher'), { ssr: false })
const UstLokasyonSwitcher = dynamic(() => import('@/components/lokasyon/UstLokasyonSwitcher'), { ssr: false })

export default function DashboardScopeControls({ base }: { base: string }) {
  const isSA = base === '/sa'
  const isTA = base === '/ta'
  const isU = base === '/u'

  // U kullanıcıları proje/lokasyon seçemez (kendi yetkilerine zorlanır)
  if (isU) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {isSA ? (
        <div style={{ width: 260 }}>
          <FirmaSwitcher />
        </div>
      ) : null}

      {/* TA ve SA: proje seçimi */}
      <div style={{ width: 240 }}>
        <ProjeSwitcher />
      </div>

      {/* TA: dashboard üst lokasyon scope filtresi */}
      {isTA && (
        <div style={{ width: 240 }}>
          <UstLokasyonSwitcher />
        </div>
      )}
    </div>
  )
}
