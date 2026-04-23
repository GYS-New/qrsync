'use client'

import React, { useState } from 'react'
import AuditLogClient from '@/components/audit-log/AuditLogClient'
import SistemAlertsClient from '@/components/sistem-alerts/SistemAlertsClient'
import SistemSaglikWidget from '@/components/sistem/SistemSaglikWidget'

interface Props {
  isSA: boolean
  firmalarListesi?: { id: string; firma_adi?: string; ticari_unvan?: string }[]
  showUyarilar?: boolean // TA için false
}

export default function SistemIzlemeClient({ isSA, firmalarListesi = [], showUyarilar = true }: Props) {
  const [tab, setTab] = useState<'loglar' | 'uyarilar'>('loglar')

  if (!showUyarilar) {
    // TA: sadece log gösterilir, sekme yok
    return (
      <>
        {isSA && <SistemSaglikWidget />}
        <AuditLogClient isSA={isSA} firmalarListesi={firmalarListesi} />
      </>
    )
  }

  return (
    <div>
      {/* Sistem sağlık özeti (Loglar sekmesi aktifse üstte gösterilir) */}
      {tab === 'loglar' && <SistemSaglikWidget />}

      {/* Sekme başlıkları */}
      <div style={{ padding: '12px 24px 0', display: 'flex', gap: 6, borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
        <button
          onClick={() => setTab('loglar')}
          style={{
            padding: '10px 18px', border: 'none', cursor: 'pointer',
            fontSize: 13.5, fontWeight: 700,
            color: tab === 'loglar' ? '#0f172a' : '#64748b',
            background: 'transparent',
            borderBottom: tab === 'loglar' ? '2px solid #7c3aed' : '2px solid transparent',
            marginBottom: -1,
          }}>
          📜 Loglar
        </button>
        <button
          onClick={() => setTab('uyarilar')}
          style={{
            padding: '10px 18px', border: 'none', cursor: 'pointer',
            fontSize: 13.5, fontWeight: 700,
            color: tab === 'uyarilar' ? '#0f172a' : '#64748b',
            background: 'transparent',
            borderBottom: tab === 'uyarilar' ? '2px solid #dc2626' : '2px solid transparent',
            marginBottom: -1,
          }}>
          ⚠️ Uyarılar
        </button>
      </div>

      {tab === 'loglar' && <AuditLogClient isSA={isSA} firmalarListesi={firmalarListesi} />}
      {tab === 'uyarilar' && <SistemAlertsClient />}
    </div>
  )
}
