-- Migration 107: Müşteri değerlendirme formuna GSM alanı (isteğe bağlı)
--
-- Değerlendirme sayfasında "Adınız" altına "GSM" (opsiyonel) inputu
-- eklenecek. Kullanıcı isteği (2026-07-14): dönüş için iletişim.
--
-- Aynı sütun aktif tabloya + arşive eklenir. Bir aktif kaydın arşive
-- taşınırken kolonu birebir taşıması gerekiyor (cron/RPC şu an INSERT
-- INTO ... SELECT * ile çalışıyor, aynı isim şart).

ALTER TABLE public.musteri_degerlendirmeleri
  ADD COLUMN IF NOT EXISTS gsm TEXT NULL;

ALTER TABLE public.musteri_degerlendirmeleri_arsiv
  ADD COLUMN IF NOT EXISTS gsm TEXT NULL;

COMMENT ON COLUMN public.musteri_degerlendirmeleri.gsm IS
  'Isteğe baglı GSM. Serbest text (min 10 rakam client kontrolü). Migration 107.';
