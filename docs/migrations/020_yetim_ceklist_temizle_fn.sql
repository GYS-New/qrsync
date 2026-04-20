-- ─────────────────────────────────────────────────────────────────────────
-- 020: YETİM ÇEKLİST KAYITLARINI TEMİZLE
--   Görevi silinmiş çeklist başlıklarını (ve bağlı maddelerini)
--   hem aktif hem arşiv tablolarından atomik olarak siler.
--   Dönüş: { aktif_baslik_silinen, aktif_madde_silinen, arsiv_baslik_silinen, arsiv_madde_silinen }
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION temizle_yetim_ceklist_basliklari()
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  aktif_baslik_ids uuid[];
  arsiv_baslik_ids uuid[];
  aktif_baslik_sil int := 0;
  aktif_madde_sil  int := 0;
  arsiv_baslik_sil int := 0;
  arsiv_madde_sil  int := 0;
BEGIN
  -- 1. AKTİF tablodaki yetim başlık ID'leri
  SELECT ARRAY_AGG(b.id) INTO aktif_baslik_ids
  FROM checklist_sonuc_basliklari b
  LEFT JOIN canli_gorevler cg        ON cg.id  = b.canli_gorev_id
  LEFT JOIN canli_gorevler_arsiv cga ON cga.id = b.canli_gorev_id
  LEFT JOIN gorevler g               ON g.id   = b.gorev_id
  LEFT JOIN gorevler_arsiv ga        ON ga.id  = b.gorev_id
  WHERE (b.canli_gorev_id IS NOT NULL OR b.gorev_id IS NOT NULL)
    AND cg.id  IS NULL
    AND cga.id IS NULL
    AND g.id   IS NULL
    AND ga.id  IS NULL;

  -- 2. AKTİF bağlı maddeleri sil
  IF aktif_baslik_ids IS NOT NULL AND array_length(aktif_baslik_ids, 1) > 0 THEN
    DELETE FROM checklist_sonuc_maddeleri WHERE sonuc_id = ANY(aktif_baslik_ids);
    GET DIAGNOSTICS aktif_madde_sil = ROW_COUNT;

    DELETE FROM checklist_sonuc_basliklari WHERE id = ANY(aktif_baslik_ids);
    GET DIAGNOSTICS aktif_baslik_sil = ROW_COUNT;
  END IF;

  -- 3. ARŞİV tablodaki yetim başlık ID'leri
  SELECT ARRAY_AGG(b.id) INTO arsiv_baslik_ids
  FROM checklist_sonuc_basliklari_arsiv b
  LEFT JOIN canli_gorevler cg        ON cg.id  = b.canli_gorev_id
  LEFT JOIN canli_gorevler_arsiv cga ON cga.id = b.canli_gorev_id
  LEFT JOIN gorevler g               ON g.id   = b.gorev_id
  LEFT JOIN gorevler_arsiv ga        ON ga.id  = b.gorev_id
  WHERE (b.canli_gorev_id IS NOT NULL OR b.gorev_id IS NOT NULL)
    AND cg.id  IS NULL
    AND cga.id IS NULL
    AND g.id   IS NULL
    AND ga.id  IS NULL;

  -- 4. ARŞİV bağlı maddeleri sil
  IF arsiv_baslik_ids IS NOT NULL AND array_length(arsiv_baslik_ids, 1) > 0 THEN
    DELETE FROM checklist_sonuc_maddeleri_arsiv WHERE sonuc_id = ANY(arsiv_baslik_ids);
    GET DIAGNOSTICS arsiv_madde_sil = ROW_COUNT;

    DELETE FROM checklist_sonuc_basliklari_arsiv WHERE id = ANY(arsiv_baslik_ids);
    GET DIAGNOSTICS arsiv_baslik_sil = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'aktif_baslik_silinen', aktif_baslik_sil,
    'aktif_madde_silinen',  aktif_madde_sil,
    'arsiv_baslik_silinen', arsiv_baslik_sil,
    'arsiv_madde_silinen',  arsiv_madde_sil,
    'toplam_baslik_silinen', aktif_baslik_sil + arsiv_baslik_sil,
    'toplam_madde_silinen',  aktif_madde_sil + arsiv_madde_sil,
    'aktif_ids', COALESCE(aktif_baslik_ids, '{}'::uuid[]),
    'arsiv_ids', COALESCE(arsiv_baslik_ids, '{}'::uuid[])
  );
END;
$$;

COMMENT ON FUNCTION temizle_yetim_ceklist_basliklari() IS
  'Görevi silinmiş yetim çeklist başlıklarını ve bağlı maddelerini (aktif + arşiv) atomik olarak temizler. Dönüş: silinen satır sayıları.';
