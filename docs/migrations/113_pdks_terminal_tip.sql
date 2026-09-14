-- Migration 113: pdks_terminalleri.tip kolonu — cift QR (GIRIS/CIKIS) desteği
--
-- SORUN:
--   Migration 112'de PDKS tabletlerini TOGGLE varsayimiyla kurmustuk (ayni QR
--   acik kayit yoksa giris, varsa cikis). Ama mevcut mesai_qr_kodlari CIFT QR
--   modeliyle calisiyor (biri GIRIS tipi, digeri CIKIS tipi) ve Canakkale
--   projesi bunu aktif kullaniyor. Personel/amir aliskanligina uyumluluk sart.
--
-- COZUM:
--   Terminalin bir 'tip' alani olsun:
--     'GIRIS'  — sadece is basi tableti (girise koyulur, sadece giris acar)
--     'CIKIS'  — sadece is bitis tableti (cikisa koyulur, sadece cikis kapatir)
--     'TOGGLE' — tek tablet, acik kayit yoksa giris varsa cikis (TOGG icin)
--
--   Boylece Canakkale iki tablet koyar (GIRIS + CIKIS), TOGG bir tablet koyar
--   (TOGGLE) veya iki tablet koyar. Proje bazli esneklik.

ALTER TABLE public.pdks_terminalleri
  ADD COLUMN IF NOT EXISTS tip text NOT NULL DEFAULT 'TOGGLE'
    CHECK (tip IN ('GIRIS', 'CIKIS', 'TOGGLE'));

COMMENT ON COLUMN public.pdks_terminalleri.tip IS
  'Terminal tipi: GIRIS = sadece is basi tableti (Canakkale alışkanlığı), CIKIS = sadece is bitis tableti, TOGGLE = tek tablet acik kayit yoksa giris varsa cikis yapar.';
