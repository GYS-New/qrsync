/**
 * Görev terminal durum geçişi için payload builder.
 *
 * Her terminal duruma (TAMAMLANDI / ZAMANINDA_YAPILAMAYAN / IPTAL / KAPATILDI)
 * geçiş yapıldığında `son_tamamlama_kanali` yazılması ZORUNLUDUR. Kanal
 * parametresi bu tip sistemi üzerinden zorunlu kılınır; kod yazarının
 * unutma ihtimali ortadan kalkar.
 *
 * İstisna — sistem kaynaklı, kullanıcı eylemi olmayan terminal geçişler
 * (örn. BEKLEMEDE → ZAMANI_GECMIS, syncLiveTaskStatuses) bu helper'ı
 * kullanmaz; onlarda kanal NULL kalır (hiç başlamamış/hiç dokunulmamış
 * görev = iz bırakma).
 *
 * Kanal politikası:
 *   WEB    — web admin paneli (completeTask vs.)
 *   QR     — web session üzerinden QR okutma
 *   NFC    — web session üzerinden NFC okutma
 *   MOBIL  — mobil uygulama online eylemi
 *            (ayrıca SIM, personel-destek ve max-sure-kontrol cron'ları —
 *             doğal görünme şartı gereği bunlar da MOBIL yazar)
 *   OFFLINE— mobil uygulama çevrimdışı senkron
 */

export type Kanal = 'WEB' | 'QR' | 'NFC' | 'MOBIL' | 'OFFLINE'
export type TerminalDurum =
  | 'TAMAMLANDI'
  | 'ZAMANINDA_YAPILAMAYAN'
  | 'IPTAL'
  | 'KAPATILDI'

export type DurumPayloadOpts = {
  /** ISO timestamp. Verilmezse şimdi. Aynı geçişte tamamlanma_tarihi vs.
   *  milisaniye farkı olmasın diye caller'a override hakkı verilir. */
  at?: string
  /** IPTAL için sebep — sadece durum=IPTAL ise payload'a yazılır. */
  iptal_sebep?: string
  /** Ek kolonlar (baslatilma_tarihi, tamamlanma_tarihi, islemi_yapan_id vs.) */
  ek?: Record<string, any>
}

/**
 * Görev tablolarına (gorevler / canli_gorevler) UPDATE payload'ı üretir.
 * Kanal ve durum_degisim_tarihi garanti altındadır.
 */
export function gorevDurumPayload(
  yeniDurum: TerminalDurum,
  kanal: Kanal,
  opts?: DurumPayloadOpts
): Record<string, any> {
  const nowIso = opts?.at ?? new Date().toISOString()
  const payload: Record<string, any> = {
    durum: yeniDurum,
    durum_degisim_tarihi: nowIso,
    son_tamamlama_kanali: kanal,
  }
  if (yeniDurum === 'IPTAL' && opts?.iptal_sebep) {
    payload.iptal_sebep = opts.iptal_sebep
  }
  if (opts?.ek) {
    Object.assign(payload, opts.ek)
  }
  return payload
}
