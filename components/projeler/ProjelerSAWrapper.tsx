'use client'

import ProjelerClient from './ProjelerClient'
import { useFirma } from '@/components/layout/FirmaContext'

export default function ProjelerSAWrapper() {
  const { firmaId, firmalar, loading } = useFirma()

  const aktifFirma = firmalar.find(f => f.id === firmaId)
  const firmaBirimFiyatAktif = aktifFirma?.birim_fiyat_aktif !== false

  return (
    <div style={{ padding: 24 }}>
      {/* İçerik */}
      {loading ? (
        <div className="verde-card" style={{ padding: 20, color: '#9a7b6a', fontSize: 14 }}>
          Firmalar yükleniyor…
        </div>
      ) : null}
      {!firmaId ? (
        <div className="verde-card" style={{ padding: 20, color: '#9a7b6a', fontSize: 14 }}>
          Proje yönetimi için bir firma seçin.
        </div>
      ) : (
        <ProjelerClient firmaId={firmaId} readonly={false} isSA firmaBirimFiyatAktif={firmaBirimFiyatAktif} />
      )}
    </div>
  )
}
