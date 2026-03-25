import { createAdminClient } from '@/lib/supabase/server'

export type SayfaYetki = {
  gorebilir: boolean
  ekleyebilir: boolean
  duzenleyebilir: boolean
  silebilir: boolean
}

/**
 * Verilen rol + firma için belirtilen sayfanın gorebilir yetkisini kontrol eder.
 * Öncelik sırası: firma bazlı kayıt → global kayıt (firma_id IS NULL) → true (açık)
 * super_admin her zaman true döner.
 */
export async function sayfaGorebilirMi(
  rol: string,
  sayfaKodu: string,
  firmaId?: string | null,
): Promise<boolean> {
  const y = await sayfaYetkileri(rol, sayfaKodu, firmaId)
  return y.gorebilir
}

/**
 * Verilen rol + firma için 4 yetki boyutunu döner (gorebilir, ekleyebilir, duzenleyebilir, silebilir).
 * Öncelik sırası: firma bazlı → global → varsayılan (SA hariç her şey true)
 */
export async function sayfaYetkileri(
  rol: string,
  sayfaKodu: string,
  firmaId?: string | null,
): Promise<SayfaYetki> {
  const ACIK: SayfaYetki = { gorebilir: true, ekleyebilir: true, duzenleyebilir: true, silebilir: true }

  // SA her zaman tam yetkili
  if (rol === 'super_admin' || rol === 'alt_super_admin') return ACIK

  const admin = createAdminClient()

  // 1. Firma bazlı kayıt
  if (firmaId) {
    const { data } = await admin
      .from('kullanici_grubu_yetkileri')
      .select('gorebilir,ekleyebilir,duzenleyebilir,silebilir')
      .eq('firma_id', firmaId)
      .eq('rol', rol)
      .eq('sayfa_kodu', sayfaKodu)
      .maybeSingle()

    if (data) {
      return {
        gorebilir:      data.gorebilir      === true,
        ekleyebilir:    data.ekleyebilir    === true,
        duzenleyebilir: data.duzenleyebilir === true,
        silebilir:      data.silebilir      === true,
      }
    }
  }

  // 2. Global kayıt
  const { data: global } = await admin
    .from('kullanici_grubu_yetkileri')
    .select('gorebilir,ekleyebilir,duzenleyebilir,silebilir')
    .is('firma_id', null)
    .eq('rol', rol)
    .eq('sayfa_kodu', sayfaKodu)
    .maybeSingle()

  // 3. Kayıt yoksa açık
  if (!global) return ACIK

  return {
    gorebilir:      global.gorebilir      === true,
    ekleyebilir:    global.ekleyebilir    === true,
    duzenleyebilir: global.duzenleyebilir === true,
    silebilir:      global.silebilir      === true,
  }
}
