import { createAdminClient } from '@/lib/supabase/server'

/**
 * Audit log helper — kritik işlemleri DB'ye kaydeder.
 * Hata fırlatmaz, silent fail (log başarısız olsa bile ana işlem devam etsin).
 *
 * Kullanım:
 *   await auditLog({
 *     tip: 'kullanici_sil', tablo: 'users',
 *     kullanici_id: me.id, firma_id: me.firma_id,
 *     satir_sayisi: 1, detay: { silinen_id: userId, silinen_isim: 'XX' }
 *   })
 */

export type AuditLogTipi =
  | 'kullanici_ekle' | 'kullanici_guncelle' | 'kullanici_sil'
  | 'kullanici_aktif_pasif' | 'kullanici_sifre_degis'
  | 'proje_ekle' | 'proje_guncelle' | 'proje_sil'
  | 'lokasyon_sil' | 'lokasyon_guncelle'
  | 'gorev_sil' | 'gorev_toplu_sil' | 'gorev_toplu_durum_degis'
  | 'canli_gorev_sil' | 'canli_gorev_toplu_durum_degis'
  | 'ayar_degis_firma' | 'ayar_degis_proje'
  | 'login_basarili' | 'login_basarisiz'
  | 'yetki_reddedildi'
  | 'manuel_yetim_temizlik'
  | 'arsivle' | 'butunluk_kontrol' | 'manuel_butunluk_kontrol'
  | 'checklist_sablon_sil' | 'kural_sil'
  | 'firma_sil' | 'firma_guncelle'
  | string  // esnek

interface AuditLogInput {
  tip: AuditLogTipi
  tablo: string
  satir_sayisi?: number
  basarili?: boolean
  hata_mesaji?: string | null
  firma_id?: string | null
  proje_id?: string | null
  kullanici_id?: string | null
  detay?: any
}

export async function auditLog(input: AuditLogInput): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('audit_log').insert({
      tip: input.tip,
      tablo: input.tablo,
      satir_sayisi: input.satir_sayisi ?? 1,
      basarili: input.basarili ?? true,
      hata_mesaji: input.hata_mesaji ?? null,
      firma_id: input.firma_id ?? null,
      proje_id: input.proje_id ?? null,
      kullanici_id: input.kullanici_id ?? null,
      detay: input.detay ?? null,
    })
  } catch (e) {
    // silent — audit başarısız olsa bile ana akış devam etmeli
    console.error('[auditLog] başarısız:', e)
  }
}

/** Başarılı işlem logla — shortcut */
export async function auditOk(tip: AuditLogTipi, ctx: Omit<AuditLogInput, 'tip' | 'basarili'>) {
  return auditLog({ ...ctx, tip, basarili: true })
}

/** Başarısız işlem logla — shortcut */
export async function auditFail(tip: AuditLogTipi, hata: string, ctx: Omit<AuditLogInput, 'tip' | 'basarili' | 'hata_mesaji'>) {
  return auditLog({ ...ctx, tip, basarili: false, hata_mesaji: hata })
}
