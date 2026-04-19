-- ─────────────────────────────────────────────────────────────────────────
-- 016: BİLDİRİM İZNİ TAKİBİ
--   Mobil uygulama açılışında cihazın bildirim iznini rapor edecek.
--   Backend bu değeri device_tokens tablosunda tutar.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE device_tokens
  ADD COLUMN IF NOT EXISTS bildirim_izni boolean,
  ADD COLUMN IF NOT EXISTS bildirim_izni_son_kontrol timestamptz;

COMMENT ON COLUMN device_tokens.bildirim_izni IS
  'Cihazın bildirim izni durumu. true=açık, false=kapalı, NULL=henüz raporlamadı.';
COMMENT ON COLUMN device_tokens.bildirim_izni_son_kontrol IS
  'Son durum raporlama zamanı. Bu tarih çok eskiyse değer güvenilir değil.';

CREATE INDEX IF NOT EXISTS idx_device_tokens_bildirim_izni
  ON device_tokens(bildirim_izni)
  WHERE bildirim_izni IS NOT NULL;
