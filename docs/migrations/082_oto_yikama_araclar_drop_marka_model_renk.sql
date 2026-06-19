-- Migration 082: araclar tablosundan marka, model, renk kolonları kaldırıldı.
--
-- Kullanıcı talebi (2026-06-19): Oto Yıkama akışında sadece PLAKA önemli;
-- araç marka/model/renk bilgisi raporlarda, listelerde, mobil cevaplarda
-- hiçbir yerde kullanılmıyor — gereksiz veri tutmayalım.
--
-- Etki: tüm UI/API kodu önce push edildi (kolonsuz çalışır halde),
-- ardından bu migration uygulanır. Mevcut veri kaybolur — geri alınamaz.

ALTER TABLE public.araclar DROP COLUMN IF EXISTS marka;
ALTER TABLE public.araclar DROP COLUMN IF EXISTS model;
ALTER TABLE public.araclar DROP COLUMN IF EXISTS renk;
