-- ─────────────────────────────────────────────────────────────────────────
-- 029: gece_tam_dongu() TR TIMEZONE KULLANACAK
--   Sorun: CURRENT_DATE DB server timezone (UTC) veriyor. TR saat
--          00:01-02:59'da UTC hala önceki gün. Cron o saatlerde çalışınca
--          TR takviminde 'bugün' olan günün kuralları üretilmiyordu.
--   Fix:   now() AT TIME ZONE 'Europe/Istanbul' ile TR tarihi hesaplanıyor
--          ve gece_gorev_uret() ona göre çağrılıyor.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.gece_tam_dongu()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_arsiv_sonuc   jsonb;
  v_uretim_sonuc  jsonb;
  v_durum_sonuc   jsonb;
  v_now           timestamptz := now();
  v_tr_date       date := (v_now AT TIME ZONE 'Europe/Istanbul')::date;
  v_gecti         int := 0;
  v_aktive        int := 0;
  v_beklemeye     int := 0;
BEGIN
  UPDATE canli_gorevler
  SET durum = 'ACIK', durum_degisim_tarihi = v_now
  WHERE durum = 'HAZIR' AND aktif_olma_tarihi <= v_now;
  GET DIAGNOSTICS v_aktive = ROW_COUNT;

  UPDATE canli_gorevler cg
  SET durum = 'BEKLEMEDE', durum_degisim_tarihi = v_now
  WHERE cg.durum = 'ACIK'
    AND cg.aktif_olma_tarihi <= (
      v_now - (
        (SELECT acik_bekleme_saat
         FROM get_efektif_durum_sure(cg.firma_id, cg.proje_id, COALESCE(cg.frekans_tipi, 'gunluk'))
        )::text || ' hours'
      )::interval
    );
  GET DIAGNOSTICS v_beklemeye = ROW_COUNT;

  UPDATE canli_gorevler cg
  SET durum = 'ZAMANI_GECMIS', durum_degisim_tarihi = v_now
  WHERE cg.durum = 'BEKLEMEDE'
    AND cg.durum_degisim_tarihi <= (
      v_now - (
        (SELECT bekleme_gecmis_saat
         FROM get_efektif_durum_sure(cg.firma_id, cg.proje_id, COALESCE(cg.frekans_tipi, 'gunluk'))
        )::text || ' hours'
      )::interval
    );
  GET DIAGNOSTICS v_gecti = ROW_COUNT;

  v_durum_sonuc := jsonb_build_object(
    'aktive', v_aktive,
    'beklemeye', v_beklemeye,
    'zamani_gecmis', v_gecti
  );

  v_arsiv_sonuc := gun_sonu_arsivle();
  v_uretim_sonuc := gece_gorev_uret(v_tr_date);

  RETURN jsonb_build_object(
    'ok',          true,
    'durum_gecis', v_durum_sonuc,
    'arsiv',       v_arsiv_sonuc,
    'uretim',      v_uretim_sonuc,
    'zaman',       v_now,
    'tr_tarih',    v_tr_date
  );
END;
$function$;
