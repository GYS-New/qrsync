/**
 * Cloudflare 8KB HTTP request-line limitini asmamak icin .in(col, N-UUIDs)
 * cagrilarini 100'luk chunk'lara boler.
 *
 * Uzun ID listelerinde (orn. musteri yetkili_lokasyon ~1000+ alt UUID) tek
 * sorgu URL'yi 16KB+'a cikarir -> Supabase fetch failed -> sayfa "Baglanti
 * sorunu". Cozum: 100'er UUID (~3.7KB), sonuclari birlestir.
 *
 * Kullanim:
 *   const rows = await selectInChunks(ids, (slice) =>
 *     admin.from('canli_gorevler').select('*').in('lokasyon_id', slice).eq('durum','ACIK')
 *   )
 *
 *   const total = await countInChunks(ids, (slice) =>
 *     admin.from('canli_gorevler').select('id', { count: 'exact', head: true }).in('lokasyon_id', slice)
 *   )
 */

export async function selectInChunks<T = any>(
  ids: string[] | null | undefined,
  build: (slice: string[]) => any,
  chunkSize = 100,
): Promise<T[]> {
  if (!ids || ids.length === 0) return []
  const out: T[] = []
  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize)
    const { data, error } = await build(slice)
    if (error) throw error
    if (data && data.length) out.push(...(data as T[]))
  }
  return out
}

/**
 * head: true + count: 'exact' modunda chunk toplami doner.
 * Not: ayni satir birden fazla chunk'ta sayilabilir mi? HAYIR -
 * lokasyon_id tekil, bir satir bir chunk'ta olabilir.
 */
export async function countInChunks(
  ids: string[] | null | undefined,
  build: (slice: string[]) => any,
  chunkSize = 100,
): Promise<number> {
  if (!ids || ids.length === 0) return 0
  let total = 0
  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize)
    const { count, error } = await build(slice)
    if (error) throw error
    total += (count ?? 0)
  }
  return total
}
