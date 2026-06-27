-- 099: Manuel durum değişimi için gerekçe (durum_sebep) kolonu
--
-- Sebep: GYS tarafında yapılan TÜM manuel durum değişimleri için gerekçe
-- zorunlu olacak (sadece IPTAL değil). UI'da sütun olarak gösterilmez —
-- durum badge'ine tıklanarak popup ile görüntülenir.
--
-- iptal_sebep ile fark: iptal_sebep semantik olarak sadece IPTAL'a özel
-- (geriye uyum için kalır). durum_sebep tüm durum geçişleri için.
--
-- 4 tablo: canli_gorevler, canli_gorevler_arsiv, gorevler, gorevler_arsiv.
-- Backfill: iptal_sebep dolu olan kayıtlarda durum_sebep'i de eşitle.
--
-- Cron/sistem geçişleri (gun_ici_durum_guncelle, gece_gorev_uret,
-- personel-destek, max-sure-kontrol) durum_sebep yazmaz — sadece manuel.

ALTER TABLE canli_gorevler        ADD COLUMN IF NOT EXISTS durum_sebep text;
ALTER TABLE canli_gorevler_arsiv  ADD COLUMN IF NOT EXISTS durum_sebep text;
ALTER TABLE gorevler              ADD COLUMN IF NOT EXISTS durum_sebep text;
ALTER TABLE gorevler_arsiv        ADD COLUMN IF NOT EXISTS durum_sebep text;

COMMENT ON COLUMN canli_gorevler.durum_sebep IS
  'Manuel durum değişimlerinde girilen gerekçe. UI badge''ine tıklayarak görünür.';
COMMENT ON COLUMN canli_gorevler_arsiv.durum_sebep IS 'mig 099';
COMMENT ON COLUMN gorevler.durum_sebep IS 'mig 099';
COMMENT ON COLUMN gorevler_arsiv.durum_sebep IS 'mig 099';

-- Backfill: IPTAL kayıtlarındaki iptal_sebep değerini durum_sebep'e taşı
UPDATE canli_gorevler       SET durum_sebep = iptal_sebep WHERE durum_sebep IS NULL AND iptal_sebep IS NOT NULL;
UPDATE canli_gorevler_arsiv SET durum_sebep = iptal_sebep WHERE durum_sebep IS NULL AND iptal_sebep IS NOT NULL;
UPDATE gorevler             SET durum_sebep = iptal_sebep WHERE durum_sebep IS NULL AND iptal_sebep IS NOT NULL;
UPDATE gorevler_arsiv       SET durum_sebep = iptal_sebep WHERE durum_sebep IS NULL AND iptal_sebep IS NOT NULL;

-- arsivle_canli_gorevler_atomik: durum_sebep kolonunu kopyalama listesine ekle
-- (saatlik cron arşivleme — manuel girilen sebepler arşivde de kalır)
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
    INSERT INTO canli_gorevler_arsiv (
      id, firma_id, proje_id, lokasyon_id, atanan_kullanici_id,
      tanim, durum, kural_id, gunluk_frekans_sayisi, frekans_tipi,
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

-- gun_sonu_arsivle: arsiv tablosuna durum_sebep'i de kopyala
CREATE OR REPLACE FUNCTION public.gun_sonu_arsivle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_arsivlenen int := 0;
  v_hata       text;
BEGIN
  WITH arsive_tasinanlar AS (
    INSERT INTO canli_gorevler_arsiv (
      id, firma_id, proje_id, tanim, lokasyon_id, atanan_kullanici_id, durum,
      aktif_olma_tarihi, olusturma_tarihi, olusturan_id,
      baslatilma_tarihi, baslatan_kullanici_id,
      tamamlanma_tarihi, tamamlayan_kullanici_id,
      islemi_yapan_id, tamamlanma_suresi_saniye,
      iptal_eden_id, iptal_tarihi, iptal_sebep, durum_degisim_tarihi,
      gunluk_frekans_sayisi, kural_id,
      frekans_tipi, vardiya_gunu,
      acik_bekleme_saat, bekleme_gecmis_saat,
      son_tamamlama_kanali, simule_tamamlandi, lisans_beklemeye_alindi,
      mobil_kayit_id, aciklama, durum_sebep,
      arsiv_tarihi, arsiv_nedeni
    )
    SELECT
      id, firma_id, proje_id, tanim, lokasyon_id, atanan_kullanici_id, durum,
      aktif_olma_tarihi, olusturma_tarihi, olusturan_id,
      baslatilma_tarihi, baslatan_kullanici_id,
      tamamlanma_tarihi, tamamlayan_kullanici_id,
      islemi_yapan_id, tamamlanma_suresi_saniye,
      iptal_eden_id, iptal_tarihi, iptal_sebep, durum_degisim_tarihi,
      COALESCE(gunluk_frekans_sayisi, 0), kural_id,
      frekans_tipi, vardiya_gunu,
      acik_bekleme_saat, bekleme_gecmis_saat,
      son_tamamlama_kanali, simule_tamamlandi, lisans_beklemeye_alindi,
      mobil_kayit_id, aciklama, durum_sebep,
      now(), 'gun_sonu'
    FROM canli_gorevler
    WHERE durum IN ('TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS', 'IPTAL', 'SILINDI')
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  ),
  silme AS (
    DELETE FROM canli_gorevler
    WHERE id IN (SELECT id FROM arsive_tasinanlar)
    RETURNING id
  )
  SELECT count(*) INTO v_arsivlenen FROM silme;

  RETURN jsonb_build_object(
    'ok',         true,
    'arsivlenen', v_arsivlenen,
    'zaman',      now()
  );

EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_hata = MESSAGE_TEXT;
  RETURN jsonb_build_object('ok', false, 'hata', v_hata);
END;
$function$;
