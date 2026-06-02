-- 073: gun_ici_durum_guncelle — BEKLEMEDE → ZAMANI_GECMIS geçişinde
--      iptal_sebep="vardiya bitti" otomatik yazılır.
--
-- Kullanıcı taksonomisi: sistem genelinde 3 çeşit iptal mekanizması:
--   1) Mobil iptal (personel)      → IPTAL, sebep zorunlu (endpoint validation)
--   2) PD cron vardiya sonu +30 dk → ZAMANINDA_YAPILAMAYAN hedef %X kadar +
--                                    kalan BEKLEMEDE'ler bir süre sonra ZG
--                                    (sebep "vardiya bitti")
--   3) Web manuel iptal (TA/SA)    → IPTAL, sebep zorunlu (endpoint validation)
--
-- ZG geçişi gun_ici_durum_guncelle (her dakika SQL fn) tarafından yapılır,
-- PD cron tarafından değil. Bu yüzden sebep yazımı bu fn'de.
--
-- COALESCE: zaten bir sebep varsa (örn manuel set edilmişse) korunur, yoksa
-- "vardiya bitti" yazılır.

CREATE OR REPLACE FUNCTION public.gun_ici_durum_guncelle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_now      timestamptz := now();
  v_aktive   int := 0;
  v_beklemeye int := 0;
  v_gecti    int := 0;
  v_cnt      int;
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
        COALESCE(
          cg.acik_bekleme_saat,
          (SELECT acik_bekleme_saat
           FROM get_efektif_durum_sure(cg.firma_id, cg.proje_id, COALESCE(cg.frekans_tipi, 'gunluk'))
          )
        )::text || ' hours'
      )::interval
    );
  GET DIAGNOSTICS v_beklemeye = ROW_COUNT;

  UPDATE canli_gorevler cg
  SET durum = 'ZAMANI_GECMIS',
      durum_degisim_tarihi = v_now,
      iptal_sebep = COALESCE(cg.iptal_sebep, 'vardiya bitti')
  WHERE cg.durum = 'BEKLEMEDE'
    AND cg.durum_degisim_tarihi <= (
      v_now - (
        COALESCE(
          cg.bekleme_gecmis_saat,
          (SELECT bekleme_gecmis_saat
           FROM get_efektif_durum_sure(cg.firma_id, cg.proje_id, COALESCE(cg.frekans_tipi, 'gunluk'))
          )
        )::text || ' hours'
      )::interval
    );
  GET DIAGNOSTICS v_gecti = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'aktive', v_aktive,
    'beklemeye', v_beklemeye,
    'zamani_gecmis', v_gecti
  );
END;
$function$;
