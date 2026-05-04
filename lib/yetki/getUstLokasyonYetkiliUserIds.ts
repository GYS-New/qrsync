import { createAdminClient } from '@/lib/supabase/server'

/**
 * Üst lokasyona yetkilendirilmiş (yönetici/sorumlu) U/M kullanıcılarını döndürür.
 * Bu kullanıcılar saha personeli değil — başarı/aktivite analizlerinden hariç tutulur.
 *
 * Örnek: DİSGS sorumlusu Mustafa Yıldız, MONTAJ sorumlusu Sinan Korkmaz.
 */
export async function getUstLokasyonYetkiliUserIds(firmaId: string): Promise<Set<string>> {
  if (!firmaId) return new Set()
  const admin = createAdminClient()
  const { data } = await admin
    .from('kullanici_lokasyon_yetkileri')
    .select('user_id')
    .eq('firma_id', firmaId)
  return new Set((data ?? []).map((r: any) => r.user_id as string))
}
