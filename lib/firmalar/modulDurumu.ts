/**
 * Firma modül flag'lerini kontrol eden server-side yardımcılar.
 *
 * Şu an sadece `oto_yikama_aktif` flag'i destekli; ileride başka modüller
 * (örn. `bakim_modul_aktif`) eklendiğinde aynı pattern'le buraya katılır.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type FirmaModul = 'oto_yikama_aktif'

/**
 * Bir firma için tek bir modül flag'inin değerini döndürür.
 * Hata veya firma bulunamazsa `false` döner (fail-closed).
 */
export async function getFirmaModulDurumu(
  client: SupabaseClient,
  firmaId: string,
  modul: FirmaModul,
): Promise<boolean> {
  if (!firmaId) return false
  const { data, error } = await client
    .from('firmalar')
    .select(modul)
    .eq('id', firmaId)
    .single()
  if (error || !data) return false
  return (data as any)[modul] === true
}
