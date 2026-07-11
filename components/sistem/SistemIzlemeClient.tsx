'use client'

import React, { useEffect, useState } from 'react'
import AuditLogClient from '@/components/audit-log/AuditLogClient'
import SistemAlertsClient from '@/components/sistem-alerts/SistemAlertsClient'
import SistemSaglikWidget from '@/components/sistem/SistemSaglikWidget'
import MobilHataLogClient from '@/components/mobil-hata-log/MobilHataLogClient'
import GeriBildirimClient from '@/components/geri-bildirim/GeriBildirimClient'

interface Props {
  isSA: boolean
  firmalarListesi?: { id: string; firma_adi?: string; ticari_unvan?: string }[]
  showUyarilar?: boolean // TA için false
}

type Tab = 'loglar' | 'uyarilar' | 'mobil_hata' | 'geri_bildirim'

function TabBtn({ active, onClick, color, children }: { active: boolean; onClick: () => void; color: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '10px 18px', border: 'none', cursor: 'pointer',
        fontSize: 13.5, fontWeight: 700,
        color: active ? '#0f172a' : '#64748b',
        background: 'transparent',
        borderBottom: active ? `2px solid ${color}` : '2px solid transparent',
        marginBottom: -1,
      }}>
      {children}
    </button>
  )
}

export default function SistemIzlemeClient({ isSA, firmalarListesi = [], showUyarilar = true }: Props) {
  const [tab, setTab] = useState<Tab>('loglar')
  const [gbYeni, setGbYeni] = useState(0)

  // "Geri Bildirim" rozeti — sekme açılmadan da görünsün
  useEffect(() => {
    fetch('/api/sistem-loglari/geri-bildirim?gun=1&limit=1', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => setGbYeni(j?.sayilar?.yeni ?? 0))
      .catch(() => {})
  }, [])

  return (
    <div>
      {/* Sistem sağlık özeti (sadece Loglar sekmesinde) */}
      {tab === 'loglar' && isSA && <SistemSaglikWidget />}

      {/* Sekme başlıkları */}
      <div style={{ padding: '12px 24px 0', display: 'flex', gap: 6, borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
        <TabBtn active={tab === 'loglar'} onClick={() => setTab('loglar')} color="#7c3aed">📜 Loglar</TabBtn>
        {showUyarilar && (
          <TabBtn active={tab === 'uyarilar'} onClick={() => setTab('uyarilar')} color="#dc2626">⚠️ Uyarılar</TabBtn>
        )}
        <TabBtn active={tab === 'mobil_hata'} onClick={() => setTab('mobil_hata')} color="#0284c7">📱 Mobil Hata Log</TabBtn>
        <TabBtn active={tab === 'geri_bildirim'} onClick={() => setTab('geri_bildirim')} color="#16a34a">
          💬 Geri Bildirim
          {gbYeni > 0 && (
            <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: 999, background: '#dc2626', color: '#fff', fontSize: 10.5, fontWeight: 800, verticalAlign: 'middle' }}>
              {gbYeni}
            </span>
          )}
        </TabBtn>
      </div>

      {tab === 'loglar' && <AuditLogClient isSA={isSA} firmalarListesi={firmalarListesi} />}
      {tab === 'uyarilar' && showUyarilar && <SistemAlertsClient />}
      {tab === 'mobil_hata' && <MobilHataLogClient isSA={isSA} firmalarListesi={firmalarListesi} />}
      {tab === 'geri_bildirim' && <GeriBildirimClient isSA={isSA} firmalarListesi={firmalarListesi} onYeniSayisi={setGbYeni} />}
    </div>
  )
}
