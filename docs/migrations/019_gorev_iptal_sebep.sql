-- ─────────────────────────────────────────────────────────────────────────
-- 019: GÖREV İPTAL SEBEBİ — manuel iptallerde kayıp nedeni saklanır
--   Mobil kullanıcı görevi manuel iptal edebilir, sebep yazılır.
--   Genel Rapor → "Kayıp Frekanslar" → KAYIP NEDENİ kolonunda gösterilir.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE canli_gorevler        ADD COLUMN IF NOT EXISTS iptal_sebep text NULL;
ALTER TABLE canli_gorevler_arsiv  ADD COLUMN IF NOT EXISTS iptal_sebep text NULL;
ALTER TABLE gorevler              ADD COLUMN IF NOT EXISTS iptal_sebep text NULL;
ALTER TABLE gorevler_arsiv        ADD COLUMN IF NOT EXISTS iptal_sebep text NULL;

COMMENT ON COLUMN canli_gorevler.iptal_sebep
  IS 'Manuel iptal sebebi (mobil/web tarafından yazılır). NULL = otomatik iptal (süre aşımı vs.)';
COMMENT ON COLUMN canli_gorevler_arsiv.iptal_sebep
  IS 'Manuel iptal sebebi — arşivlenmiş kayıt';
COMMENT ON COLUMN gorevler.iptal_sebep
  IS 'Manuel iptal sebebi (mobil/web tarafından yazılır). NULL = otomatik iptal';
COMMENT ON COLUMN gorevler_arsiv.iptal_sebep
  IS 'Manuel iptal sebebi — arşivlenmiş kayıt';
