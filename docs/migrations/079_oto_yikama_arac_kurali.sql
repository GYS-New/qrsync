-- Migration 079: Araç bazlı döngüsel yıkama kuralı + otomatik görev üretim RPC.
--
-- Yapı değişikliği: Önceden yönetici her görev için tek tek hedef_tarih
-- seçiyordu. Artık araç kaydında "döngüsel kural" durur, cron her gece
-- ertesi gün için kuralları yorumlayıp otomatik HAZIR görev üretir.
--
-- Frekans tipleri:
--   HAFTALIK : yikama_gunleri (Pzt/Çar/Cum gibi) her hafta tekrar
--   BIHAFTA  : aralık (örn 2) hafta sayısına göre, yikama_gunleri içinde
--   AYLIK    : referans_tarih'in ayın o günü her ay tekrar
--
-- Cron her gece "ertesi gün için kim yıkanmalı" sorgular ve görev oluşturur.
-- Duplicate koruma: oto_yikama_gorev_metadata UNIQUE(arac_id, hedef_tarih) ile.

-- 1) Araç tablosuna kural kolonları
ALTER TABLE public.araclar
  ADD COLUMN IF NOT EXISTS varsayilan_lokasyon_id uuid REFERENCES lokasyonlar(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS yikama_frekans_tip    text DEFAULT 'HAFTALIK'
    CHECK (yikama_frekans_tip IN ('HAFTALIK', 'BIHAFTA', 'AYLIK')),
  ADD COLUMN IF NOT EXISTS yikama_frekans_aralik int DEFAULT 1
    CHECK (yikama_frekans_aralik >= 1),
  ADD COLUMN IF NOT EXISTS yikama_referans_tarih date;

CREATE INDEX IF NOT EXISTS araclar_varsayilan_lokasyon_idx
  ON public.araclar(varsayilan_lokasyon_id);

COMMENT ON COLUMN public.araclar.varsayilan_lokasyon_id IS
  'Otomatik görev üretimi için araç hangi istasyona yönlendirilir.';
COMMENT ON COLUMN public.araclar.yikama_frekans_tip IS
  'HAFTALIK | BIHAFTA | AYLIK — döngüsel kural tipi.';
COMMENT ON COLUMN public.araclar.yikama_frekans_aralik IS
  'BIHAFTA için N (her N haftada). HAFTALIK ve AYLIK için 1.';
COMMENT ON COLUMN public.araclar.yikama_referans_tarih IS
  'BIHAFTA modulo hesabı ve AYLIK gün referansı için başlangıç noktası.';

-- 2) Otomatik görev üretim RPC'si
--    Ertesi gün (TR) için kurallara göre HAZIR görev oluşturur.
--    metadata UNIQUE constraint ile aynı (arac, hedef_tarih) iki kez yazılmaz.
CREATE OR REPLACE FUNCTION public.oto_yikama_gorev_uret_ertesi_gun()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ertesi_gun     date := (CURRENT_DATE + 1);
  v_ertesi_dow     int  := EXTRACT(ISODOW FROM (CURRENT_DATE + 1))::int;
  v_uretilen       int  := 0;
  v_arac           record;
  v_yeni_gorev_id  uuid;
  v_uygunsa        boolean;
  v_hafta_farki    int;
  v_ay_farki       int;
