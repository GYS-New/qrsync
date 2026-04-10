/**
 * Supabase PostgREST max_rows=1000 limitini aşmak için pagination helper.
 * Query builder factory fonksiyonu alır, 1000'er satır çekerek birleştirir.
 *
 * Kullanım:
 *   const data = await fetchAll(() =>
 *     admin.from('canli_gorevler').select('id,durum').eq('firma_id', firmaId)
 *   )
 */
export async function fetchAll<T = any>(buildQuery: () => any): Promise<T[]> {
  const PAGE = 1000
  const all: T[] = []
  let from = 0

  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  return all
}
