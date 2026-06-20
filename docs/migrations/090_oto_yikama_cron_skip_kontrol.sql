-- Migration 090: oto_yikama_gorev_uret_ertesi_gun RPC — skip kontrolü.
--
-- Migration 089 ile eklenen oto_yikama_gorev_skip tablosuna bakar; kayıt
-- varsa o arac+tarih için görev üretmez. Mevcut metadata kontrolünden
-- önce gelir (skip > mevcut).

CREATE OR REPLACE FUNCTION public.oto_yikama_gorev_uret_ertesi_gun()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

    -- YENİ: skip tablosu kontrolü
    IF EXISTS (
      SELECT 1 FROM oto_yikama_gorev_skip s
      WHERE s.arac_id = v_arac.id AND s.tarih = v_ertesi_gun
    ) THEN
      CONTINUE;
    END IF;

    -- Mevcut metadata kontrolü
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
$function$;
