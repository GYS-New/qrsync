-- ─────────────────────────────────────────────────────────────────────────
-- 027: device_tokens.app_version KOLONU
--   Mobil uygulama sürümünü her register ve bildirim-izni çağrısında
--   body.app_version ile alıp DB'ye yazmak için. Eski sürüm cihazlarını
--   tespit etmek kolaylaşır.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE device_tokens ADD COLUMN IF NOT EXISTS app_version text NULL;
COMMENT ON COLUMN device_tokens.app_version
  IS 'Mobil uygulama sürümü (register veya bildirim-izni çağrısında iletilir). Eski sürüm cihazlarını tespit için kullanılır.';
