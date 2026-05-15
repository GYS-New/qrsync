-- Migration 058: Oto Yıkama lokasyon işaretleyicisi
--
-- İhtiyaç: /sa/dashboard/oto-yikama/gorev-olustur sayfasında lokasyon
-- dropdown'u firmanın TÜM aktif alt lokasyonlarını gösteriyordu (örn.
-- MONTAJ > 1.BÖLGE de listeleniyordu). Sadece "Oto Yıkama" amacıyla
-- işaretlenmiş üst lokasyonların alt lokasyonları görünmeli.
--
-- Tasarım: Üst lokasyon (parent_id IS NULL) seviyesinde flag. true ise
-- altları otomatik dahil olur — alt lokasyon başına ayar gerekmez.

ALTER TABLE lokasyonlar
  ADD COLUMN IF NOT EXISTS oto_yikama_lokasyon boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS lokasyonlar_oto_yikama_idx
  ON lokasyonlar(firma_id, oto_yikama_lokasyon)
  WHERE oto_yikama_lokasyon = true;

COMMENT ON COLUMN lokasyonlar.oto_yikama_lokasyon IS
  'true ise bu üst lokasyon (parent_id IS NULL) Oto Yıkama modülünde görev oluşturulabilir lokasyon olarak listelenir. Alt lokasyonları otomatik dahil olur.';

-- Mevcut "%YIKAMA%" üst lokasyonlarını otomatik işaretle (data backfill).
-- SA, sonradan manuel olarak değiştirebilir.
UPDATE lokasyonlar
SET oto_yikama_lokasyon = true
WHERE parent_id IS NULL
  AND tanim ILIKE '%YIKAMA%';
