-- Migration 047: Oto Yıkama modülünün firma bazında aç/kapat flag'i
-- Varsayılan FALSE — modül opt-in. SA, firma detay sayfasından açar.
-- Mevcut diğer *_aktif kolonlarıyla aynı pattern (005, 009).

ALTER TABLE firmalar
  ADD COLUMN IF NOT EXISTS oto_yikama_aktif BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN firmalar.oto_yikama_aktif
  IS 'Oto Yıkama modülü açık mı? Sidebar menüsü, /oto-yikama sayfaları ve /api/oto-yikama endpoint''leri bu flag''e bağlıdır.';
