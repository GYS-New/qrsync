/**
 * Görevlerin islemi_yapan / tamamlayan / iptal_eden / olusturan id'lerini
 * isim_soyisim'e çözer. Admin client ile RLS'i bypass eder — böylece SA
 * gibi farklı firma_id'li aktörler de doğru gösterilir.
 *
 * Mig 099 sonrası: web'ten yapılan tüm durum değişimleri islemi_yapan_id'ye
 * yazılır; o id SA olabilir ve client-side firma user listesinde bulunmaz.
 */
import { createAdminClient } from '@/lib/supabase/server'

export async function getActorMap(gorevler: any[]): Promise<Record<string, string>> {
  const ids = new Set<string>()
  for (const g of gorevler) {
    if (g.islemi_yapan_id)         ids.add(g.islemi_yapan_id)
    if (g.tamamlayan_kullanici_id) ids.add(g.tamamlayan_kullanici_id)
    if (g.iptal_eden_id)           ids.add(g.iptal_eden_id)
    if (g.olusturan_id)            ids.add(g.olusturan_id)
  }
  if (ids.size === 0) return {}
  const admin = createAdminClient()
  const { data } = await admin.from('users').select('id, isim_soyisim').in('id', [...ids])
  const map: Record<string, string> = {}
  for (const u of (data ?? []) as any[]) map[u.id] = u.isim_soyisim ?? ''
  return map
}
