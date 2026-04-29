-- ─────────────────────────────────────────────────────────────────────────
-- 030: device_tokens — son IP ve User-Agent (eşleşmiş cihaz tespiti için)
--
-- Amaç: Müşteri değerlendirmesi yapılırken, gönderen cihazın
-- "VT'de eşleşmiş" (mobile app ile paired) bir çalışan cihazı olup
-- olmadığını tespit edip block etmek.
--
-- Risk: SIFIR — sadece NULLABLE kolon ekler, mevcut satırları etkilemez.
-- Geri alma: ALTER TABLE device_tokens DROP COLUMN son_ip, DROP COLUMN son_user_agent;
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE device_tokens
  ADD COLUMN IF NOT EXISTS son_ip text,
  ADD COLUMN IF NOT EXISTS son_user_agent text;

COMMENT ON COLUMN device_tokens.son_ip IS
  'Cihazın son aktivite anındaki IP adresi (x-forwarded-for / x-real-ip). Müşteri değerlendirmesi block kontrolü için kullanılır.';

COMMENT ON COLUMN device_tokens.son_user_agent IS
  'Cihazın son aktivite anındaki User-Agent string (truncated 500 chars). İleride opsiyonel cross-check için.';

-- Block sorgusu hızlansın (firma_id + son_ip + aktif + son_kullanim >= X)
CREATE INDEX IF NOT EXISTS idx_device_tokens_firma_son_ip
  ON device_tokens (firma_id, son_ip)
  WHERE aktif = true AND son_ip IS NOT NULL;
