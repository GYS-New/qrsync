/**
 * Bir firmada Oto Yıkama olarak işaretlenmiş üst lokasyonların ID'leri +
 * tüm alt soyları (BFS) — SA dışı rollere bu lokasyonların gösterilmemesi
 * için hariç tutma listesi olarak kullanılır.
 *
 * Oto Yıkama modülü şimdilik SA'ya özel; TA/U/M hiçbir UI'da bu lokasyonları
 * görmemeli (kural oluşturma, dropdown, rapor, dashboard, vs).
 *
 * Kullanım:
 *   const gizliIds = await getOtoYikamaLokasyonIds(admin, firmaId)
 *   if (gizliIds.size > 0) query = query.not('id', 'in', `(${[...gizliIds].join(',')})`)
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function getOtoYikamaLokasyonIds(
  supabase: SupabaseClient,
  firmaId: string,
): Promise<Set<string>> {
  if (!firmaId) return new Set()

  // Oto Yıkama işaretli üst lokasyonlar
  const { data: ustler } = await supabase
    .from('lokasyonlar')
    .select('id')
    .eq('firma_id', firmaId)
    .eq('oto_yikama_lokasyon', true)
  const ustIds = (ustler ?? []).map((u: any) => u.id as string)
  if (ustIds.length === 0) return new Set()

  // Tüm firma lokasyonlarını çek (parent_id), BFS ile alt soyları topla
  const { data: tum } = await supabase
    .from('lokasyonlar')
    .select('id, parent_id')
    .eq('firma_id', firmaId)
  if (!tum) return new Set(ustIds)

  const seti = new Set<string>(ustIds)
  const queue = [...ustIds]
  while (queue.length) {
    const cur = queue.shift()!
    for (const l of tum as any[]) {
      if (l.parent_id === cur && !seti.has(l.id)) {
        seti.add(l.id)
        queue.push(l.id)
      }
    }
  }
  return seti
}
