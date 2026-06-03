import type { SupabaseClient } from '@supabase/supabase-js'

export type MaxSureHata = {
  code: 'MAX_SURE_ASILDI'
  error: string
  gercek_gecen_sn: number
  max_izin_sn: number
  asim_sn: number
  lokasyon_id: string | null
}

/**
 * Max süre validasyonu — backend defense-in-depth.
 *
 * Spec: docs/MOBIL_EKIBE_MIN_SURE_VALIDASYON.md (02 Haz 2026, OYAK RENAULT).
 *
 * Mevcut cron (/api/tasks/max-sure-kontrol) düzensiz aralıkla çalışıp max süre
 * dolmuş ISLEMDE görevleri otomatik TAMAMLANDI yapıyor (kayıp sayılmasın diye).
 * Ancak manuel tamamlama 121 dk gibi aşımlarla geçebiliyordu — cron sadece
 * ISLEMDE'leri yakalıyor, TAMAMLANDI olmuş aşımları geri alamıyor.
 *
 * Bu helper manuel tamamlama anında devreye girer:
 *   - max süre aşılmışsa → MaxSureHata döner
 *   - Çağıran endpoint görevi IPTAL'e çeker (iptal_sebep='Max süre aşımı')
 *
 * Mantık:
 *   - max_sure_dakika null/0 → kontrol atla
 *   - baslatilma_tarihi null → atla
 *   - gercek_gecen_sn <= max_izin_sn → null (geçti)
 *   - Aksi: MaxSureHata
 */
export async function maxSureKontrol(
  admin: SupabaseClient,
  gorevId: string,
  gorevTipi: 'gorevler' | 'canli_gorevler',
): Promise<MaxSureHata | null> {
  const { data: gorev } = await admin
    .from(gorevTipi)
    .select('id, lokasyon_id, baslatilma_tarihi')
    .eq('id', gorevId)
    .maybeSingle()

  if (!gorev) return null
  if (!gorev.baslatilma_tarihi) return null
  if (!gorev.lokasyon_id) return null

  const { data: lok } = await admin
    .from('lokasyonlar')
    .select('max_sure_dakika')
    .eq('id', gorev.lokasyon_id)
    .maybeSingle()

  const maxDk = lok?.max_sure_dakika ?? 0
  if (!maxDk || maxDk <= 0) return null

  const gercekGecenSn = Math.max(
    0,
    Math.floor((Date.now() - new Date(gorev.baslatilma_tarihi as any).getTime()) / 1000),
  )
  const maxIzinSn = maxDk * 60

  if (gercekGecenSn <= maxIzinSn) return null

  const asimSn = gercekGecenSn - maxIzinSn
  const asimDk = Math.floor(asimSn / 60)
  const asimStr = asimDk > 0 ? `${asimDk} dakika` : `${asimSn} saniye`

  return {
    code: 'MAX_SURE_ASILDI',
    error: `Maksimum süre aşıldı (${asimStr} fazla). Görev otomatik iptal edildi.`,
    gercek_gecen_sn: gercekGecenSn,
    max_izin_sn: maxIzinSn,
    asim_sn: asimSn,
    lokasyon_id: gorev.lokasyon_id,
  }
}
