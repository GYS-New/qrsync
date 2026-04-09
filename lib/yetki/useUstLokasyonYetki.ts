'use client'

import { useEffect, useState } from 'react'

type UstLokYetki = {
  /** Yetkili üst lokasyon ID listesi. null = henüz yüklenmedi, [] = tüm erişim */
  yetkiliIds: string[] | null
  /** Yükleniyor mu */
  loading: boolean
  /** Belirli bir üst lokasyona erişim var mı? (null iken true döner — güvenli taraf) */
  erisebilir: (ustLokId: string) => boolean
  /** Lokasyon listesini filtrele (üst lokasyonları yetkiye göre kırp) */
  filtrele: <T extends { id: string; parent_id?: string | null }>(lokasyonlar: T[]) => T[]
}

/**
 * Hook: mevcut kullanıcının yetkili üst lokasyon listesini çeker.
 *
 * Kurallar:
 * - SA/TA: her zaman tüm erişim (hook çağrılmaz, null döner)
 * - U/M: API'den kullanici_lokasyon_yetkileri çekilir
 * - Kayıt yoksa = tüm erişim (geriye dönük uyumluluk)
 * - Kayıt varsa = sadece listedekiler
 */
export function useUstLokasyonYetki(): UstLokYetki {
  const [yetkiliIds, setYetkiliIds] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function yukle() {
      try {
        const res = await fetch('/api/auth/lokasyon-yetkileri-me', { cache: 'no-store' })
        const json = await res.json()
        if (json.ok) {
          // Boş dizi = tüm erişim
          setYetkiliIds(json.yetkili_lokasyonlar ?? [])
        }
      } catch {}
      setLoading(false)
    }
    yukle()
  }, [])

  function erisebilir(ustLokId: string): boolean {
    // Henüz yüklenmedi veya kayıt yok = erişim var
    if (yetkiliIds === null || yetkiliIds.length === 0) return true
    return yetkiliIds.includes(ustLokId)
  }

  function filtrele<T extends { id: string; parent_id?: string | null }>(lokasyonlar: T[]): T[] {
    // Kayıt yoksa tüm lokasyonları döndür
    if (yetkiliIds === null || yetkiliIds.length === 0) return lokasyonlar

    // Yetkili üst lokasyon ve tüm alt lokasyonlarını bul
    const yetkiliSet = new Set<string>()

    // Üst lokasyonları ekle
    for (const id of yetkiliIds) yetkiliSet.add(id)

    // Alt lokasyonları ekle (BFS)
    const queue = [...yetkiliIds]
    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const lok of lokasyonlar) {
        if (lok.parent_id === cur && !yetkiliSet.has(lok.id)) {
          yetkiliSet.add(lok.id)
          queue.push(lok.id)
        }
      }
    }

    return lokasyonlar.filter(l => yetkiliSet.has(l.id))
  }

  return { yetkiliIds, loading, erisebilir, filtrele }
}
