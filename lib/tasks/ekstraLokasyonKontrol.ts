import type { SupabaseClient } from '@supabase/supabase-js'

const ESIK_DK = 5

/**
 * Aynı kullanıcı + lokasyon kombinasyonunda son {ESIK_DK} dakika içinde
 * başlatılmış/tamamlanmış ekstra (kural_id IS NULL) görev var mı?
 *
 * Mükerrer kayıt önleme — kullanıcı aynı QR'ı arka arkaya okutarak çift
 * gerekçe kaydedemesin. Spec madde 6: "Aynı kullanıcı 5 dakika içinde
 * aynı lokasyonda 2 ekstra başlatamasın".
 *
 * Returns: hata mesajı (string) varsa engelleme gerek, null = serbest.
 */
export async function ekstraMukerrer5dkKontrol(
  admin: SupabaseClient,
  userId: string,
  lokasyonId: string,
): Promise<string | null> {
  const esikIso = new Date(Date.now() - ESIK_DK * 60 * 1000).toISOString()
  const { data } = await admin
    .from('canli_gorevler')
    .select('id, durum, baslatilma_tarihi')
    .eq('lokasyon_id', lokasyonId)
    .eq('baslatan_kullanici_id', userId)
    .is('kural_id', null)
    .gte('baslatilma_tarihi', esikIso)
    .limit(1)
  if (data && data.length > 0) {
    return `Bu lokasyonda son ${ESIK_DK} dakika içinde ekstra görev başlattınız. Lütfen biraz bekleyin.`
  }
  return null
}
