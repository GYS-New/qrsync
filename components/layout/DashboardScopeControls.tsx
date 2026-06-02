'use client'

import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'

const FirmaSwitcher = dynamic(() => import('@/components/layout/FirmaSwitcher'), { ssr: false })
const ProjeSwitcher = dynamic(() => import('@/components/projeler/ProjeSwitcher'), { ssr: false })
const UstLokasyonSwitcher = dynamic(() => import('@/components/lokasyon/UstLokasyonSwitcher'), { ssr: false })

export default function DashboardScopeControls({ base }: { base: string }) {
  const pathname = usePathname() ?? ''
  const isSA = base === '/sa'
  const isTA = base === '/ta'
  const isU = base === '/u'

  // U kullanıcıları proje/lokasyon seçemez (kendi yetkilerine zorlanır)
  if (isU) return null

  // Üst lokasyon switcher sadece dashboard + canli-islemler sayfalarında.
  // Diğer sayfalarda (raporlar, görevler, sistem ayarları vb.) kendi içlerinde
  // üst lokasyon filtresi var; iki ayrı seçici kafa karışıklığı yaratıyor.
  const ustLokSwitcherGoster =
    (isSA || isTA) && (
      pathname === `${base}/dashboard` ||
      pathname === `${base}/dashboard/canli-islemler`
    )

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

      {/* Üst lokasyon scope — sadece dashboard + canli-islemler */}
      {ustLokSwitcherGoster && (
        <div style={{ width: 240 }}>
          <UstLokasyonSwitcher />
        </div>
      )}
    </div>
  )
}
