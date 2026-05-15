-- Migration 057: Görev kuralı bazlı ömür override
--
-- İhtiyaç: Bazı kuralların farklı süre kullanması (ör. Görev 1 ömür 20 saat,
-- Görev 2 ACIK→BEKLEMEDE 24 saat, BEKLEMEDE→ZAMANI_GECMIS 1 saat).
-- Mevcut firma/proje seviyesinde tek ayar yetersiz.
--
-- Tasarım: Override hiyerarşisi (yukarıdan aşağı, ilk dolu olan kazanır)
--   1. canli_gorevler.acik_bekleme_saat (snapshot, kuraldan kopyalanır)
--   2. gorev_kurallari.acik_bekleme_saat (kural seviyesi override)
--   3. projeler.acik_bekleme_saat (proje seviyesi)
--   4. firmalar.acik_bekleme_saat (firma seviyesi)
--   5. DEFAULT 8 (kod sabit, get_efektif_durum_sure içinde)
--
-- Tam fonksiyon kodu için Supabase migration history'ye bakın.

ALTER TABLE gorev_kurallari
  ADD COLUMN IF NOT EXISTS acik_bekleme_saat int,
  ADD COLUMN IF NOT EXISTS bekleme_gecmis_saat int;

ALTER TABLE gorev_kurallari
  ADD CONSTRAINT gorev_kurallari_acik_bekleme_saat_chk
    CHECK (acik_bekleme_saat IS NULL OR (acik_bekleme_saat >= 1 AND acik_bekleme_saat <= 240));
ALTER TABLE gorev_kurallari
  ADD CONSTRAINT gorev_kurallari_bekleme_gecmis_saat_chk
    CHECK (bekleme_gecmis_saat IS NULL OR (bekleme_gecmis_saat >= 1 AND bekleme_gecmis_saat <= 240));

ALTER TABLE canli_gorevler
  ADD COLUMN IF NOT EXISTS acik_bekleme_saat int,
  ADD COLUMN IF NOT EXISTS bekleme_gecmis_saat int;

ALTER TABLE canli_gorevler_arsiv
  ADD COLUMN IF NOT EXISTS acik_bekleme_saat int,
  ADD COLUMN IF NOT EXISTS bekleme_gecmis_saat int;

COMMENT ON COLUMN gorev_kurallari.acik_bekleme_saat IS
  'Bu kuraldan üretilen görevler için ACIK→BEKLEMEDE süresi (saat). NULL ise proje/firma/default.';
COMMENT ON COLUMN gorev_kurallari.bekleme_gecmis_saat IS
  'Bu kuraldan üretilen görevler için BEKLEMEDE→ZAMANI_GECMIS süresi (saat). NULL ise proje/firma/default.';
COMMENT ON COLUMN canli_gorevler.acik_bekleme_saat IS
  'Bu görev için ACIK→BEKLEMEDE özel süresi. Üretim sırasında kuraldan kopyalanır. NULL ise efektif süre.';
COMMENT ON COLUMN canli_gorevler.bekleme_gecmis_saat IS
  'Bu görev için BEKLEMEDE→ZAMANI_GECMIS özel süresi. Üretim sırasında kuraldan kopyalanır. NULL ise efektif süre.';

-- gece_gorev_uret() ve gece_tam_dongu() fonksiyonları güncellendi:
-- - gece_gorev_uret: INSERT'lere acik_bekleme_saat, bekleme_gecmis_saat eklendi (kuraldan snapshot)
-- - gece_tam_dongu: ACIK→BEKLEMEDE ve BEKLEMEDE→ZAMANI_GECMIS UPDATE'lerine COALESCE
--   ile görev override önceliği eklendi.
-- (Tam kod Supabase migration history'de.)