BEGIN
  -- Sadece otomatik üretime uygun aktif araçlar (varsayılan istasyon dolu,
  -- haftalık için en az 1 gün, frekans tipi geçerli).
  FOR v_arac IN
    SELECT a.id, a.firma_id, a.plaka, a.varsayilan_lokasyon_id,
           a.yikama_frekans_tip, a.yikama_frekans_aralik,
           a.yikama_referans_tarih, a.yikama_gunleri
    FROM araclar a
    WHERE a.aktif = true
      AND a.varsayilan_lokasyon_id IS NOT NULL
      AND a.yikama_frekans_tip IS NOT NULL
  LOOP
    v_uygunsa := false;

    IF v_arac.yikama_frekans_tip = 'HAFTALIK' THEN
      -- Ertesi günün haftaIn günü, araç yikama_gunleri içinde mi?
      IF v_arac.yikama_gunleri IS NOT NULL
         AND v_ertesi_dow = ANY(v_arac.yikama_gunleri) THEN
        v_uygunsa := true;
      END IF;

    ELSIF v_arac.yikama_frekans_tip = 'BIHAFTA' THEN
      -- Referans tarih zorunlu. Hafta farkı mod aralık == 0 + gün uygun.
      IF v_arac.yikama_referans_tarih IS NOT NULL
         AND v_arac.yikama_gunleri IS NOT NULL
         AND v_ertesi_dow = ANY(v_arac.yikama_gunleri) THEN
        v_hafta_farki := ((v_ertesi_gun - v_arac.yikama_referans_tarih) / 7)::int;
        IF v_hafta_farki >= 0
           AND COALESCE(v_arac.yikama_frekans_aralik, 1) >= 1
           AND v_hafta_farki % COALESCE(v_arac.yikama_frekans_aralik, 1) = 0 THEN
          v_uygunsa := true;
        END IF;
      END IF;

    ELSIF v_arac.yikama_frekans_tip = 'AYLIK' THEN
      -- Referans tarihinin gününe denk geliyorsa.
      IF v_arac.yikama_referans_tarih IS NOT NULL THEN
        v_ay_farki :=
          (EXTRACT(YEAR FROM v_ertesi_gun)::int - EXTRACT(YEAR FROM v_arac.yikama_referans_tarih)::int) * 12 +
          (EXTRACT(MONTH FROM v_ertesi_gun)::int - EXTRACT(MONTH FROM v_arac.yikama_referans_tarih)::int);
        IF v_ay_farki >= 0
           AND EXTRACT(DAY FROM v_ertesi_gun)::int = EXTRACT(DAY FROM v_arac.yikama_referans_tarih)::int THEN
          v_uygunsa := true;
        END IF;
        -- Şubat 30 / 31 edge case: ay sonundaysa referans günü düşmez,
        -- ileride iyileştirilebilir (şimdilik bu durumda görev üretilmez).
      END IF;
    END IF;

    IF NOT v_uygunsa THEN CONTINUE; END IF;

    -- Duplicate kontrol — aynı (arac, hedef_tarih) kombinasyonu var mı?
    IF EXISTS (
      SELECT 1 FROM oto_yikama_gorev_metadata m
      WHERE m.arac_id = v_arac.id AND m.hedef_tarih = v_ertesi_gun
    ) THEN
      CONTINUE;
    END IF;

    -- Yeni görev + metadata
    INSERT INTO gorevler (firma_id, tanim, lokasyon_id, durum, olusturan_id)
    VALUES (v_arac.firma_id, 'Oto Yıkama - ' || v_arac.plaka,
            v_arac.varsayilan_lokasyon_id, 'HAZIR', NULL)
    RETURNING id INTO v_yeni_gorev_id;

    INSERT INTO oto_yikama_gorev_metadata (gorev_id, arac_id, plaka_snapshot, hedef_tarih, ekstra)
    VALUES (v_yeni_gorev_id, v_arac.id, v_arac.plaka, v_ertesi_gun, false);

    v_uretilen := v_uretilen + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'uretilen',     v_uretilen,
    'hedef_tarih',  v_ertesi_gun,
    'zaman',        now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.oto_yikama_gorev_uret_ertesi_gun() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oto_yikama_gorev_uret_ertesi_gun() TO service_role;

COMMENT ON FUNCTION public.oto_yikama_gorev_uret_ertesi_gun() IS
  'Oto Yıkama: araç döngüsel kurallarına göre ertesi günün HAZIR görevlerini üretir. Her gece 23:55 TR cron tetikler. Duplicate metadata UNIQUE ile engellenir.';
