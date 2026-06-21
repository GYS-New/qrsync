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

/**
 * Sabit modül kataloğu — yeni modül eklenince buraya eklenir.
 *
 * `implementasyonHazir`: false ise UI/sayfaları henüz mevcut değil; SA bile
 * "aktif" göremez (UI'da "Yakında" gözükür). Sayfaları hazırlanınca true yapılır.
 */
const KATALOG: Array<{ kod: ModulKodu; ad: string; ikon: string; flagKolon: string | null; implementasyonHazir: boolean }> = [
  { kod: 'gys',        ad: 'GYS',        ikon: 'shield',   flagKolon: null,               implementasyonHazir: true  },
  { kod: 'oto_yikama', ad: 'Oto Yıkama', ikon: 'car',      flagKolon: 'oto_yikama_aktif', implementasyonHazir: true  },
  { kod: 'fms',        ad: 'FMS',        ikon: 'building', flagKolon: 'fms_aktif',        implementasyonHazir: true  },
]

const MODUL_GIRIS_SAYFA_KODU = '_modul_giris'

/**
 * Kullanıcı için yetkili modülleri hesaplar.
 *
 * **Yetki kaynağı — modüle göre:**
 * - **GYS**: her zaman yetkili (default modül)
 * - **Oto Yıkama**: kullanıcının `users.ust_lokasyon_id` VEYA
 *   `kullanici_lokasyon_yetkileri.ust_lokasyon_id` aracılığıyla bağlı olduğu
 *   üst lokasyonlardan en az birinin `lokasyonlar.oto_yikama_lokasyon=true`
 *   olması yeterli. Mobil yıkama akışıyla aynı kaynak — tek source of truth.
 * - **FMS**: henüz implementasyon hazır değil, hiç kimse için yetkili değil.
 *
 * SA (super_admin / alt_super_admin) her modülde otomatik yetkilidir.
 *
 * @param rol      users.rol değeri
 * @param firmaId  Kullanıcının firma_id'si (SA için null gelebilir)
 * @param userId   users.id — Oto Yıkama yetki hesabı için zorunlu (SA hariç)
 */
export async function getYetkiliModuller(
  rol: string,
  firmaId: string | null,
  userId: string | null = null,
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

  // 2. Oto Yıkama yetkisi: lokasyon ataması bazlı (mobil ile tek source of truth)
  //    users.ust_lokasyon_id VEYA kullanici_lokasyon_yetkileri → bunlardan biri
  //    oto_yikama_lokasyon=true bir üst lokasyona işaret etmeli.
  let otoYikamaYetkili = false
  if (!isSA && userId) {
    const { data: u } = await admin
      .from('users')
      .select('ust_lokasyon_id')
      .eq('id', userId)
      .maybeSingle()
    const adayUstIds = new Set<string>()
    if (u?.ust_lokasyon_id) adayUstIds.add(u.ust_lokasyon_id)
    const { data: yetkiler } = await admin
      .from('kullanici_lokasyon_yetkileri')
      .select('ust_lokasyon_id')
      .eq('user_id', userId)
    for (const y of (yetkiler ?? [])) {
      if (y.ust_lokasyon_id) adayUstIds.add(y.ust_lokasyon_id)
    }
    if (adayUstIds.size > 0) {
      const { data: loks } = await admin
        .from('lokasyonlar')
        .select('id')
        .in('id', [...adayUstIds])
        .eq('oto_yikama_lokasyon', true)
        .eq('aktif', true)
      otoYikamaYetkili = (loks ?? []).length > 0
    }
  }

  // 3. GYS + FMS yetkisi: kullanici_modul_yetkileri tablosundan kullanıcı-bazlı.
  //    Migration 091 ile rol-bazlı sistem yerini bu tabloya bıraktı.
  //    Backfill ATALIAN OYAK Renault için yapıldı; kayıt yoksa fallback:
  //      - GYS: default true   (yeni kullanıcı eklenirse açık)
  //      - FMS: default false  (yetki açıkça verilmeli)
  let gysYetkili = true
  let fmsYetkili = false
  if (!isSA && userId) {
    const { data: modulYetkileri } = await admin
      .from('kullanici_modul_yetkileri')
      .select('modul_kodu, gorebilir')
      .eq('user_id', userId)
      .in('modul_kodu', ['gys', 'fms'])
    for (const r of (modulYetkileri ?? [])) {
      if (r.modul_kodu === 'gys') gysYetkili = r.gorebilir === true
      if (r.modul_kodu === 'fms') fmsYetkili = r.gorebilir === true
    }
  }

  // 4. Katalog üzerinden modül listesini üret
  const moduller: ModulBilgisi[] = KATALOG.map(m => {
    // Implementasyon hazır değilse hiç kimse için (SA dahil) aktif değil → UI'da "Yakında"
    const aktif = !m.implementasyonHazir
      ? false
      : isSA
        ? true
        : (m.flagKolon === null ? true : (firmaFlags as any)[m.flagKolon] === true)

    let yetkili: boolean
    if (isSA) yetkili = true
    else if (m.kod === 'gys') yetkili = gysYetkili
    else if (m.kod === 'oto_yikama') yetkili = otoYikamaYetkili
    else if (m.kod === 'fms') yetkili = fmsYetkili
    else yetkili = false

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
