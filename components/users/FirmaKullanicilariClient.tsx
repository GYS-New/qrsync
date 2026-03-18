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
  useEffect(() => { setUsers(initialUsers) }, [initialUsers])

  if (!firmaId) {
    return (
      <div style={{ padding: '24px 28px' }}>
        <div className="verde-card" style={{ padding: '48px', textAlign: 'center', color: '#7a907a' }}>
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
    />
  )
}
