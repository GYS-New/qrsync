import type { SupabaseClient } from '@supabase/supabase-js'

export type MinSureHata = {
  code: 'MIN_SURE_DOLMADI'
  error: string
  gercek_gecen_sn: number
  min_gereken_sn: number
  kalan_sn: number
  lokasyon_id: string | null
}

/**
 * Min süre validasyonu (backend defense-in-depth, mobil 1.0.28+ ile birlikte 2. katman).
 *
 * Mobil 'min_sure_bypass' tespit etmek için wall-clock kontrolü yapıyor, fakat
 * UI state hatası / bypass denemesi durumunda backend de aynı kontrolü yapmalı.
 * Spec: docs/MOBIL_EKIBE_MIN_SURE_VALIDASYON.md (02 Haz 2026, OYAK RENAULT).
 *
 * Mantık:
 *   - Görevi yükle: baslatilma_tarihi + lokasyon_id
 *   - Lokasyonu yükle: min_sure_dakika
 *   - min_sure_dakika null/0 → kontrol atla, null dön (kural yok)
 *   - baslatilma_tarihi null → kontrol atla, null dön
 *     (Auto-baslat öncesi çağrılırsa atlanır. Auto-baslat sonrası çağrılırsa
 *      baslatilma_tarihi=now → gercek_gecen_sn=0 → min süre > 0 ise REDDET.)
 *   - gercek_gecen_sn >= min_gereken_sn → null (geçti)
 *   - Aksi: MinSureHata objesi (kalan_sn ile birlikte mobile timer için)
 *
 * @returns null = devam et, MinSureHata = engelle
 */
export async function minSureKontrol(
  admin: SupabaseClient,
  gorevId: string,
  gorevTipi: 'gorevler' | 'canli_gorevler',
): Promise<MinSureHata | null> {
  const { data: gorev } = await admin
    .from(gorevTipi)
    .select('id, lokasyon_id, baslatilma_tarihi')
    .eq('id', gorevId)
    .maybeSingle()

  if (!gorev) return null  // görev yok — başka bir yerde 404 dönecek
  if (!gorev.baslatilma_tarihi) return null
  if (!gorev.lokasyon_id) return null

  const { data: lok } = await admin
    .from('lokasyonlar')
    .select('min_sure_dakika')
    .eq('id', gorev.lokasyon_id)
    .maybeSingle()

  const minDk = lok?.min_sure_dakika ?? 0
  if (!minDk || minDk <= 0) return null

  const gercekGecenSn = Math.max(
    0,
    Math.floor((Date.now() - new Date(gorev.baslatilma_tarihi as any).getTime()) / 1000),
  )
  const minGerekenSn = minDk * 60

  if (gercekGecenSn >= minGerekenSn) return null

  const kalanSn = minGerekenSn - gercekGecenSn
  const kalanDk = Math.floor(kalanSn / 60)
  const kalanSnRem = kalanSn % 60
  const kalanStr = kalanDk > 0
    ? (kalanSnRem > 0 ? `${kalanDk} dakika ${kalanSnRem} saniye` : `${kalanDk} dakika`)
    : `${kalanSnRem} saniye`

  return {
    code: 'MIN_SURE_DOLMADI',
    error: `Minimum süre dolmadı, ${kalanStr} daha bekleyin.`,
    gercek_gecen_sn: gercekGecenSn,
    min_gereken_sn: minGerekenSn,
    kalan_sn: kalanSn,
    lokasyon_id: gorev.lokasyon_id,
  }
}
