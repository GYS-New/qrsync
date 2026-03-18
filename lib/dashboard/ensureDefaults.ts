import { createClient } from '@/lib/supabase/server'
import { DEFAULT_DASHBOARD_BLOKLARI } from './blocks'

export async function ensureDashboardDefaults(userId: string) {
  const supabase = createClient()

  const { data: existing } = await supabase
    .from('dashboard_bloklar')
    .select('*')
    .eq('user_id', userId)
    .order('sira', { ascending: true })

  // Seed defaults for first-time users.
  // Also, if we introduce NEW default blocks later, insert them only if the user
  // doesn't already have a record for that block type (so we don't re-enable
  // blocks the user explicitly removed/disabled).
  const present = new Set((existing ?? []).map((b: any) => b.blok_turu))
  const missingDefaults = DEFAULT_DASHBOARD_BLOKLARI.filter((b) => !present.has(b.blok_turu))

  if (missingDefaults.length > 0) {
    await supabase.from('dashboard_bloklar').insert(
      missingDefaults.map((b) => ({
        user_id: userId,
        blok_turu: b.blok_turu,
        aktif: b.aktif ?? true,
        sira: b.sira,
        ayarlar: b.ayarlar ?? {},
      }))
    )
  }

  const { data } = await supabase
    .from('dashboard_bloklar')
    .select('*')
    .eq('user_id', userId)
    .order('sira', { ascending: true })

  return data ?? []
}
