-- Migration 083: users.varsayilan_yikama_istasyon_id
--
-- Talep: Mobile ekip (2026-06-19). Yıkama personeli için mobile'da
-- "Yıkamayı Başlat" tek-tıkla çalışsın diye varsayılan istasyon
-- backend tarafında tutuluyor. /api/app/me cevabına eklenecek; mobile
-- bu ID'yi yıkama başlatma çağrısına lokasyon_id olarak gönderir.
--
-- Sahada çoğu personel tek istasyonda çalıştığı için varsayılan
-- yeterli; ileride çoklu istasyon kullananlar için mobile Ayarlar
-- ekranında değiştirme eklenir. SA Panel atama UI'sı ayrı bir iş.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS varsayilan_yikama_istasyon_id uuid
    REFERENCES public.lokasyonlar(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.users.varsayilan_yikama_istasyon_id IS
  'Yıkama personelinin varsayılan istasyon (alt lokasyon) ID''si. Mobile /me cevabında dönen, ekstra yıkama başlatmada lokasyon_id olarak kullanılan değer. Personel başka istasyonda da çalışabilir; sadece varsayılan.';
