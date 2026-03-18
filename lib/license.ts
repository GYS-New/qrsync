import type { SupabaseClient } from '@supabase/supabase-js'

export type LicenseStatus = {
  validUntil: string | null
  expired: boolean
}

/**
 * Returns tenant license status. If validUntil is null, license is treated as valid (no restriction).
 */
export async function getLicenseStatus(supabase: SupabaseClient, firmaId: string): Promise<LicenseStatus> {
  const { data, error } = await supabase
    .from('firmalar')
    .select('lisans_gecerlilik_tarihi,aktif')
    .eq('id', firmaId)
    .single()

  if (error) throw error

  // Firma pasif edilmişse lisans geçersiz sayılır
  if ((data as any)?.aktif === false) return { validUntil: null, expired: true }

  const validUntil = (data as any)?.lisans_gecerlilik_tarihi ?? null
  if (!validUntil) return { validUntil: null, expired: false }

  const now = new Date()
  const until = new Date(validUntil)
  return { validUntil, expired: now.getTime() > until.getTime() }
}

/**
 * Applies restriction effects once when license is expired:
 * - Deactivates all locations for the firm
 * - Moves live tasks that are ACIK to BEKLEMEDE
 * Sets firmalar.lisans_kisit_uygulandi=true
 */
export async function enforceExpiredLicenseOnce(supabase: SupabaseClient, firmaId: string) {
  const { data: firma, error } = await supabase
    .from('firmalar')
    .select('lisans_gecerlilik_tarihi,lisans_kisit_uygulandi')
    .eq('id', firmaId)
    .single()

  if (error) throw error
  const validUntil = (firma as any)?.lisans_gecerlilik_tarihi ?? null
  const already = !!(firma as any)?.lisans_kisit_uygulandi

  if (!validUntil) return { expired: false, applied: false }

  const now = new Date()
  const until = new Date(validUntil)
  const expired = now.getTime() > until.getTime()
  if (!expired) return { expired: false, applied: false }
  if (already) return { expired: true, applied: false }

  const nowIso = now.toISOString()

  // 1) Deactivate all locations
  // Only mark currently active locations as deactivated-by-license
  await supabase
    .from('lokasyonlar')
    .update({ aktif: false, lisans_pasif: true } as any)
    .eq('firma_id', firmaId)
    .eq('aktif', true)

  // 2) Move live tasks to BEKLEMEDE (only ones that are actively running/open)
  await supabase
    .from('canli_gorevler')
    .update({ durum: 'BEKLEMEDE', durum_degisim_tarihi: nowIso, lisans_beklemeye_alindi: true } as any)
    .eq('firma_id', firmaId)
    .in('durum', ['ACIK'])

  // 3) Mark firm as restricted
  await supabase
    .from('firmalar')
    .update({ lisans_kisit_uygulandi: true, lisans_kisit_tarihi: nowIso })
    .eq('id', firmaId)

  return { expired: true, applied: true }
}

/**
 * If the firm was previously restricted (lisans_kisit_uygulandi=true) and the license is now valid,
 * this restores services:
 * - Re-activates locations that were deactivated by license (lokasyonlar.lisans_pasif=true)
 * - Moves live tasks that were paused by license back to ACIK (canli_gorevler.lisans_beklemeye_alindi=true)
 * - Resets firm restriction flags
 */
export async function restoreAfterLicenseRenewalIfNeeded(supabase: SupabaseClient, firmaId: string) {
  const { data: firma, error } = await supabase
    .from('firmalar')
    .select('lisans_gecerlilik_tarihi,lisans_kisit_uygulandi,lisans_kisit_tarihi')
    .eq('id', firmaId)
    .single()

  if (error) throw error

  const validUntil = (firma as any)?.lisans_gecerlilik_tarihi ?? null
  const restricted = !!(firma as any)?.lisans_kisit_uygulandi
  if (!restricted) return { restored: false }

  // If no date, treat as valid (unlimited)
  const now = new Date()
  const expired = validUntil ? now.getTime() > new Date(validUntil).getTime() : false
  if (expired) return { restored: false }

  const nowIso = now.toISOString()

  // 1) Re-activate only locations that were turned off by license
  await supabase
    .from('lokasyonlar')
    .update({ aktif: true, lisans_pasif: false } as any)
    .eq('firma_id', firmaId)
    .eq('lisans_pasif', true)

  // 2) Restore tasks paused by license back to ACIK
  await supabase
    .from('canli_gorevler')
    .update({ durum: 'ACIK', durum_degisim_tarihi: nowIso, lisans_beklemeye_alindi: false } as any)
    .eq('firma_id', firmaId)
    .eq('lisans_beklemeye_alindi', true)
    .eq('durum', 'BEKLEMEDE')

  // 3) Reset firm restriction flags
  await supabase
    .from('firmalar')
    .update({ lisans_kisit_uygulandi: false, lisans_kisit_tarihi: null } as any)
    .eq('id', firmaId)

  return { restored: true }
}
