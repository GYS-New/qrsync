-- Migration 086: backend ↔ mobil ekibi haberleşme tablosu.
--
-- Mobil ekibinin yalnızca Supabase'e erişimi var (Github/repo erişimi yok).
-- Şimdiye kadar docs/MOBIL_EKIBE_*.md dosyaları repo'da tutuluyordu; mobil
-- ekibe bu dökümanları manuel kopyalamak gerekiyordu. Bu tablo:
--
--   1) Spec paylaşımı (backend → mobil): yeni endpoint, response shape,
--      breaking change duyurusu vb.
--   2) Soru/cevap zinciri (mobil → backend, backend → mobil): mevcut
--      e-posta tarzı yazışmaların yerine geçer.
--   3) parent_id ile thread yapısı — bir konunun cevapları tek zincirde.
--
-- Mobil tarafı tabloyu doğrudan SELECT eder (anon key). INSERT/UPDATE
-- yapabilir — mobil ekip kendi sorularını yazabilir.

CREATE TABLE IF NOT EXISTS public.backend_mobil_haberlesme (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Konu başlığı (kısa, listede görünür). Cevaplarda parent ile aynı olabilir.
  konu text NOT NULL,

  -- Kategori — filtreleme için. Örn: 'oto_yikama', 'gorev', 'kimlik', 'fcm'
  kategori text,

  -- Hangi yönden yazıldı: 'backend_to_mobil' veya 'mobil_to_backend'
  yon text NOT NULL CHECK (yon IN ('backend_to_mobil', 'mobil_to_backend')),

  -- İçerik markdown formatında. Kod blokları, başlıklar, link vs. destekler.
  icerik text NOT NULL,

  -- Thread için: aynı konunun cevap zinciri. NULL = ilk mesaj.
  parent_id uuid REFERENCES public.backend_mobil_haberlesme(id) ON DELETE CASCADE,

  -- Yazan kişi/ekip — gerekirse "Backend: Özcan" / "Mobil: Ali" gibi
  yazan text,

  -- Durum: 'aktif' (üzerinde çalışılıyor), 'cevaplandi' (kapandı), 'arsiv' (eski)
  durum text NOT NULL DEFAULT 'aktif' CHECK (durum IN ('aktif', 'cevaplandi', 'arsiv')),

  -- Sürüm bilgisi spec için (örn. mobil 1.0.30, backend commit 3aff090)
  versiyon text,

  olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
  guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS backend_mobil_haberlesme_olusturma_idx
  ON public.backend_mobil_haberlesme(olusturma_tarihi DESC);

CREATE INDEX IF NOT EXISTS backend_mobil_haberlesme_kategori_idx
  ON public.backend_mobil_haberlesme(kategori) WHERE kategori IS NOT NULL;

CREATE INDEX IF NOT EXISTS backend_mobil_haberlesme_parent_idx
  ON public.backend_mobil_haberlesme(parent_id) WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS backend_mobil_haberlesme_durum_idx
  ON public.backend_mobil_haberlesme(durum);

-- guncelleme_tarihi otomatik (basit trigger)
CREATE OR REPLACE FUNCTION public.backend_mobil_haberlesme_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.guncelleme_tarihi := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS backend_mobil_haberlesme_touch_trg
  ON public.backend_mobil_haberlesme;
CREATE TRIGGER backend_mobil_haberlesme_touch_trg
  BEFORE UPDATE ON public.backend_mobil_haberlesme
  FOR EACH ROW EXECUTE FUNCTION public.backend_mobil_haberlesme_touch();

-- RLS — bu iç araç. Anon ve authenticated rolüne tam CRUD verilir.
-- service_role zaten bypass eder. RLS açık ama policy permissive.
ALTER TABLE public.backend_mobil_haberlesme ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bmh_open_read ON public.backend_mobil_haberlesme;
CREATE POLICY bmh_open_read ON public.backend_mobil_haberlesme
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS bmh_open_write ON public.backend_mobil_haberlesme;
CREATE POLICY bmh_open_write ON public.backend_mobil_haberlesme
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS bmh_open_update ON public.backend_mobil_haberlesme;
CREATE POLICY bmh_open_update ON public.backend_mobil_haberlesme
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.backend_mobil_haberlesme TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backend_mobil_haberlesme TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.backend_mobil_haberlesme TO anon;

COMMENT ON TABLE public.backend_mobil_haberlesme IS
  'Backend ile mobil ekip arasındaki spec paylaşımı + soru/cevap zinciri. Mobil ekibin repo erişimi olmadığı için docs/MOBIL_EKIBE_*.md dosyalarının Supabase karşılığı. parent_id ile thread yapısı.';
