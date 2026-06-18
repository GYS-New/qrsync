import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Bir kullanıcının Oto Yıkama'ya yetkili olduğu üst lokasyon ID'leri.
 *
 * İKİ kaynağı OR'lar (kullanıcılar sayfasındaki getYikamaYetkiliUserIds
 * helper'ı ile aynı mantık):
 *   1. users.ust_lokasyon_id (primary atama)
 *   2. kullanici_lokasyon_yetkileri.ust_lokasyon_id (çoklu ek atamalar)
 *
 * Sonra bu üst lokasyonlardan firma'ya ait + aktif + oto_yikama_lokasyon=true
 * olanları filtreler.
 *
 * Mobil API yetki kontrolünün tek noktada toplanmasını sağlar; aksi halde her
 * endpoint farklı bir kaynak kontrol edince MOBİL ANDROİD TEST gibi
 * users.ust_lokasyon_id dolu ama KLY'de kayıtsız kullanıcılar bazı işlemleri
 * yapamıyor (2026-06-18 saha bug raporu — upload/oto-yikama "Lokasyon
 * yetkiniz yok" dönüyordu).
 */
export async function getUserOtoYikamaUstIds(
  admin: SupabaseClient,
  userId: string,
  firmaId: string,
): Promise<string[]> {
  const [userRes, klyRes] = await Promise.all([
    admin.from('users').select('ust_lokasyon_id').eq('id', userId).maybeSingle(),
    admin.from('kullanici_lokasyon_yetkileri').select('ust_lokasyon_id').eq('user_id', userId),
  ])

  const candidateIds = new Set<string>()
  const userUst = (userRes.data as any)?.ust_lokasyon_id
  if (userUst) candidateIds.add(userUst)
  for (const r of (klyRes.data ?? []) as any[]) {
    if (r.ust_lokasyon_id) candidateIds.add(r.ust_lokasyon_id)
  }
  if (candidateIds.size === 0) return []

  const { data: loks } = await admin
    .from('lokasyonlar')
    .select('id')
    .in('id', [...candidateIds])
    .eq('oto_yikama_lokasyon', true)
    .eq('aktif', true)
    .eq('firma_id', firmaId)

  return (loks ?? []).map((l: any) => l.id)
}
