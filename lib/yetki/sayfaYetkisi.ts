import { createAdminClient } from '@/lib/supabase/server'

/**
 * Verilen rol + firma için belirtilen sayfanın gorebilir yetkisini kontrol eder.
 * Öncelik sırası: firma bazlı kayıt → global kayıt (firma_id IS NULL) → true (açık)
 * super_admin her zaman true döner.
 */
export async function sayfaGorebilirMi(
  rol: string,
  sayfaKodu: string,
  firmaId?: string | null,
): Promise<boolean> {
  // SA her zaman görebilir
  if (rol === 'super_admin') return true

  const admin = createAdminClient()

  // 1. Firma bazlı kayıt var mı?
  if (firmaId) {
    const { data: firmaRow } = await admin
      .from('kullanici_grubu_yetkileri')
      .select('gorebilir')
      .eq('firma_id', firmaId)
      .eq('rol', rol)
      .eq('sayfa_kodu', sayfaKodu)
      .maybeSingle()

    if (firmaRow !== null && firmaRow !== undefined) {
      return firmaRow.gorebilir === true
    }
  }

  // 2. Global kayıt (firma_id IS NULL)
  const { data: globalRow } = await admin
    .from('kullanici_grubu_yetkileri')
    .select('gorebilir')
    .is('firma_id', null)
    .eq('rol', rol)
    .eq('sayfa_kodu', sayfaKodu)
    .maybeSingle()

  // 3. Kayıt yoksa açık
  if (!globalRow) return true

  return globalRow.gorebilir === true
}
