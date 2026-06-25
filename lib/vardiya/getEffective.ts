/**
 * Efektif vardiya ayarları — proje override > firma fallback.
 *
 * Vardiya ayarları aslen firmalar tablosundaydı. Migration 094 ile projeler
 * tablosuna da eklendi (proje-seviyesi override). Bu helper okuma noktalarını
 * tek yerden yönetir: önce projedeki değer (varsa), yoksa firma değeri.
 *
 * MIGRATION SONRASI:
 *   - Mevcut tüm projelerin değerleri firmadan kopyalandı (snapshot)
 *   - Yani başlangıçta proje değeri = firma değeri → davranış değişmez
 *   - Proje override edildiğinde sadece o projedeki görevler/cron'lar etkilenir
 *
 * KULLANIM:
 *   const v = await getEffectiveVardiya(admin, firmaId, projeId)
 *   v.tum_vardiya_ayarlari  // yeni format (vardiyalar array)
 *   v.vardiya_saatleri      // legacy format (jsonb)
 *   v.vardiya_sayisi        // sayı
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type EfektifVardiya = {
  vardiya_sayisi: number | null
  vardiya_saatleri: any | null
  tum_vardiya_ayarlari: any | null
  /** Kaynak: 'proje' (override aktif) veya 'firma' (firma default kullanılıyor) */
  kaynak: 'proje' | 'firma'
}

const BOS: EfektifVardiya = {
  vardiya_sayisi: null,
  vardiya_saatleri: null,
  tum_vardiya_ayarlari: null,
  kaynak: 'firma',
}

/**
 * Bir firma + proje için efektif vardiya ayarlarını döner.
 * projeId verilmezse sadece firma değeri okunur.
 */
export async function getEffectiveVardiya(
  admin: SupabaseClient,
  firmaId: string | null | undefined,
  projeId?: string | null,
): Promise<EfektifVardiya> {
  if (!firmaId) return BOS

  // Tek query: hem proje hem firma değerlerini çek, sonra merge
  const [projeRes, firmaRes] = await Promise.all([
    projeId
      ? admin.from('projeler')
          .select('vardiya_sayisi, vardiya_saatleri, tum_vardiya_ayarlari')
          .eq('id', projeId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from('firmalar')
      .select('vardiya_sayisi, vardiya_saatleri, tum_vardiya_ayarlari')
      .eq('id', firmaId)
      .maybeSingle(),
  ])

  const proje = (projeRes as any).data
  const firma = (firmaRes as any).data
  if (!firma && !proje) return BOS

  // Override mantığı: proje.X != null ise proje değeri, aksi halde firma değeri
  const projeAktif = proje && (
    proje.vardiya_sayisi != null ||
    proje.vardiya_saatleri != null ||
    proje.tum_vardiya_ayarlari != null
  )

  return {
    vardiya_sayisi: proje?.vardiya_sayisi ?? firma?.vardiya_sayisi ?? null,
    vardiya_saatleri: proje?.vardiya_saatleri ?? firma?.vardiya_saatleri ?? null,
    tum_vardiya_ayarlari: proje?.tum_vardiya_ayarlari ?? firma?.tum_vardiya_ayarlari ?? null,
    kaynak: projeAktif ? 'proje' : 'firma',
  }
}

/**
 * Eğer hem firma hem proje row'larını zaten elinde tutuyorsan (örn. join
 * sonucu), direkt merge için sync versiyonu. DB sorgusu yapmaz.
 */
export function mergeVardiyaRows(
  firma: { vardiya_sayisi?: number | null; vardiya_saatleri?: any; tum_vardiya_ayarlari?: any } | null,
  proje?: { vardiya_sayisi?: number | null; vardiya_saatleri?: any; tum_vardiya_ayarlari?: any } | null,
): EfektifVardiya {
  if (!firma && !proje) return BOS
  const projeAktif = proje && (
    proje.vardiya_sayisi != null ||
    proje.vardiya_saatleri != null ||
    proje.tum_vardiya_ayarlari != null
  )
  return {
    vardiya_sayisi: proje?.vardiya_sayisi ?? firma?.vardiya_sayisi ?? null,
    vardiya_saatleri: proje?.vardiya_saatleri ?? firma?.vardiya_saatleri ?? null,
    tum_vardiya_ayarlari: proje?.tum_vardiya_ayarlari ?? firma?.tum_vardiya_ayarlari ?? null,
    kaynak: projeAktif ? 'proje' : 'firma',
  }
}
