import { createAdminClient } from '@/lib/supabase/server'

/**
 * Modül sistemi — UI'ın hangi üst-katmanına girileceğini belirleyen kavram.
 *
 * - `gys`        : ana sistem (Görev Yönetim Sistemi). Default modül.
 * - `oto_yikama` : Oto Yıkama özelliği (mevcut /sa/dashboard/oto-yikama/* taşındı).
 * - `fms`        : Facility Management System (gelecek).
 *
 * DB tarafında:
 * - Modülün firma için aktivasyonu: `firmalar.<modul>_aktif` boolean flag.
 *   GYS için flag yoktur — her firmada her zaman aktif.
 * - Kullanıcı yetkisi: `kullanici_grubu_yetkileri` tablosunda
 *   `(firma_id, rol, sayfa_kodu='_modul_giris', modul_kodu=<modul>)`
 *   kaydı varsa o rol o modüle giriş yapabilir.
 *   GYS için kayıt aranmaz — her rol default yetkili.
 *
 * SA (super_admin / alt_super_admin) her modülde yetkilidir, aktivasyon
 * flag'i de dikkate alınmaz (admin tarafında her zaman gösterilir).
 */

export type ModulKodu = 'gys' | 'oto_yikama' | 'fms'

export interface ModulBilgisi {
  kod: ModulKodu
  ad: string
  ikon: string       // mobil/web tarafı kendi icon set'ine map eder
  aktif: boolean     // firma için modül aktif mi
  yetkili: boolean   // bu kullanıcı modüle erişim yetkisine sahip mi
}

export interface YetkiliModullerResponse {
  moduller: ModulBilgisi[]   // sadece yetkili olunanlar (yetkili=false filtrelenir)
  tek_modul: boolean         // aktif+yetkili olan tek modül var mı
  tek_modul_kodu: ModulKodu | null
}

/** Sabit modül kataloğu — yeni modül eklenince buraya eklenir. */
const KATALOG: Array<{ kod: ModulKodu; ad: string; ikon: string; flagKolon: string | null }> = [
  { kod: 'gys',        ad: 'GYS',        ikon: 'shield',   flagKolon: null              },
  { kod: 'oto_yikama', ad: 'Oto Yıkama', ikon: 'car',      flagKolon: 'oto_yikama_aktif'},
  { kod: 'fms',        ad: 'FMS',        ikon: 'building', flagKolon: 'fms_aktif'       },
]

const MODUL_GIRIS_SAYFA_KODU = '_modul_giris'

/**
 * Kullanıcı için yetkili modülleri hesaplar.
 *
 * @param rol      users.rol değeri
 * @param firmaId  Kullanıcının firma_id'si (SA için null gelebilir → tüm modüller aktif sayılır)
 */
export async function getYetkiliModuller(
  rol: string,
  firmaId: string | null,
): Promise<YetkiliModullerResponse> {
  const isSA = rol === 'super_admin' || rol === 'alt_super_admin'
  const admin = createAdminClient()

  // 1. Firmanın aktif modüllerini öğren (SA için her şey aktif)
  let firmaFlags: Record<string, boolean> = {}
  if (!isSA && firmaId) {
    const { data } = await admin
      .from('firmalar')
      .select('oto_yikama_aktif, fms_aktif')
      .eq('id', firmaId)
      .maybeSingle()
    firmaFlags = data ?? {}
  }

  // 2. Bu rol için modül giriş yetkilerini topla (SA için skip)
  let yetkiliModulKodlari = new Set<string>()
  if (!isSA && firmaId) {
    // Firma bazlı + global kayıtları paralel çek, modul_kodu set'i oluştur
    const [firmaRows, globalRows] = await Promise.all([
      admin
        .from('kullanici_grubu_yetkileri')
        .select('modul_kodu, gorebilir')
        .eq('firma_id', firmaId)
        .eq('rol', rol)
        .eq('sayfa_kodu', MODUL_GIRIS_SAYFA_KODU),
      admin
        .from('kullanici_grubu_yetkileri')
        .select('modul_kodu, gorebilir')
        .is('firma_id', null)
        .eq('rol', rol)
        .eq('sayfa_kodu', MODUL_GIRIS_SAYFA_KODU),
    ])

    // Firma bazlı kayıt global'i ezer; iki listeyi modul_kodu → gorebilir map'ine indir
    const yetkiMap = new Map<string, boolean>()
    for (const r of globalRows.data ?? []) yetkiMap.set(r.modul_kodu, r.gorebilir === true)
    for (const r of firmaRows.data ?? [])  yetkiMap.set(r.modul_kodu, r.gorebilir === true)

    yetkiliModulKodlari = new Set([...yetkiMap.entries()]
      .filter(([, gor]) => gor === true)
      .map(([k]) => k))
  }

  // 3. Katalog üzerinden modül listesini üret
  const moduller: ModulBilgisi[] = KATALOG.map(m => {
    const aktif = isSA
      ? true
      : (m.flagKolon === null ? true : (firmaFlags as any)[m.flagKolon] === true)

    const yetkili = isSA
      ? true
      : (m.kod === 'gys' ? true : yetkiliModulKodlari.has(m.kod))

    return { kod: m.kod, ad: m.ad, ikon: m.ikon, aktif, yetkili }
  })

  // 4. Yanıtı şekillendir — yetkisi olmayan modülleri filtrele
  const yetkiliListe = moduller.filter(m => m.yetkili)
  const aktifYetkili = yetkiliListe.filter(m => m.aktif)
  const tek_modul = aktifYetkili.length === 1
  const tek_modul_kodu = tek_modul ? aktifYetkili[0].kod : null

  return {
    moduller: yetkiliListe,
    tek_modul,
    tek_modul_kodu,
  }
}
