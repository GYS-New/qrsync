-- Migration 059: Oto Yıkama metadata — ekstra (planlanmamış) yıkama flag'i
--
-- İhtiyaç: Mobilden personel "Ekstra Yıkama" akışıyla planlanmamış araç
-- yıkayabilmeli. Bu kayıtlar rapor/günlük tabloda planlı yıkamalardan
-- ayırt edilebilmeli.

ALTER TABLE oto_yikama_gorev_metadata
  ADD COLUMN IF NOT EXISTS ekstra boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS oto_yikama_metadata_ekstra_idx
  ON oto_yikama_gorev_metadata(ekstra)
  WHERE ekstra = true;

COMMENT ON COLUMN oto_yikama_gorev_metadata.ekstra IS
  'true ise planlanmamış (ekstra) yıkama. Mobilden /api/oto-yikama/extra-baslat ile açılır.';
