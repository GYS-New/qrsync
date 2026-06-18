import type { SupabaseClient } from '@supabase/supabase-js'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'

/**
 * Oto Yıkama sayfaları için firma çözümleme.
 *
 * SA olmayan kullanıcılar: kendi me.firma_id'leri kullanılır.
 *
 * SA için:
 *   1. GYS'de seçilmiş aktif firma (cookie) varsa onu kullan.
 *   2. Yoksa fallback: oto_yikama_aktif=true olan ilk aktif firma.
 *      (Oto Yıkama modülü pratikte tek firmada açıktır; SA Oto Yıkama'ya
 *       direkt gelirse "firma seçin" uyarısı yerine modül kullanılabilir
 *       olsun.)
 *
 * Dönen değer null ise modül hiçbir firmada aktif değil demek.
 */
export async function getOtoYikamaFirmaId(
  admin: SupabaseClient,
  me: { rol: string; firma_id: string | null },
): Promise<string | null> {
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  if (!isSA) return me.firma_id

  const cookieFirma = getAktifFirmaId()
  if (cookieFirma) return cookieFirma

  const { data } = await admin
    .from('firmalar')
    .select('id')
    .eq('oto_yikama_aktif', true)
    .eq('aktif', true)
    .order('firma_adi', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}
