export type ReportKey = 'locations' | 'users' | 'live_tasks' | 'manual_tasks' | 'checklist_templates' | 'location_groups'
export type ReportFormat = 'excel' | 'pdf'

export type ReportColumn = {
  key: string
  label: string
  width?: number
}

export type ReportDefinition = {
  key: ReportKey
  title: string
  description: string
  columns: ReportColumn[]
  supportsDateRange?: boolean
}

export const REPORT_DEFINITIONS: ReportDefinition[] = [
  {
    key: 'locations',
    title: 'Lokasyon Raporu',
    description: 'Lokasyon hiyerarşisi, QR/NFC ve atama bilgilerini içerir.',
    columns: [
      { key: 'firma', label: 'Firma', width: 28 },
      { key: 'tanim', label: 'Lokasyon Adı', width: 26 },
      { key: 'parent_yolu', label: 'Üst Lokasyon Yolu', width: 34 },
      { key: 'seviye', label: 'Seviye', width: 10 },
      { key: 'aciklama', label: 'Açıklama', width: 28 },
      { key: 'aktif', label: 'Aktif', width: 10 },
      { key: 'qr_veri', label: 'QR Veri', width: 28 },
      { key: 'qr_id', label: 'QR ID', width: 22 },
      { key: 'nfc_token', label: 'NFC Token', width: 22 },
      { key: 'checklist_sablonu', label: 'Checklist Şablonu', width: 26 },
      { key: 'sureli_gorev_aktif', label: 'Süreli Görev Aktif', width: 18 },
      { key: 'atanan_kullanici', label: 'Atanan Kullanıcı', width: 24 },
      { key: 'kayit_tarihi', label: 'Kayıt Tarihi', width: 20 },
    ],
  },
  {
    key: 'users',
    title: 'Kullanıcılar Raporu',
    description: 'Kullanıcı, rol ve durum bilgisini içerir.',
    columns: [
      { key: 'firma', label: 'Firma', width: 28 },
      { key: 'isim_soyisim', label: 'Ad Soyad', width: 24 },
      { key: 'email', label: 'E-posta', width: 30 },
      { key: 'telefon', label: 'Telefon', width: 18 },
      { key: 'rol', label: 'Rol', width: 18 },
      { key: 'aktif', label: 'Aktif', width: 10 },
      { key: 'kayit_tarihi', label: 'Kayıt Tarihi', width: 20 },
    ],
  },
  {
    key: 'live_tasks',
    title: 'Frekansiyel Görevler Raporu',
    description: 'Canlı/frekansiyel görevlerin tüm yaşam döngüsünü içerir.',
    supportsDateRange: true,
    columns: [
      { key: 'firma', label: 'Firma', width: 28 },
      { key: 'tanim', label: 'Görev Tanımı', width: 28 },
      { key: 'lokasyon', label: 'Lokasyon', width: 26 },
      { key: 'atanan_kullanici', label: 'Atanan Kullanıcı', width: 24 },
      { key: 'durum', label: 'Durum', width: 18 },
      { key: 'aktif_olma_tarihi', label: 'Aktif Olma Tarihi', width: 20 },
      { key: 'olusturma_tarihi', label: 'Oluşturma Tarihi', width: 20 },
      { key: 'baslatilma_tarihi', label: 'Başlatılma Tarihi', width: 20 },
      { key: 'tamamlanma_tarihi', label: 'Tamamlanma Tarihi', width: 20 },
      { key: 'tamamlanma_suresi', label: 'Tamamlanma Süresi', width: 18 },
      { key: 'baslatan_kullanici', label: 'Başlatan Kullanıcı', width: 24 },
      { key: 'tamamlayan_kullanici', label: 'Tamamlayan Kullanıcı', width: 24 },
      { key: 'islemi_yapan', label: 'İşlemi Yapan', width: 24 },
    ],
  },
  {
    key: 'manual_tasks',
    title: 'Manuel Görevler Raporu',
    description: 'Spesifik/manüel görevlerin atama ve tamamlama bilgisini içerir.',
    supportsDateRange: true,
    columns: [
      { key: 'firma', label: 'Firma', width: 28 },
      { key: 'tanim', label: 'Görev Tanımı', width: 28 },
      { key: 'lokasyon', label: 'Lokasyon', width: 26 },
      { key: 'atanan_kullanici', label: 'Atanan Kullanıcı', width: 24 },
      { key: 'durum', label: 'Durum', width: 16 },
      { key: 'olusturan', label: 'Oluşturan', width: 24 },
      { key: 'olusturma_tarihi', label: 'Oluşturma Tarihi', width: 20 },
      { key: 'baslatilma_tarihi', label: 'Başlatılma Tarihi', width: 20 },
      { key: 'tamamlanma_tarihi', label: 'Tamamlanma Tarihi', width: 20 },
      { key: 'tamamlanma_suresi', label: 'Tamamlanma Süresi', width: 18 },
      { key: 'islemi_yapan', label: 'İşlemi Yapan', width: 24 },
    ],
  },
  {
    key: 'checklist_templates',
    title: 'Checklist Şablonları Raporu',
    description: 'Şablon, versiyon ve kullanım sayısı bilgisini içerir.',
    columns: [
      { key: 'firma', label: 'Firma', width: 28 },
      { key: 'baslik', label: 'Başlık', width: 24 },
      { key: 'tanim', label: 'Tanım', width: 30 },
      { key: 'aktif', label: 'Aktif', width: 10 },
      { key: 'versiyon', label: 'Versiyon', width: 12 },
      { key: 'madde_sayisi', label: 'Madde Sayısı', width: 14 },
      { key: 'kullanim_sayisi', label: 'Kullanım Sayısı', width: 14 },
      { key: 'kayit_tarihi', label: 'Kayıt Tarihi', width: 20 },
      { key: 'guncelleme_tarihi', label: 'Güncelleme Tarihi', width: 20 },
    ],
  },

  {
    key: 'location_groups' as const,
    title: 'Lokasyon Grupları Raporu',
    description: 'Lokasyon grupları, bağlı lokasyonlar ve görev istatistiklerini içerir.',
    supportsDateRange: true,
    columns: [
      { key: 'grup_adi',        label: 'Grup Adı',          width: 24 },
      { key: 'ust_lokasyon',    label: 'Üst Lokasyon',      width: 28 },
      { key: 'lokasyon_sayisi', label: 'Lokasyon Sayısı',   width: 14 },
      { key: 'lokasyonlar',     label: 'Lokasyonlar',        width: 50 },
      { key: 'toplam_gorev',    label: 'Toplam Görev',      width: 14 },
      { key: 'tamamlanan',      label: 'Tamamlanan',         width: 14 },
      { key: 'basari_orani',    label: 'Başarı %',           width: 12 },
      { key: 'kayit_tarihi',    label: 'Kayıt Tarihi',      width: 20 },
    ],
  },
]

export function getReportDefinition(key: string | null | undefined) {
  return REPORT_DEFINITIONS.find((item) => item.key === key) ?? null
}
