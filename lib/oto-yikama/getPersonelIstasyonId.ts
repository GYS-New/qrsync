/**
 * Bir Oto Yıkama personelinin "kayıtlı istasyonunu" (child) döndürür.
 *
 * Kural (kullanıcı 2026-07-09):
 *   Yıkanan aracın istasyonu = işlemi yapan personelin kayıtlı istasyonu.
 *   Aracın varsayılan istasyonu sadece "kayıt" — gerçek işlem lokasyonu personelin
 *   Kullanıcılar sayfasında (users.varsayilan_yikama_istasyon_id) tanımlı child'ı.
 *
 * ÖNEMLI FARK — users.ust_lokasyon_id yerine varsayilan_yikama_istasyon_id kullanılır:
 *   - ust_lokasyon_id her zaman PARENT (üst istasyon, örn. ARAÇ YIKAMA) → gorevler.lokasyon_id'ye
 *     yazılırsa rapor grafiğinde sahte "ARAÇ YIKAMA" istasyonu belirir (2026-07-09 bugu).
 *   - varsayilan_yikama_istasyon_id CHILD (spesifik istasyon, İSTASYON-1/İSTASYON-2) tutar;
 *     Oto Yıkama > Kullanıcılar sayfasındaki "İstasyon" dropdown'u bu alanı günceller.
 *
 * NULL kontrolu: alan doldurulmamışsa null döner — çağıran endpoint lokasyon_id'yi
 * değiştirmez (varsayılan davranış: aracın varsayilan_lokasyon_id'si veya body.lokasyon_id).
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function getPersonelIstasyonId(
  admin: SupabaseClient,
  userId: string,
  firmaId: string,
): Promise<string | null> {
  const { data: u } = await admin
    .from('users')
    .select('varsayilan_yikama_istasyon_id')
    .eq('id', userId)
    .eq('firma_id', firmaId)
    .maybeSingle()

  const istasyonId = (u as any)?.varsayilan_yikama_istasyon_id as string | null | undefined
  if (!istasyonId) return null

  // İstasyonun aktif ve child (parent_id != NULL) olduğunu doğrula.
  // Personel varsayilan_yikama_istasyon_id'si UI'da tanimlaniyor ama migrasyon
  // sonrasi silinmiş/pasifleştirilmiş olabilir.
  const { data: lok } = await admin
    .from('lokasyonlar')
    .select('id')
    .eq('id', istasyonId)
    .eq('aktif', true)
    .not('parent_id', 'is', null)
    .maybeSingle()

  return (lok as any)?.id ?? null
}
