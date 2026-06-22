'use client'

import { useEffect, useState } from 'react'
import type { User } from '@/types'
import KullanicilarClient from './KullanicilarClient'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'

/**
 * SA — Firma Kullanıcıları (tenant_user)
 * Sadece SA görür. Firma + proje filtresi uygulanır.
 * Firma/proje değişince router.refresh()/reload → SSR yeni initialUsers getirir → sync.
 */
export default function FirmaKullanicilariClient({
  initialFirmaId,
  initialUsers,
}: {
  initialFirmaId: string | null
  initialUsers: User[]
}) {
  const { firmaId: saFirmaId } = useFirma()
  const { aktifProje } = useProje()

  const firmaId = saFirmaId ?? initialFirmaId
  const projeId = aktifProje?.id ?? null

  const [users, setUsers] = useState<User[]>(initialUsers)
  const [ustLokasyonlar, setUstLokasyonlar] = useState<{ id: string; tanim: string; oto_yikama_lokasyon?: boolean }[]>([])
  const [altLokasyonlar, setAltLokasyonlar] = useState<{ id: string; tanim: string; parent_id: string }[]>([])
  useEffect(() => { setUsers(initialUsers) }, [initialUsers])

  // Üst + alt lokasyonları çek — Kullanıcı atama UI'ı olduğu için Oto Yıkama dahil
  // edilir (includeOtoYikama=1). SA/TA buradan kullanıcıya "ARAÇ YIKAMA" üst
  // lokasyonu + varsayılan istasyon (alt lokasyon) atar.
  useEffect(() => {
    if (!firmaId) return
    const q = new URLSearchParams({ firmaId, includeOtoYikama: '1' })
    if (projeId) q.set('projeId', projeId)
    fetch(`/api/lokasyonlar-list?${q}`)
      .then(r => r.json())
      .then(j => {
        const loks = Array.isArray(j) ? j : (j.lokasyonlar ?? j.data ?? [])
        setUstLokasyonlar(loks.filter((l: any) => !l.parent_id))
        setAltLokasyonlar(
          loks
            .filter((l: any) => !!l.parent_id)
            .map((l: any) => ({ id: l.id, tanim: l.tanim, parent_id: l.parent_id }))
        )
      })
      .catch(() => {})
  }, [firmaId, projeId])

  if (!firmaId) {
    return (
      <div style={{ padding: '24px 28px' }}>
        <div className="verde-card" style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>👥</div>
          <div>Firma kullanıcılarını görmek için üstten bir firma seçin.</div>
        </div>
      </div>
    )
  }

  return (
    <KullanicilarClient
      base="/sa"
      firmaId={firmaId}
      projeId={projeId}
      initialUsers={users}
      canCreate={true}
      canManage={true}
      enableBulkImport={true}
      ustLokasyonlar={ustLokasyonlar}
      altLokasyonlar={altLokasyonlar}
    />
  )
}
