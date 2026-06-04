import type { SupabaseClient } from '@supabase/supabase-js'

const HOUR = 60 * 60 * 1000

export const LIVE_OPEN_TO_LATE_COMPLETE_HOURS = 8
export const LIVE_OPEN_TO_WAIT_HOURS = 12
export const LIVE_WAIT_TO_EXPIRED_HOURS = 12

export function calcLiveElapsedHours(fromIso?: string | null, nowIso?: string) {
  if (!fromIso) return 0
  const from = new Date(fromIso).getTime()
  const to = new Date(nowIso ?? new Date().toISOString()).getTime()
  if (Number.isNaN(from) || Number.isNaN(to)) return 0
  return Math.max(0, (to - from) / HOUR)
}

/**
 * ACIK durumdaki bir görevin tamamlama anındaki durumunu belirler.
 *
 * @param openedAt aktif_olma_tarihi
 * @param nowIso şimdi
 * @param acikBeklemeSaat görev-kural bazlı eşik (saat). Verilmezse sistem
 *        varsayılanı LIVE_OPEN_TO_LATE_COMPLETE_HOURS (8) kullanılır.
 *
 * Mantık: aktif olduktan sonra `acikBeklemeSaat` kadar süre geçmişse görev
 * ACIK → BEKLEMEDE eşiğini aşmıştır, "geç tamamlama" sayılır. Aksi halde
 * normal TAMAMLANDI.
 *
 * NOT: Önceden eşik hardcoded 8 saat idi; canli_gorevler.acik_bekleme_saat
 * (veya kural ayarı) farklı olan görevler (örn 24 saat günlük zemin yıkama)
 * yanlışça "geç" sayılıyordu. 2026-06-04 itibariyle kural bazlı eşik aktif.
 */
export function resolveLiveCompletionStatus(
  openedAt?: string | null,
  nowIso?: string,
  acikBeklemeSaat?: number | null,
) {
  const elapsedHours = calcLiveElapsedHours(openedAt, nowIso)
  const threshold = (typeof acikBeklemeSaat === 'number' && acikBeklemeSaat > 0)
    ? acikBeklemeSaat
    : LIVE_OPEN_TO_LATE_COMPLETE_HOURS
  return elapsedHours >= threshold ? 'ZAMANINDA_YAPILAMAYAN' : 'TAMAMLANDI'
}

export async function syncLiveTaskStatuses(opts: { supabase: SupabaseClient; locationId?: string | null }) {
  const { supabase, locationId } = opts
  const nowIso = new Date().toISOString()
  const minus12OpenIso = new Date(Date.now() - LIVE_OPEN_TO_WAIT_HOURS * HOUR).toISOString()
  const minus12WaitIso = new Date(Date.now() - LIVE_WAIT_TO_EXPIRED_HOURS * HOUR).toISOString()

  let readyToOpen = supabase
    .from('canli_gorevler')
    .update({ durum: 'ACIK', durum_degisim_tarihi: nowIso })
    .eq('durum', 'HAZIR')
    .lte('aktif_olma_tarihi', nowIso)

  let openToWait = supabase
    .from('canli_gorevler')
    .update({ durum: 'BEKLEMEDE', durum_degisim_tarihi: nowIso, iptal_eden_id: null })
    .eq('durum', 'ACIK')
    .lte('aktif_olma_tarihi', minus12OpenIso)

  // BEKLEMEDE -> ZAMANI_GECMIS:
  // durum_degisim_tarihi = BEKLEMEDE'ye geçiş zamanı; bunun üzerinden 12 saat geçmişse ZAMANI_GECMIS yap.
  // Ek güvence: aktif_olma_tarihi üzerinden de toplam 24 saat (12+12) geçmiş olmalı.
  const minus24TotalIso = new Date(Date.now() - (LIVE_OPEN_TO_WAIT_HOURS + LIVE_WAIT_TO_EXPIRED_HOURS) * HOUR).toISOString()
  let waitToExpired = supabase
    .from('canli_gorevler')
    .update({ durum: 'ZAMANI_GECMIS', durum_degisim_tarihi: nowIso, iptal_eden_id: null })
    .eq('durum', 'BEKLEMEDE')
    .lte('durum_degisim_tarihi', minus12WaitIso)

  if (locationId) {
    readyToOpen = readyToOpen.eq('lokasyon_id', locationId)
    openToWait = openToWait.eq('lokasyon_id', locationId)
    waitToExpired = waitToExpired.eq('lokasyon_id', locationId)
  }

  const [activated, waited, expired] = await Promise.all([
    readyToOpen.select('id'),
    openToWait.select('id'),
    waitToExpired.select('id'),
  ])

  if (activated.error) throw new Error(activated.error.message)
  if (waited.error) throw new Error(waited.error.message)
  if (expired.error) throw new Error(expired.error.message)

  return {
    nowIso,
    activated: activated.data?.length ?? 0,
    waited: waited.data?.length ?? 0,
    expired: expired.data?.length ?? 0,
  }
}


export function resolveLiveCompletionStatusByTask(
  task: {
    durum?: string | null
    aktif_olma_tarihi?: string | null
    durum_degisim_tarihi?: string | null
    acik_bekleme_saat?: number | null
  },
  nowIso?: string,
) {
  const durum = task?.durum ?? null
  if (durum === 'ZAMANI_GECMIS') return 'ZAMANI_GECMIS'
  if (durum === 'BEKLEMEDE') return 'ZAMANINDA_YAPILAMAYAN'
  return resolveLiveCompletionStatus(
    task?.aktif_olma_tarihi ?? task?.durum_degisim_tarihi ?? null,
    nowIso,
    task?.acik_bekleme_saat ?? null,
  )
}
