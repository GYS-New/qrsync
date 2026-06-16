/**
 * Client-side Oto Yıkama lokasyon filtresi.
 *
 * GYS client component'lerinde refresh sonrası DB'den çekilen lokasyonlardan
 * Oto Yıkama olarak işaretli üst lokasyonları ve tüm alt soylarını BFS ile
 * dışlar. Modül izolasyonu için kullanılır — server tarafı zaten initialX
 * propunu filtreliyor; bu helper refresh sonrası aynı filtreyi client'ta uygular.
 *
 * Kullanım:
 *   - lokasyonlar tablosundan çekerken `oto_yikama_lokasyon` kolonunu da seç
 *   - sonuçları `filterOutOtoYikama(data)` ile filtrele
 *
 * Eğer veri dropdown/seçim için ise (örn. lokasyon_id alanı), önce gizli ID
 * set'ini hesapla, sonra başka tablolardaki referansları (gorevler.lokasyon_id
 * gibi) de filtrele.
 */

type LokasyonMinimal = {
  id: string
  parent_id?: string | null
  oto_yikama_lokasyon?: boolean | null
}

/** Lokasyon listesinden Oto Yıkama olanları + alt soylarını çıkarır. */
export function filterOutOtoYikama<T extends LokasyonMinimal>(rows: T[]): T[] {
  const gizli = getOtoYikamaIdSet(rows)
  if (gizli.size === 0) return rows
  return rows.filter(r => !gizli.has(r.id))
}

/** Verilen lokasyon listesinden Oto Yıkama olarak işaretli + alt soyları ID set'ini döner. */
export function getOtoYikamaIdSet<T extends LokasyonMinimal>(rows: T[]): Set<string> {
  const ustIds = new Set<string>(
    rows.filter(r => !r.parent_id && r.oto_yikama_lokasyon === true).map(r => r.id)
  )
  if (ustIds.size === 0) return new Set()
  const gizli = new Set<string>(ustIds)
  const queue = [...ustIds]
  while (queue.length) {
    const cur = queue.shift()!
    for (const r of rows) {
      if (r.parent_id === cur && !gizli.has(r.id)) {
        gizli.add(r.id)
        queue.push(r.id)
      }
    }
  }
  return gizli
}
