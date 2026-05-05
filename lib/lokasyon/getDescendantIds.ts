import { createAdminClient } from '@/lib/supabase/server'

/**
 * Bir üst lokasyonun (root) tüm alt-altı (BFS recursive descendant'ları)
 * dahil ID listesini döndürür. Köke kendisi de listeye eklenir.
 *
 * Dashboard yetkiliLokIds filtresi için kullanılır — TA bir üst lokasyon
 * seçtiğinde altındaki tüm alt lokasyonları kapsayan ID setini elde eder.
 *
 * Null/boş → null döner (tüm scope = filtreyok).
 */
export async function getDescendantIds(
  rootUstLokasyonId: string | null | undefined,
  firmaId: string | null,
): Promise<string[] | null> {
  if (!rootUstLokasyonId || !firmaId) return null
  const admin = createAdminClient()
  const { data: tumLoklar } = await admin
    .from('lokasyonlar')
    .select('id, parent_id')
    .eq('firma_id', firmaId)
  if (!tumLoklar?.length) return [rootUstLokasyonId]

  const childrenMap = new Map<string, string[]>()
  for (const l of tumLoklar) {
    if (!l.parent_id) continue
    const arr = childrenMap.get(l.parent_id) ?? []
    arr.push(l.id)
    childrenMap.set(l.parent_id, arr)
  }

  const result = new Set<string>([rootUstLokasyonId])
  const queue = [rootUstLokasyonId]
  while (queue.length) {
    const cur = queue.shift()!
    for (const child of childrenMap.get(cur) ?? []) {
      if (result.has(child)) continue
      result.add(child)
      queue.push(child)
    }
  }
  return [...result]
}
