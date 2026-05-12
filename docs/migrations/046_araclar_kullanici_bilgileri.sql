-- Migration 046: araclar tablosuna kullanıcı bilgileri
-- plaka + kullanici_adi_soyadi + departman zorunlu (uygulama validation'ında)

ALTER TABLE araclar
  ADD COLUMN IF NOT EXISTS kullanici_adi_soyadi text,
  ADD COLUMN IF NOT EXISTS kullanici_telefon    text,
  ADD COLUMN IF NOT EXISTS kullanici_email      text;

COMMENT ON COLUMN araclar.kullanici_adi_soyadi IS 'Aracı kullanan kişi (zorunlu — uygulama validation)';
COMMENT ON COLUMN araclar.kullanici_telefon    IS 'Aracı kullanan kişinin telefonu (opsiyonel)';
COMMENT ON COLUMN araclar.kullanici_email      IS 'Aracı kullanan kişinin e-postası (opsiyonel)';
