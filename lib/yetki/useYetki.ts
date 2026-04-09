'use client'

import { useEffect, useState } from 'react'

type Yetki = {
  gorebilir: boolean
  ekleyebilir: boolean
  duzenleyebilir: boolean
  silebilir: boolean
}

const ACIK: Yetki = { gorebilir: true, ekleyebilir: true, duzenleyebilir: true, silebilir: true }
const KAPALI: Yetki = { gorebilir: false, ekleyebilir: false, duzenleyebilir: false, silebilir: false }

// Cache: tüm sayfa yetkileri tek seferde çekilir, her component aynı cache'i kullanır
let _cache: Record<string, Yetki> | null = null
let _fetching = false
let _listeners: Array<(data: Record<string, Yetki>) => void> = []

async function fetchYetkiler(): Promise<Record<string, Yetki>> {
  if (_cache) return _cache
  if (_fetching) {
    return new Promise(resolve => { _listeners.push(resolve) })
  }
  _fetching = true
  try {
    const res = await fetch('/api/auth/sayfa-yetkileri', { cache: 'no-store' })
    const json = await res.json()
    const data = json.ok ? (json.yetkileri ?? {}) : {}
    _cache = data
    _listeners.forEach(fn => fn(data))
    _listeners = []
    return data
  } catch {
    _fetching = false
    return {}
  }
}

/**
 * Hook: belirli sayfa için yetki bilgisi döner
 * SA her zaman tam yetkili (API tarafında)
 * @param sayfaKodu - kullanici_grubu_yetkileri.sayfa_kodu
 */
export function useYetki(sayfaKodu: string): Yetki {
  const [yetki, setYetki] = useState<Yetki>(ACIK) // başlangıçta açık (flash önleme)

  useEffect(() => {
    fetchYetkiler().then(data => {
      setYetki(data[sayfaKodu] ?? ACIK)
    })
  }, [sayfaKodu])

  return yetki
}
