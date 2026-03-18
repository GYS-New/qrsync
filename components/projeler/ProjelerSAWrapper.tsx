'use client'

import ProjelerClient from './ProjelerClient'
import { useFirma } from '@/components/layout/FirmaContext'

export default function ProjelerSAWrapper() {
  const { firmaId, loading } = useFirma()

  return (
    <div style={{ padding: 24 }}>
      {/* İçerik */}
      {loading ? (
        <div className="verde-card" style={{ padding: 20, color: '#7a907a', fontSize: 14 }}>
          Firmalar yükleniyor…
        </div>
      ) : null}
      {!firmaId ? (
        <div className="verde-card" style={{ padding: 20, color: '#7a907a', fontSize: 14 }}>
          Proje yönetimi için bir firma seçin.
        </div>
      ) : (
        <ProjelerClient firmaId={firmaId} readonly={false} isSA />
      )}
    </div>
  )
}
