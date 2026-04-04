export type UserRole = 'super_admin' | 'alt_super_admin' | 'tenant_admin' | 'musteri' | 'tenant_user'

export type GorevDurum = 'ACIK' | 'ISLEMDE' | 'IPTAL' | 'TAMAMLANDI'

export type CanliGorevDurum =
  | 'HAZIR'
  | 'ACIK'
  | 'BEKLEMEDE'
  | 'IPTAL'
  | 'TAMAMLANDI'
  | 'ZAMANINDA_YAPILAMAYAN'
  | 'ZAMANI_GECMIS'
  | 'SILINDI'

// Frekans tabanlı görev kuralı — cron job bu tabloya göre canli_gorevler üretir
export interface GorevKurali {
  id: string
  firma_id: string
  lokasyon_id: string
  tanim: string
  aktif_gunler: number[]          // 0=Pazar,1=Pzt,...,6=Cmt (JS getDay() ile uyumlu)
  gunluk_frekans_sayisi: number
  aktif_olma_saati: string        // 'HH:MM'
  baslangic_tarihi: string        // 'YYYY-MM-DD'
  bitis_tarihi?: string | null
  atanan_kullanici_id?: string | null
  olusturan_id?: string | null
  kaynak: 'manuel' | 'import'
  aktif: boolean
  kayit_tarihi: string
  guncelleme_tarihi: string
  // Join alanları
  lokasyonlar?: Pick<Lokasyon, 'id' | 'tanim' | 'parent_id'>
  atanan_kullanici?: Pick<User, 'id' | 'isim_soyisim'>
}

export interface User {
  id: string
  isim_soyisim: string
  email: string
  telefon?: string
  adres?: string
  tc_no?: string
  rol: UserRole
  firma_id?: string
  profil_foto?: string
  last_seen_at?: string
  kayit_tarihi: string
  kayit_yapan_id?: string
  aktif: boolean
}

export interface Firma {
  id: string
  ticari_unvan: string
  firma_adi?: string
  adres: string
  vergi_dairesi: string
  vergi_no: string
  yetkili_isim: string
  yetkili_tel: string
  aciklama?: string
  logo_url?: string
  lisans_gecerlilik_tarihi?: string | null
  qr_sistemi_aktif?: boolean
  nfc_sistemi_aktif?: boolean
  kayit_tarihi: string
  kayit_yapan_id?: string
  aktif: boolean
  gorev_suresi_hedef_orani?: number
  arsiv_mesai_saat?: number
  arsiv_musteri_saat?: number
  arsiv_spesifik_saat?: number
  arsiv_frekansiyel_saat?: number
  spesifik_ceklist_aktif?: boolean
  spesifik_personel_atama_aktif?: boolean
  frekansiyel_personel_atama_aktif?: boolean
}

export interface Lokasyon {
  id: string
  firma_id: string
  parent_id?: string
  tanim: string
  aciklama?: string
  aktif: boolean
  qr_veri: string
  qr_id: string
  nfc_token?: string | null
  checklist_sablon_id?: string | null
  sureli_gorev_aktif?: boolean
  min_sure_dakika?: number | null
  max_sure_dakika?: number | null
  atanan_kullanici_id?: string
  kayit_tarihi: string
  kayit_yapan_id?: string
  children?: Lokasyon[]
}

export interface Gorev {
  id: string
  firma_id: string
  tanim: string
  lokasyon_id: string
  atanan_kullanici_id?: string | null
  durum: GorevDurum
  olusturan_id: string
  olusturma_tarihi: string
  durum_degisim_tarihi?: string
  baslatilma_tarihi?: string | null
  baslatan_kullanici_id?: string | null
  tamamlanma_tarihi?: string | null
  tamamlanma_suresi_saniye?: number | null
  islemi_yapan_id?: string
  lokasyon?: Lokasyon
  atanan_kullanici?: User
}

export interface CanliGorev {
  id: string
  firma_id: string
  tanim: string
  lokasyon_id: string
  atanan_kullanici_id?: string
  durum: CanliGorevDurum
  aktif_olma_tarihi: string
  olusturma_tarihi: string
  olusturan_id: string
  baslatilma_tarihi?: string | null
  baslatan_kullanici_id?: string | null
  tamamlanma_tarihi?: string | null
  tamamlayan_kullanici_id?: string
  islemi_yapan_id?: string
  tamamlanma_suresi_saniye?: number | null
  iptal_eden_id?: string
  iptal_tarihi?: string
  kural_id?: string | null         // gorev_kurallari.id — frekans kuralından üretildiyse dolu
  lokasyon?: Lokasyon
  atanan_kullanici?: User
}

export interface CanliGorevArsiv extends Omit<CanliGorev, 'lokasyon' | 'atanan_kullanici'> {
  arsiv_tarihi: string
  arsiv_nedeni?: string
}

export interface CanliGorevCeklist {
  id: string
  canli_gorev_id: string
  sira_no: number
  tanim: string
  zorunlu: boolean
}

export interface Bildirim {
  id: string
  alici_id: string
  baslik: string
  mesaj: string
  okundu: boolean
  tarih: string
  tip: 'gorev_atama' | 'durum_degisimi' | 'sistem'
}

export interface DashboardBlok {
  id: string
  user_id: string
  blok_turu:
    | 'canli_islemler'
    | 'aktif_gorevler'
    | 'canli_akis_izleme'
    | 'aktivite_grafigi'
    | 'son_gorevler'
    | 'aktif_kullanicilar'
    | 'gunluk_performans'
    | 'personel_basari_analizi'
  aktif: boolean
  sira: number
}

export interface Proje {
  id: string
  firma_id: string
  ad: string
  aciklama?: string
  renk?: string
  aktif: boolean
  kayit_tarihi: string
  kayit_yapan_id?: string
  gorev_suresi_hedef_orani?: number | null
  arsiv_mesai_saat?: number | null
  arsiv_musteri_saat?: number | null
  arsiv_spesifik_saat?: number | null
  arsiv_frekansiyel_saat?: number | null
  spesifik_ceklist_aktif?: boolean | null
  spesifik_personel_atama_aktif?: boolean | null
  frekansiyel_personel_atama_aktif?: boolean | null
}
