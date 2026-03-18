-- Lokasyon bazlı süreli görev altyapısı
ALTER TABLE lokasyonlar
  ADD COLUMN IF NOT EXISTS sureli_gorev_aktif boolean NOT NULL DEFAULT false;

ALTER TABLE gorevler
  ADD COLUMN IF NOT EXISTS baslatilma_tarihi timestamptz,
  ADD COLUMN IF NOT EXISTS baslatan_kullanici_id uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS tamamlanma_tarihi timestamptz,
  ADD COLUMN IF NOT EXISTS tamamlanma_suresi_saniye integer;

ALTER TABLE canli_gorevler
  ADD COLUMN IF NOT EXISTS baslatilma_tarihi timestamptz,
  ADD COLUMN IF NOT EXISTS baslatan_kullanici_id uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS tamamlanma_suresi_saniye integer;
