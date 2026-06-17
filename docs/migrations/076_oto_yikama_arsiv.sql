-- Migration 076: Oto Yıkama görev kayıtları için ayrı arşiv tablosu + arşivleme RPC.
--
-- Neden ayrı? GYS gorevler_arsiv tablosuna dokunmadan, Oto Yıkama'ya özel
-- (plaka, hedef_tarih, ekstra) kolonlar tek satırda toplansın. Bu sayede:
--   • GYS arşiv akışı bozulmaz
--   • Görev Kayıtları sayfasındaki canlı sorgu yükü azalır (eski kayıtlar
--     gorevler tablosundan çıkar)
--   • Arşiv sayfası tek tablo sorgusu ile listelenir (ek JOIN yok)
--
-- Kural: hedef_tarih + 30 gün < CURRENT_DATE olan TÜM yıkama görevleri
-- (durumdan bağımsız) arşive taşınır. ON DELETE CASCADE ile metadata da silinir.

-- 1) Arşiv tablosu — gorevler + metadata kolonlarının birleşimi
CREATE TABLE IF NOT EXISTS public.oto_yikama_arsiv (
  -- gorev kimliği (eski gorevler.id; FK YOK çünkü artık gorevler'de değil)
  gorev_id uuid PRIMARY KEY,

  -- gorevler tablosundan gelen kolonlar
  firma_id                  uuid NOT NULL,
  tanim                     text,
  lokasyon_id               uuid,
  durum                     gorev_durum,
  olusturma_tarihi          timestamptz,
  baslatilma_tarihi         timestamptz,
  tamamlanma_tarihi         timestamptz,
  tamamlanma_suresi_saniye  int,
  olusturan_id              uuid,
  islemi_yapan_id           uuid,
  iptal_sebep               text,

  -- oto_yikama_gorev_metadata'dan gelen kolonlar (yıkamaya özel)
  arac_id                   uuid,
  plaka_snapshot            text,
  hedef_tarih               date NOT NULL,
  ekstra                    boolean,
  km                        int,
  foto_oncesi_url           text,
  foto_sonrasi_url          text,
  notlar                    text,

  -- arşivleme zamanı
  arsivleme_tarihi          timestamptz NOT NULL DEFAULT now()
);

-- 2) Index'ler — sayfa sorgu pattern'leri
CREATE INDEX IF NOT EXISTS oto_yikama_arsiv_firma_hedef_idx
  ON public.oto_yikama_arsiv(firma_id, hedef_tarih DESC);
CREATE INDEX IF NOT EXISTS oto_yikama_arsiv_plaka_idx
  ON public.oto_yikama_arsiv(plaka_snapshot);
CREATE INDEX IF NOT EXISTS oto_yikama_arsiv_arsivleme_idx
  ON public.oto_yikama_arsiv(arsivleme_tarihi DESC);

-- 3) RLS — SA + alt SA SELECT, diğer roller için service_role bypass eder
ALTER TABLE public.oto_yikama_arsiv ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oto_yikama_arsiv_sa_select ON public.oto_yikama_arsiv;
CREATE POLICY oto_yikama_arsiv_sa_select ON public.oto_yikama_arsiv
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.rol IN ('super_admin', 'alt_super_admin')
    )
  );

-- 4) GRANT'ler (30 Ekim 2026 sonrası zorunlu)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oto_yikama_arsiv TO service_role;
GRANT SELECT ON public.oto_yikama_arsiv TO authenticated;

-- 5) Arşivleme RPC — hedef_tarih + 30 gün geçmiş tüm yıkama görevlerini taşır
CREATE OR REPLACE FUNCTION public.oto_yikama_arsivle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_esik   date := CURRENT_DATE - INTERVAL '30 days';
  v_count  int  := 0;
BEGIN
  -- 1) Adayları arşive yaz
  WITH adaylar AS (
    SELECT g.id AS gorev_id, g.firma_id, g.tanim, g.lokasyon_id, g.durum,
           g.olusturma_tarihi, g.baslatilma_tarihi, g.tamamlanma_tarihi,
           g.tamamlanma_suresi_saniye, g.olusturan_id, g.islemi_yapan_id,
           g.iptal_sebep,
           m.arac_id, m.plaka_snapshot, m.hedef_tarih, m.ekstra,
           m.km, m.foto_oncesi_url, m.foto_sonrasi_url, m.notlar
    FROM gorevler g
    INNER JOIN oto_yikama_gorev_metadata m ON m.gorev_id = g.id
    WHERE m.hedef_tarih < v_esik
  )
  INSERT INTO oto_yikama_arsiv (
    gorev_id, firma_id, tanim, lokasyon_id, durum,
    olusturma_tarihi, baslatilma_tarihi, tamamlanma_tarihi,
    tamamlanma_suresi_saniye, olusturan_id, islemi_yapan_id, iptal_sebep,
    arac_id, plaka_snapshot, hedef_tarih, ekstra,
    km, foto_oncesi_url, foto_sonrasi_url, notlar
  )
  SELECT gorev_id, firma_id, tanim, lokasyon_id, durum,
         olusturma_tarihi, baslatilma_tarihi, tamamlanma_tarihi,
         tamamlanma_suresi_saniye, olusturan_id, islemi_yapan_id, iptal_sebep,
         arac_id, plaka_snapshot, hedef_tarih, ekstra,
         km, foto_oncesi_url, foto_sonrasi_url, notlar
  FROM adaylar
  ON CONFLICT (gorev_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- 2) gorevler'den sil (metadata ON DELETE CASCADE ile beraber gider)
  DELETE FROM gorevler g
  WHERE EXISTS (
    SELECT 1 FROM oto_yikama_gorev_metadata m
    WHERE m.gorev_id = g.id AND m.hedef_tarih < v_esik
  );

  RETURN jsonb_build_object(
    'arsivlenen', v_count,
    'esik_tarih', v_esik,
    'zaman',      now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.oto_yikama_arsivle() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oto_yikama_arsivle() TO service_role;

COMMENT ON TABLE public.oto_yikama_arsiv IS
  'Oto Yıkama: hedef_tarih + 30 gün geçmiş tüm görevlerin tek satırlı arşivi (gorevler + metadata birleşimi).';
COMMENT ON FUNCTION public.oto_yikama_arsivle() IS
  'Hedef tarihi 30 günden eski yıkama görevlerini oto_yikama_arsiv''e taşır; durumdan bağımsızdır. Cron tetikleyici çağırır.';
