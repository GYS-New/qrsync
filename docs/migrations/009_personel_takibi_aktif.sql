-- Migration 009: Personel Takibi Özellik Anahtarı
-- firmalar ve projeler tablosuna personel_takibi_aktif kolonu eklenir.
-- Varsayılan FALSE: mevcut firmalar/projeler etkilenmez, sadece açık olanlar takip eder.

ALTER TABLE firmalar
  ADD COLUMN IF NOT EXISTS personel_takibi_aktif BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE projeler
  ADD COLUMN IF NOT EXISTS personel_takibi_aktif BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN firmalar.personel_takibi_aktif IS 'Personel iş başı/bitimi QR takip sistemi bu firmada aktif mi?';
COMMENT ON COLUMN projeler.personel_takibi_aktif IS 'Personel iş başı/bitimi QR takip sistemi bu projede aktif mi?';

-- Mevcut firmalar için mevcut durum FALSE olarak kalır (opt-in yapı).
-- Aktif etmek isteyen SA: firma düzenle veya proje düzenle ekranından açar.
