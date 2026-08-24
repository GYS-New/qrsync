-- Migration 108: arsivle_canli_gorevler_atomik vardiya_gunu bug fix
--
-- BUG: RPC fonksiyonu canli_gorevler_arsiv'e INSERT yaparken 3 kolonu unutuyordu:
--   - vardiya_gunu
--   - acik_bekleme_saat
--   - bekleme_gecmis_saat
--
-- Sonuc: Node cron (/api/tasks/arsivle, 6 saatte 1) canli_gorevler'i arsive
-- tasirken bu kolonlar NULL kaliyordu. Rapor Merkezi > Frekansiyel Rapor
-- vardiya_gunu filtresi kullandigi icin arsive gecen kayitlarin cogu raporda
-- gorunmuyordu.
--
-- Ornek (2026-08-21 Canakkale): Cron 312 gorev uretti, raporda sadece 9
-- (kalan 303'un vardiya_gunu = NULL).
--
-- FIX: INSERT kolon listesine 3 alan eklendi + SELECT'te kaynaktan kopyalanir.
--
-- BACKFILL: Uygulama sonrasi tek seferlik update yapildi (13,981 kayit):
--   UPDATE canli_gorevler_arsiv
--   SET vardiya_gunu = DATE(aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul')
--   WHERE vardiya_gunu IS NULL AND aktif_olma_tarihi IS NOT NULL
-- Sarkan V1 vardiyalari icin +/-1 gun kayabilir; cogunlukla dogru.
--
-- Karsi ornek: gun_sonu_arsivle() fonksiyonu bu 3 kolonu zaten kopyaliyordu,
-- yalnizca atomik RPC unutmus.

CREATE OR REPLACE FUNCTION public.arsivle_canli_gorevler_atomik(p_ids uuid[], p_arsiv_nedeni text DEFAULT 'cron_saat'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tasinan int := 0;
  v_baslik_tasinan int := 0;
  v_madde_tasinan int := 0;
  v_madde_beklenen int := 0;
  v_beklenen int;
  v_non_terminal int;
  v_hata text;
BEGIN
  SELECT COUNT(*) INTO v_non_terminal
  FROM canli_gorevler
  WHERE id = ANY(p_ids)
    AND durum IN ('HAZIR', 'ACIK', 'BEKLEMEDE', 'ISLEMDE');
  IF v_non_terminal > 0 THEN
    RAISE EXCEPTION 'Non-terminal durumlu gorev arsivlenemez (adet: %).', v_non_terminal;
  END IF;

  v_beklenen := (SELECT COUNT(*) FROM canli_gorevler WHERE id = ANY(p_ids));
  IF v_beklenen = 0 THEN
    RETURN jsonb_build_object('ok', true, 'gorev_tasinan', 0, 'baslik_tasinan', 0, 'madde_tasinan', 0);
  END IF;

  v_madde_beklenen := (
    SELECT COUNT(*)
    FROM checklist_sonuc_maddeleri m
    JOIN checklist_sonuc_basliklari b ON b.id = m.sonuc_id
    WHERE b.canli_gorev_id = ANY(p_ids)
  );

  WITH inserted_maddeler AS (
    INSERT INTO checklist_sonuc_maddeleri_arsiv (id, sonuc_id, madde_id, secenek_degeri, aciklama, gorsel_url, arsiv_tarihi)
    SELECT m.id, m.sonuc_id, m.madde_id, m.secenek_degeri, m.aciklama, m.gorsel_url, now()
    FROM checklist_sonuc_maddeleri m
    JOIN checklist_sonuc_basliklari b ON b.id = m.sonuc_id
    WHERE b.canli_gorev_id = ANY(p_ids)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_madde_tasinan FROM inserted_maddeler;

  IF (
    SELECT COUNT(*) FROM checklist_sonuc_maddeleri_arsiv ma
    WHERE ma.sonuc_id IN (
      SELECT id FROM checklist_sonuc_basliklari WHERE canli_gorev_id = ANY(p_ids)
    )
  ) < v_madde_beklenen THEN
    RAISE EXCEPTION 'Cheklist madde arsivleme eksik: beklenen %, arsivde %',
      v_madde_beklenen,
      (SELECT COUNT(*) FROM checklist_sonuc_maddeleri_arsiv ma
       WHERE ma.sonuc_id IN (
         SELECT id FROM checklist_sonuc_basliklari WHERE canli_gorev_id = ANY(p_ids)
       ));
  END IF;

  DELETE FROM checklist_sonuc_maddeleri
  WHERE sonuc_id IN (
    SELECT id FROM checklist_sonuc_basliklari WHERE canli_gorev_id = ANY(p_ids)
  );

  WITH basliklar_to_move AS (
    SELECT b.*, cg.firma_id AS firma_id_new, cg.proje_id AS proje_id_new
    FROM checklist_sonuc_basliklari b
    JOIN canli_gorevler cg ON cg.id = b.canli_gorev_id
    WHERE b.canli_gorev_id = ANY(p_ids)
  ),
  inserted_basliklar AS (
    INSERT INTO checklist_sonuc_basliklari_arsiv (
      id, canli_gorev_id, gorev_id, lokasyon_id, sablon_id, kullanici_id,
      kanal, kayit_tarihi, arsiv_tarihi, firma_id, proje_id
    )
    SELECT
      id, canli_gorev_id, gorev_id, lokasyon_id, sablon_id, kullanici_id,
      kanal, kayit_tarihi, now(), firma_id_new, proje_id_new
    FROM basliklar_to_move
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_baslik_tasinan FROM inserted_basliklar;

  DELETE FROM checklist_sonuc_basliklari
  WHERE canli_gorev_id = ANY(p_ids);

  -- FIX: vardiya_gunu, acik_bekleme_saat, bekleme_gecmis_saat kolonlari eklendi
  WITH inserted_gorevler AS (
    INSERT INTO canli_gorevler_arsiv (
      id, firma_id, proje_id, lokasyon_id, atanan_kullanici_id,
      tanim, durum, kural_id, gunluk_frekans_sayisi, frekans_tipi,
      vardiya_gunu, acik_bekleme_saat, bekleme_gecmis_saat,
      olusturma_tarihi, olusturan_id,
      aktif_olma_tarihi, baslatilma_tarihi, baslatan_kullanici_id,
      tamamlanma_tarihi, tamamlayan_kullanici_id, islemi_yapan_id,
      tamamlanma_suresi_saniye, son_tamamlama_kanali,
      iptal_tarihi, iptal_eden_id, iptal_sebep,
      durum_degisim_tarihi, simule_tamamlandi, lisans_beklemeye_alindi,
      mobil_kayit_id, durum_sebep,
      arsiv_tarihi, arsiv_nedeni
    )
    SELECT
      cg.id, cg.firma_id, cg.proje_id, cg.lokasyon_id, cg.atanan_kullanici_id,
      cg.tanim, cg.durum::text, cg.kural_id, cg.gunluk_frekans_sayisi, cg.frekans_tipi,
      cg.vardiya_gunu, cg.acik_bekleme_saat, cg.bekleme_gecmis_saat,
      cg.olusturma_tarihi, cg.olusturan_id,
      cg.aktif_olma_tarihi, cg.baslatilma_tarihi, cg.baslatan_kullanici_id,
      cg.tamamlanma_tarihi, cg.tamamlayan_kullanici_id, cg.islemi_yapan_id,
      cg.tamamlanma_suresi_saniye, cg.son_tamamlama_kanali,
      cg.iptal_tarihi, cg.iptal_eden_id, cg.iptal_sebep,
      cg.durum_degisim_tarihi, cg.simule_tamamlandi, cg.lisans_beklemeye_alindi,
      cg.mobil_kayit_id, cg.durum_sebep,
      now(), p_arsiv_nedeni
    FROM canli_gorevler cg
    WHERE cg.id = ANY(p_ids)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_tasinan FROM inserted_gorevler;

  IF (SELECT COUNT(*) FROM canli_gorevler_arsiv WHERE id = ANY(p_ids)) < v_beklenen THEN
    RAISE EXCEPTION 'Arsive yazilan satir sayisi eksik: beklenen %, var %',
      v_beklenen, (SELECT COUNT(*) FROM canli_gorevler_arsiv WHERE id = ANY(p_ids));
  END IF;

  DELETE FROM canli_gorevler WHERE id = ANY(p_ids);

  RETURN jsonb_build_object(
    'ok', true,
    'gorev_tasinan', v_tasinan,
    'baslik_tasinan', v_baslik_tasinan,
    'madde_tasinan', v_madde_tasinan,
    'madde_beklenen', v_madde_beklenen,
    'beklenen', v_beklenen
  );
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_hata = MESSAGE_TEXT;
  RETURN jsonb_build_object('ok', false, 'hata', v_hata);
END;
$function$;
