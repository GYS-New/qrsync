-- ─────────────────────────────────────────────────────────────────────────
-- 023: ARŞİV RPC — ÇEKLİST MADDE EŞLEŞME DOĞRULAMASI
--   Eski akışta: RPC başlığı arşive taşıyor, ama madde insert sessizce atlanmışsa
--   aktif maddeler yine siliniyordu → veri kaybı (2026-04-18 incident).
--
--   Yeni: Arşive taşınması BEKLENEN madde sayısı hesaplanıyor. Arşivdeki mevcut
--   madde sayısı bu hedeften az ise EXCEPTION → tüm transaction rollback.
-- ─────────────────────────────────────────────────────────────────────────

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
  v_hata text;
BEGIN
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

  -- DOĞRULAMA: Arşivdeki mevcut madde sayısı beklenenden az ise veri kaybı riski → EXCEPTION
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

  WITH inserted_gorevler AS (
    INSERT INTO canli_gorevler_arsiv
    SELECT cg.*, now() AS arsiv_tarihi, p_arsiv_nedeni AS arsiv_nedeni
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
