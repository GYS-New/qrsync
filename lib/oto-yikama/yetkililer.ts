import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Bir firmada Oto Yıkama yetkili (yıkama personeli) user_id setini döner.
 * İki kaynağın birleşimi (tek source of truth):
 *   A) users.ust_lokasyon_id → oto_yikama_lokasyon=true bir üst lokasyon
 *   B) kullanici_lokasyon_yetkileri → oto_yikama_lokasyon=true bir üst lokasyon
 *
 * Aynı kontrol /api/app/me oto_yikama_personeli ve lib/modul/yetkiliModuller'da
 * yapılır — bu helper kod tekrarını azaltır.
 */
export async function getYikamaYetkiliUserIds(
  admin: SupabaseClient,
  firmaId: string,
): Promise<string[]> {
  if (!firmaId) return []

  const { data: otoLoks } = await admin
    .from('lokasyonlar')
    .select('id')
    .eq('firma_id', firmaId)
    .eq('oto_yikama_lokasyon', true)
    .eq('aktif', true)
  const otoUstIds = (otoLoks ?? []).map((l: any) => l.id as string)
  if (otoUstIds.length === 0) return []

  const [yetkiRes, userRes] = await Promise.all([
    admin
      .from('kullanici_lokasyon_yetkileri')
      .select('user_id')
      .eq('firma_id', firmaId)
      .in('ust_lokasyon_id', otoUstIds),
    admin
      .from('users')
      .select('id')
      .eq('firma_id', firmaId)
      .in('ust_lokasyon_id', otoUstIds),
  ])

  const set = new Set<string>()
  for (const r of (yetkiRes.data ?? [])) set.add((r as any).user_id)
  for (const u of (userRes.data ?? [])) set.add((u as any).id)
  return [...set]
}

/**
 * Bir firmada Oto Yıkama üst lokasyonu olarak işaretli lokasyonların ID'leri.
 */
export async function getYikamaUstLokasyonIds(
  admin: SupabaseClient,
  firmaId: string,
): Promise<string[]> {
  if (!firmaId) return []
  const { data } = await admin
    .from('lokasyonlar')
    .select('id')
    .eq('firma_id', firmaId)
    .eq('oto_yikama_lokasyon', true)
    .eq('aktif', true)
  return (data ?? []).map((l: any) => l.id as string)
}
