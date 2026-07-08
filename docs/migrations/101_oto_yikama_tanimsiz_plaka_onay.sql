-- Migration 101: Oto Yıkama tanımsız plaka yıkama akışı — onay durumu +
-- firma bazlı amir ataması. Mobil ekip 1.0.34 spec cevabı (parent_id
-- 40a291f6-b400-4703-9326-b863c649165d) doğrultusunda.
--
-- Senaryo:
--   Personel plakayı OCR/manuel okur → sistem araclar'da bulmasa bile
--   yıkama başlar → tamamlandığında amir GYS'den onaylar veya reddeder.
--   Onaylanınca kayıt kalıcı + araclar'a plaka INSERT. Reddedilirse
--   gorevler + metadata HARD DELETE (araclar'a hiç girilmemişti).
--
-- Ek yapı (endpoint tarafında ele alınır):
--   • POST /api/app/oto-yikama/tanimsiz-baslat — mobil
--   • GET  /api/oto-yikama/onay-bekleyen        — amir listesi
--   • PATCH /api/oto-yikama/onay-bekleyen/[id]   — onayla/düzenle/reddet

-- ─────────────────────────────────────────────────────────────────────
-- 1) oto_yikama_gorev_metadata.onay_durumu
-- ─────────────────────────────────────────────────────────────────────
-- Değerler:
--   'ONAYSIZ'       → default; kayıtlı plaka yıkaması, onay gerekmez
--   'ONAY_BEKLIYOR' → tanımsız plaka, amir onayı bekleniyor
--   'ONAYLANDI'    → amir onayladı; kalıcı
ALTER TABLE public.oto_yikama_gorev_metadata
  ADD COLUMN IF NOT EXISTS onay_durumu text NOT NULL DEFAULT 'ONAYSIZ';

ALTER TABLE public.oto_yikama_gorev_metadata
  DROP CONSTRAINT IF EXISTS oto_yikama_metadata_onay_durumu_check;
ALTER TABLE public.oto_yikama_gorev_metadata
  ADD CONSTRAINT oto_yikama_metadata_onay_durumu_check
  CHECK (onay_durumu IN ('ONAYSIZ', 'ONAY_BEKLIYOR', 'ONAYLANDI'));

CREATE INDEX IF NOT EXISTS oto_yikama_metadata_onay_durumu_idx
  ON public.oto_yikama_gorev_metadata(onay_durumu)
  WHERE onay_durumu <> 'ONAYSIZ';  -- partial index — bekleyenler için hızlı

COMMENT ON COLUMN public.oto_yikama_gorev_metadata.onay_durumu IS
  'Tanımsız plaka yıkamalarında amir onay durumu. Kayıtlı plakalar için ONAYSIZ (default).';

-- ─────────────────────────────────────────────────────────────────────
-- 2) firmalar.oto_yikama_onay_yetkilisi_id
-- ─────────────────────────────────────────────────────────────────────
-- Her firma için tek amir. NULL ise o firmada tanımsız yıkama yapılamaz
-- (endpoint reddeder).
ALTER TABLE public.firmalar
  ADD COLUMN IF NOT EXISTS oto_yikama_onay_yetkilisi_id uuid
  REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS firmalar_oto_yikama_onay_yetkilisi_idx
  ON public.firmalar(oto_yikama_onay_yetkilisi_id)
  WHERE oto_yikama_onay_yetkilisi_id IS NOT NULL;

COMMENT ON COLUMN public.firmalar.oto_yikama_onay_yetkilisi_id IS
  'Tanımsız plaka yıkama onaylarını yönetecek kullanıcı. TA panelinden atanır.';

-- ─────────────────────────────────────────────────────────────────────
-- 3) ATALIAN için MUSTAFA YILDIZ ataması
-- ─────────────────────────────────────────────────────────────────────
-- Idempotent: kullanıcı ATALIAN dışı bir firmaya taşındıysa güncelleme
-- otomatik null'a düşer (FK ON DELETE SET NULL zaten var).
UPDATE public.firmalar
SET oto_yikama_onay_yetkilisi_id = '85df6cb2-473b-4c18-89c7-ed6ad406e869'  -- MUSTAFA YILDIZ
WHERE id = 'a121c4be-77ef-4cc7-8384-9f121eb22112'  -- ATALIAN
  AND (
    oto_yikama_onay_yetkilisi_id IS NULL
    OR oto_yikama_onay_yetkilisi_id <> '85df6cb2-473b-4c18-89c7-ed6ad406e869'
  );
