'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const DashboardSettingsClient = dynamic(() => import('@/components/dashboard/DashboardSettingsClient'), { ssr: false })
const GorevSureleriClient = dynamic(() => import('./GorevSureleriClient'), { ssr: false })

type Tab = 'genel' | 'frekans' | 'gorev-kurallari' | 'gorev-sureleri' | 'dashboard'

const TABS: { key: Tab; label: string }[] = [
  { key: 'genel',          label: 'Genel Ayarlar'   },
  { key: 'frekans',        label: 'Frekans Sayıları' },
  { key: 'gorev-kurallari',label: 'Görev Kuralları'  },
  { key: 'gorev-sureleri', label: 'Görev Süreleri'   },
  { key: 'dashboard',      label: 'Dashboard'        },
]

interface LokasyonRow {
  id: string
  tanim: string
  parent_id?: string | null
  min_sure_dakika?: number | null
  max_sure_dakika?: number | null
  aktif: boolean
}

interface Props {
  meId: string
  initialBloklar: any[]
  lokasyonlar: LokasyonRow[]
}

export default function SistemAyarlariClient({ meId, initialBloklar, lokasyonlar }: Props) {
  const [aktifTab, setAktifTab] = useState<Tab>('genel')

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          borderBottom: '2px solid #e5e7eb',
          marginBottom: 28,
          overflowX: 'auto',
        }}
      >
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setAktifTab(tab.key)}
            style={{
              padding: '9px 18px',
              fontSize: 14,
              fontWeight: aktifTab === tab.key ? 700 : 500,
              color: aktifTab === tab.key ? '#1a5c2a' : '#6b7280',
              background: 'none',
              border: 'none',
              borderBottom: aktifTab === tab.key ? '2px solid #1a5c2a' : '2px solid transparent',
              marginBottom: -2,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab içerikleri */}
      {aktifTab === 'genel' && <EmptyTab label="Genel Ayarlar" />}
      {aktifTab === 'frekans' && <EmptyTab label="Frekans Sayıları" />}
      {aktifTab === 'gorev-kurallari' && <EmptyTab label="Görev Kuralları" />}
      {aktifTab === 'gorev-sureleri' && <GorevSureleriClient lokasyonlar={lokasyonlar} />}
      {aktifTab === 'dashboard' && (
        <DashboardSettingsClient meId={meId} initialBloklar={initialBloklar} />
      )}
    </div>
  )
}

function EmptyTab({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 24px',
        color: '#9ca3af',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.4 }}>⚙</div>
      <div style={{ fontSize: 17, fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 14 }}>Bu sekme yakında yapılandırılacak.</div>
    </div>
  )
}
