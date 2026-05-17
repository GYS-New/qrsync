-- Migration 062: oto_yikama_gorev_metadata — km + foto_oncesi/sonrasi + notlar
--
-- İhtiyaç: Mobil yıkama personeli yıkama sırasında KM, öncesi/sonrası foto
-- ve notlar girer. Bu veriler metadata'da tutulur.
--
-- Geriye uyumlu: tüm yeni kolonlar nullable, mevcut satırlar etkilenmez.

ALTER TABLE oto_yikama_gorev_metadata
  ADD COLUMN IF NOT EXISTS km int,
  ADD COLUMN IF NOT EXISTS foto_oncesi_url text,
  ADD COLUMN IF NOT EXISTS foto_sonrasi_url text,
  ADD COLUMN IF NOT EXISTS notlar text;

-- KM dolu kayıtlar için arac bazlı sorgu performansı (önceki KM lookup)
CREATE INDEX IF NOT EXISTS oto_yikama_metadata_arac_km_idx
  ON oto_yikama_gorev_metadata(arac_id, km)
  WHERE km IS NOT NULL;

COMMENT ON COLUMN oto_yikama_gorev_metadata.km IS
  'Yıkama anındaki araç KM bilgisi. Önceki yıkamadan düşükse uyarı verilir ama kabul edilir.';
COMMENT ON COLUMN oto_yikama_gorev_metadata.foto_oncesi_url IS
  'Yıkama öncesi araç fotoğrafı (Supabase Storage URL).';
COMMENT ON COLUMN oto_yikama_gorev_metadata.foto_sonrasi_url IS
  'Yıkama sonrası araç fotoğrafı (Supabase Storage URL).';
COMMENT ON COLUMN oto_yikama_gorev_metadata.notlar IS
  'Yıkama personeli ek notu (opsiyonel).';
