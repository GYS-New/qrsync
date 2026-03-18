'use client'

import { useEffect } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'

export default function LicenseExpiredPopup({ expired }: { expired: boolean }) {
  const { confirm } = useConfirm()

  useEffect(() => {
    if (!expired) return
    // Show on each login. We treat "login" as first load in a browser session.
    const key = 'qrsync_license_expired_shown'
    if (typeof window !== 'undefined') {
      const already = sessionStorage.getItem(key)
      if (already === '1') return
      sessionStorage.setItem(key, '1')
    }
    confirm({
      title: 'Lisans Süresi Doldu',
      message:
        'Lisans süreniz dolduğundan tüm aktiviteler kısıtlandı!\nLütfen Yöneticinize Başvurunuz !',
      confirmText: 'Tamam',
      cancelText: 'Kapat',
      variant: 'danger',
    }).catch(() => {})
  }, [expired, confirm])

  return null
}
