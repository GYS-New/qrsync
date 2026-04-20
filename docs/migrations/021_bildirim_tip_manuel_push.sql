-- ─────────────────────────────────────────────────────────────────────────
-- 021: bildirim_tip ENUM'UNA 'manuel_push' EKLE
--   Manuel push bildirimleri bildirimler tablosuna 'manuel_push' tipiyle
--   kaydedilir — mobil uygulamanın Bildirimler sayfasında diğer bildirimlerle
--   birlikte listelenebilsin.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TYPE bildirim_tip ADD VALUE IF NOT EXISTS 'manuel_push';
