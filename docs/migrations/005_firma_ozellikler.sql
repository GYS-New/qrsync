-- Migration 005: Firma özellik alanları
-- qr_sablon_aktif    : Şablonlu QR Kart indirme özelliği
-- rapor_ozellestir_aktif : Rapor Özelleştir sayfasına erişim
-- Varsayılan: TRUE (mevcut firmalar etkilenmez)

ALTER TABLE firmalar
  ADD COLUMN IF NOT EXISTS qr_sablon_aktif        BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS rapor_ozellestir_aktif  BOOLEAN NOT NULL DEFAULT TRUE;

-- Mevcut tüm firmalar için varsayılan TRUE zaten uygulandı (DEFAULT TRUE)
-- Yeni firmalar ekleme sırasında form üzerinden seçilebilir

COMMENT ON COLUMN firmalar.qr_sablon_aktif        IS 'Şablona QR kart yerleştirip toplu PNG indirme özelliği';
COMMENT ON COLUMN firmalar.rapor_ozellestir_aktif  IS 'Rapor Merkezi > Rapor Özelleştir sayfasına erişim';
