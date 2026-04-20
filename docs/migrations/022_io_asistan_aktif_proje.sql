-- ─────────────────────────────────────────────────────────────────────────
-- 022: İO ASİSTAN — PROJE BAZLI AÇIK/KAPALI
--   Proje ayarlarından İO Asistan modülü kapatılabilir.
--   Kapalı projede sidebar avatarı + modal gösterilmez.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE projeler ADD COLUMN IF NOT EXISTS io_asistan_aktif boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN projeler.io_asistan_aktif
  IS 'İO Asistan modülü proje için aktif mi? Kapalıysa sidebar avatarı ve modalı gösterilmez.';
