'use client'

import { useState } from 'react'
import GorevOlusturClient from '@/components/oto-yikama/GorevOlusturClient'
import ExcelImportClient from '@/components/oto-yikama/ExcelImportClient'
import { Wrench, FileUp } from 'lucide-react'

type Tab = 'manuel' | 'excel'

export default function GorevOlusturPageClient({ firmaId }: { firmaId: string }) {
  const [tab, setTab] = useState<Tab>('manuel')
  return (
    <div>
      <div style={{ padding: '12px 24px 0', display: 'flex', gap: 6, borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
        <TabBtn active={tab === 'manuel'} onClick={() => setTab('manuel')} color="#1d4ed8">
          <Wrench size={14} style={{ marginRight: 6 }} /> Manuel Görev Oluştur
        </TabBtn>
        <TabBtn active={tab === 'excel'} onClick={() => setTab('excel')} color="#16a34a">
          <FileUp size={14} style={{ marginRight: 6 }} /> Excel ile İçe Aktar
        </TabBtn>
      </div>
      {tab === 'manuel' && <GorevOlusturClient firmaId={firmaId} />}
      {tab === 'excel' && <ExcelImportClient />}
    </div>
  )
}

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
        display: 'inline-flex', alignItems: 'center',
      }}>
      {children}
    </button>
  )
}
