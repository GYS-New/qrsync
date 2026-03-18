export type DashboardBlokTuru =
  | 'canli_islemler'
  
  | 'canli_akis_izleme'
  | 'aktivite_grafigi'
  | 'frekansiyel_gorev_analizi'
  | 'lokasyon_gorev_analizi'
  
  | 'son_gorevler'
  | 'aktif_kullanicilar'
  | 'gunluk_performans'
  | 'personel_basari_analizi'

export const DASHBOARD_BLOK_LABEL: Record<DashboardBlokTuru, string> = {
  canli_islemler: 'Frekansiyel Görevler',
  
  canli_akis_izleme: 'Frekansiyel Akış İzleme',
  aktivite_grafigi: 'Aktivite Grafiği',
  frekansiyel_gorev_analizi: 'Frekansiyel Görev Analizi',
  lokasyon_gorev_analizi: 'Lokasyon Görev Analizi',
  
  son_gorevler: 'Son Görevler',
  aktif_kullanicilar: 'Aktif Kullanıcılar',
  gunluk_performans: 'Günlük Performans',
  personel_basari_analizi: 'Personel Başarı Analizi',
}

export const DEFAULT_DASHBOARD_BLOKLARI: Array<{ blok_turu: DashboardBlokTuru; aktif: boolean; sira: number; ayarlar?: any }> = [
  { blok_turu: 'canli_islemler', aktif: true, sira: 1, ayarlar: {} },
  
  { blok_turu: 'canli_akis_izleme', aktif: true, sira: 3, ayarlar: { layout: 'big' } },
  { blok_turu: 'aktif_kullanicilar', aktif: true, sira: 4, ayarlar: { limit: 6, layout: 'small' } },
  { blok_turu: 'gunluk_performans', aktif: true, sira: 5, ayarlar: { layout: 'small' } },
  { blok_turu: 'lokasyon_gorev_analizi', aktif: true, sira: 6, ayarlar: { layout: 'small' } },
]
