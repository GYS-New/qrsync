-- Migration 080: Oto Yıkama RPC'leri CURRENT_DATE (UTC) yerine TR günü kullanır.
--
-- Sebep: Postgres CURRENT_DATE UTC tarihi döner. Cron'lar TR gece 00:00-01'de
-- çalışırken Postgres hala bir önceki günü gösteriyordu → hedef_tarih
-- kıyaslamaları yanlış sonuç veriyordu:
--   • oto_yikama_hazir_to_acik: HAZIR'lar AÇIK'a alınmıyordu
--   • oto_yikama_acik_to_yapilamadi: dünün AÇIK'ları YAPILAMADI'ya geçmiyordu
--   • oto_yikama_arsivle: arşive aktarım 1 gün gecikiyordu
--   • oto_yikama_gorev_uret_ertesi_gun: ertesi gün hesabı kayıyordu
--
-- Saha tespiti: 2026-06-19 sabahı kullanıcı Canlı İşlemler sayfasında 4 görevin
-- durum sütununu boş gördü. DB sorgusu hepsi HAZIR çıktı, durum_degisim_tarihi
-- NULL. RPC'yi manuel tetikleyince yine HAZIR kaldı çünkü
-- CURRENT_DATE (UTC=18) < hedef_tarih (19) → UPDATE etkisiz.
--
-- Çözüm: Tüm CURRENT_DATE referansları (now() AT TIME ZONE 'Europe/Istanbul')::date
-- ile değiştirildi. Cron route'larında JS tarafı zaten TR'ye uyumluydu.

CREATE OR REPLACE FUNCTION public.oto_yikama_hazir_to_acik()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_bugun date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
BEGIN
  UPDATE gorevler g
  SET durum = 'ACIK',
      durum_degisim_tarihi = now()
  FROM oto_yikama_gorev_metadata m
  WHERE m.gorev_id = g.id
    AND g.durum = 'HAZIR'
    AND m.hedef_tarih <= v_bugun;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('acilan', v_count, 'tarih', v_bugun, 'zaman', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.oto_yikama_acik_to_yapilamadi()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_bugun date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
BEGIN
  UPDATE gorevler g
  SET durum = 'YAPILAMADI',
      durum_degisim_tarihi = now()
  FROM oto_yikama_gorev_metadata m
  WHERE m.gorev_id = g.id
    AND g.durum = 'ACIK'
    AND m.hedef_tarih < v_bugun;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('yapilamadi_yapilan', v_count, 'tarih', v_bugun, 'zaman', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.oto_yikama_arsivle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_esik   date := ((now() AT TIME ZONE 'Europe/Istanbul')::date - INTERVAL '30 days')::date;
  v_count  int  := 0;
BEGIN
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
  SELECT * FROM adaylar
  ON CONFLICT (gorev_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM gorevler g
  WHERE EXISTS (
    SELECT 1 FROM oto_yikama_gorev_metadata m
    WHERE m.gorev_id = g.id AND m.hedef_tarih < v_esik
  );

  RETURN jsonb_build_object('arsivlenen', v_count, 'esik_tarih', v_esik, 'zaman', now());
END;
$$;

CREATE OR REPLACE FUNCTION public.oto_yikama_gorev_uret_ertesi_gun()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bugun_tr       date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
  v_ertesi_gun     date := (v_bugun_tr + 1);
  v_ertesi_dow     int  := EXTRACT(ISODOW FROM v_ertesi_gun)::int;
  v_uretilen       int  := 0;
  v_arac           record;
  v_yeni_gorev_id  uuid;
  v_uygunsa        boolean;
  v_hafta_farki    int;
  v_ay_farki       int;
BEGIN
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
      IF v_arac.yikama_gunleri IS NOT NULL
         AND v_ertesi_dow = ANY(v_arac.yikama_gunleri) THEN
        v_uygunsa := true;
      END IF;

    ELSIF v_arac.yikama_frekans_tip = 'BIHAFTA' THEN
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
      IF v_arac.yikama_referans_tarih IS NOT NULL THEN
        v_ay_farki :=
          (EXTRACT(YEAR FROM v_ertesi_gun)::int - EXTRACT(YEAR FROM v_arac.yikama_referans_tarih)::int) * 12 +
          (EXTRACT(MONTH FROM v_ertesi_gun)::int - EXTRACT(MONTH FROM v_arac.yikama_referans_tarih)::int);
        IF v_ay_farki >= 0
           AND EXTRACT(DAY FROM v_ertesi_gun)::int = EXTRACT(DAY FROM v_arac.yikama_referans_tarih)::int THEN
          v_uygunsa := true;
        END IF;
      END IF;
    END IF;

    IF NOT v_uygunsa THEN CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM oto_yikama_gorev_metadata m
      WHERE m.arac_id = v_arac.id AND m.hedef_tarih = v_ertesi_gun
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO gorevler (firma_id, tanim, lokasyon_id, durum, olusturan_id)
    VALUES (v_arac.firma_id, 'Oto Yıkama - ' || v_arac.plaka,
            v_arac.varsayilan_lokasyon_id, 'HAZIR', NULL)
    RETURNING id INTO v_yeni_gorev_id;

    INSERT INTO oto_yikama_gorev_metadata (gorev_id, arac_id, plaka_snapshot, hedef_tarih, ekstra)
    VALUES (v_yeni_gorev_id, v_arac.id, v_arac.plaka, v_ertesi_gun, false);

    v_uretilen := v_uretilen + 1;
  END LOOP;

  RETURN jsonb_build_object('uretilen', v_uretilen, 'hedef_tarih', v_ertesi_gun, 'zaman', now());
END;
$$;
