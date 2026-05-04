import type { SupabaseClient } from '@supabase/supabase-js'

export interface AktifGorevBilgi {
  id: string
  tanim: string | null
  gorev_tipi: 'canli_gorevler' | 'gorevler'
  lokasyon_id: string | null
  lokasyon_tanim: string | null
  baslatilma_tarihi: string | null
}

/**
 * Kullanıcının açık (ISLEMDE) görevi var mı kontrol eder.
 * Varsa: yeni başka görev başlatılmasına izin verilmemeli.
 *
 * @param excludeTaskId — Bu task'ı kontrol dışında tut (kullanıcı aynı görevi tekrar başlatıyorsa)
 * @returns Aktif görev bilgisi veya null
 */
export async function devamEdenGorevKontrol(
  supabase: SupabaseClient,
  userId: string,
  firmaId: string,
  opts?: { excludeTaskId?: string },
): Promise<AktifGorevBilgi | null> {
  const exclude = opts?.excludeTaskId

  // Frekansiyel canlı görevler
  let canliQ = supabase
    .from('canli_gorevler')
    .select('id, tanim, baslatilma_tarihi, lokasyon_id, lokasyonlar(tanim)')
    .eq('firma_id', firmaId)
    .eq('durum', 'ISLEMDE')
    .or(`atanan_kullanici_id.eq.${userId},islemi_yapan_id.eq.${userId},baslatan_kullanici_id.eq.${userId}`)
    .order('baslatilma_tarihi', { ascending: false })
    .limit(1)
  if (exclude) canliQ = (canliQ as any).neq('id', exclude)
  const { data: canli } = await canliQ.maybeSingle()

  if (canli) {
    return {
      id: (canli as any).id,
      tanim: (canli as any).tanim ?? null,
      gorev_tipi: 'canli_gorevler',
      lokasyon_id: (canli as any).lokasyon_id ?? null,
      lokasyon_tanim: ((canli as any).lokasyonlar as any)?.tanim ?? null,
      baslatilma_tarihi: (canli as any).baslatilma_tarihi ?? null,
    }
  }

  // Spesifik görevler
  let spesifikQ = supabase
    .from('gorevler')
    .select('id, tanim, baslatilma_tarihi, lokasyon_id, lokasyonlar(tanim)')
    .eq('firma_id', firmaId)
    .eq('durum', 'ISLEMDE')
    .or(`atanan_kullanici_id.eq.${userId},islemi_yapan_id.eq.${userId}`)
    .order('baslatilma_tarihi', { ascending: false })
    .limit(1)
  if (exclude) spesifikQ = (spesifikQ as any).neq('id', exclude)
  const { data: spesifik } = await spesifikQ.maybeSingle()

  if (spesifik) {
    return {
      id: (spesifik as any).id,
      tanim: (spesifik as any).tanim ?? null,
      gorev_tipi: 'gorevler',
      lokasyon_id: (spesifik as any).lokasyon_id ?? null,
      lokasyon_tanim: ((spesifik as any).lokasyonlar as any)?.tanim ?? null,
      baslatilma_tarihi: (spesifik as any).baslatilma_tarihi ?? null,
    }
  }

  return null
}
