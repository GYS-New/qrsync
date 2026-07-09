/**
 * Bir Oto Yıkama personelinin "kayıtlı istasyonunu" döndürür.
 *
 * Kural (kullanıcı 2026-07-09):
 *   Yıkamanın istasyonu = işlemi yapan personelin kayıtlı olduğu istasyon.
 *   Aracın varsayılan istasyonu artık sadece "kayıt" — gerçek işlem lokasyonunu
 *   personel belirler. Bu helper mutation endpoint'lerinde durum değişimi
 *   (ISLEMDE / TAMAMLANDI) anında gorevler.lokasyon_id revizyonunda kullanılır.
 *
 * Öncelik:
 *   1) users.ust_lokasyon_id  (birincil — tekli)
 *   2) kullanici_lokasyon_yetkileri.ust_lokasyon_id  (ek yetkiler — çoklu; ilk aktif)
 *   Her iki durumda da hedef lokasyon aktif=true ve oto_yikama_lokasyon=true olmalı.
 *
 * Hiçbiri yoksa null döner — çağıran taraf lokasyon_id'yi değiştirmez.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export async function getPersonelIstasyonId(
  admin: SupabaseClient,
  userId: string,
  firmaId: string,
): Promise<string | null> {
  // 1) Birincil: users.ust_lokasyon_id — aktif + oto_yikama olduğunu doğrula
  const { data: u } = await admin
    .from('users')
    .select('ust_lokasyon_id')
    .eq('id', userId)
    .eq('firma_id', firmaId)
    .maybeSingle()

  const birincilId = (u as any)?.ust_lokasyon_id as string | null | undefined
  if (birincilId) {
    const { data: lok } = await admin
      .from('lokasyonlar')
      .select('id')
      .eq('id', birincilId)
      .eq('aktif', true)
      .eq('oto_yikama_lokasyon', true)
      .maybeSingle()
    if ((lok as any)?.id) return (lok as any).id as string
  }

  // 2) Ek yetkiler: kullanici_lokasyon_yetkileri — ilk aktif oto_yikama istasyonu
  const { data: ky } = await admin
    .from('kullanici_lokasyon_yetkileri')
    .select('ust_lokasyon_id, lokasyonlar:ust_lokasyon_id!inner(id, aktif, oto_yikama_lokasyon)')
    .eq('user_id', userId)
    .eq('firma_id', firmaId)
    .eq('lokasyonlar.aktif', true)
    .eq('lokasyonlar.oto_yikama_lokasyon', true)
    .limit(1)

  const rows = (ky ?? []) as any[]
  return rows[0]?.ust_lokasyon_id ?? null
}
