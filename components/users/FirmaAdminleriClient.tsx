'use client'

import { useEffect, useState } from 'react'
import type { User } from '@/types'
import KullanicilarClient from './KullanicilarClient'
import { useFirma } from '@/components/layout/FirmaContext'

/**
 * SA — Firma Adminleri (tenant_admin)
 * Sadece SA görür. Proje filtresi yoktur; adminler projeye bağlı değildir.
 * Firma değişince router.refresh() → SSR yeni initialUsers getirir → useEffect([initialUsers]) sync eder.
 */
export default function FirmaAdminleriClient({
  initialFirmaId,
  initialUsers,
}: {
  initialFirmaId: string | null
  initialUsers: User[]
}) {
  const { firmaId: saFirmaId } = useFirma()
  const firmaId = saFirmaId ?? initialFirmaId

  const [users, setUsers] = useState<User[]>(initialUsers)
  useEffect(() => { setUsers(initialUsers) }, [initialUsers])

  if (!firmaId) {
    return (
      <div style={{ padding: '24px 28px' }}>
        <div className="verde-card" style={{ padding: '48px', textAlign: 'center', color: '#7a907a' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🏢</div>
          <div>Firma adminlerini görmek için üstten bir firma seçin.</div>
        </div>
      </div>
    )
  }

  return (
    <KullanicilarClient
      base="/sa"
      firmaId={firmaId}
      initialUsers={users}
      canCreate={true}
      canManage={true}
      enableBulkImport={false}
    />
  )
}
