import { createAdminClient } from '@/lib/supabase/server'

/**
 * Verilen rol için belirtilen sayfanın gorebilir yetkisini kontrol eder.
 * super_admin her zaman true döner.
 * DB'de kayıt yoksa varsayılan olarak true döner (kısıtlama yoksa açık).
 */
export async function sayfaGorebilirMi(rol: string, sayfaKodu: string): Promise<boolean> {
  // SA her zaman görebilir
  if (rol === 'super_admin') return true

  const admin = createAdminClient()
  const { data } = await admin
    .from('kullanici_grubu_yetkileri')
    .select('gorebilir')
    .is('firma_id', null)
    .eq('rol', rol)
    .eq('sayfa_kodu', sayfaKodu)
    .single()

  // Kayıt yoksa açık (varsayılan erişim var)
  if (!data) return true

  return data.gorebilir === true
}
