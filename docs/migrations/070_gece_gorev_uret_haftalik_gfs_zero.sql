-- 070: gece_gorev_uret — haftalık branch gunluk_frekans_sayisi = 0 (semantik düzeltme)
--
-- Migration 069'da haftalık branch için COALESCE(r.gunluk_frekans_sayisi, 1) yazılmıştı.
-- Ama rapor mantığında (lib/reports/genel-rapor-data.ts:538):
--   "gunluk_frekans_sayisi=0 → tekil görev"
--   "gunluk_frekans_sayisi>0 → günlük N frekanslı"
-- Haftalık kurala "1" yazmak → "günde 1 frekans" gibi sayılır → yanlış aggregate.
-- Haftalık kurallar zaten haftada N kez denk gelen günlerde 1 kez üretilir;
-- semantik olarak "tekil" karakterli → gfs=0 doğru.
--
-- Günlük branch için: COALESCE(r.gunluk_frekans_sayisi, 1) korunuyor (form NOT NULL
-- garantili ama defansif).
--
-- Ayrıca 069 ile yanlış yazılan 1 Haz'daki haftalık görevleri backfill ediyoruz.

CREATE OR REPLACE FUNCTION public.gece_gorev_uret(p_tarih date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  r              record;
  v_gun_no       int;
  v_uretilen     int := 0;
  v_atlanan      int := 0;
  v_duraklatilan int := 0;
  v_hafta_dolu   int := 0;
  v_mevcut       int;
  v_aktif_iso    timestamptz;
  v_hafta_basi   date;
  v_hafta_sonu   date;
  v_hafta_sayac  int;
  v_aktif_set    jsonb;
  v_vardiya_sayisi int;
  v_tum_ayar     jsonb;
  v_vardiya_no   int;
  v_gun_offset   int;
  v_kural_tarih  date;
  k              int;
  v_bas          text;
  v_bit          text;
  v_saat_str     text;
  v_duraklat_var int;
  v_firma_cache  jsonb := '{}'::jsonb;
BEGIN
  v_gun_no := EXTRACT(DOW FROM p_tarih)::int;
  v_hafta_basi := date_trunc('week', p_tarih::timestamp)::date;
  v_hafta_sonu := v_hafta_basi + 7;

  FOR r IN
    SELECT
      gk.*,
      l.firma_id AS l_firma_id,
      l.proje_id AS l_proje_id,
      get_ust_lokasyon_id(gk.lokasyon_id) AS l_ust_lokasyon_id
    FROM gorev_kurallari gk
    JOIN lokasyonlar l ON l.id = gk.lokasyon_id
    WHERE gk.aktif = true
      AND gk.baslangic_tarihi <= p_tarih
      AND (gk.bitis_tarihi IS NULL OR gk.bitis_tarihi >= p_tarih)
      AND v_gun_no = ANY(gk.aktif_gunler)
  LOOP
    IF NOT v_firma_cache ? r.firma_id::text THEN
      SELECT f.vardiya_sayisi, f.tum_vardiya_ayarlari
      INTO v_vardiya_sayisi, v_tum_ayar
      FROM firmalar f WHERE f.id = r.firma_id;

      v_vardiya_sayisi := COALESCE(v_vardiya_sayisi, 3);
      v_aktif_set := COALESCE(v_tum_ayar -> v_vardiya_sayisi::text, '[]'::jsonb);
      v_firma_cache := v_firma_cache || jsonb_build_object(
        r.firma_id::text, jsonb_build_object('sayisi', v_vardiya_sayisi, 'set', v_aktif_set)
      );
    ELSE
      v_aktif_set := v_firma_cache -> r.firma_id::text -> 'set';
    END IF;

    v_saat_str := to_char(r.aktif_olma_saati, 'HH24:MI');
    v_vardiya_no := NULL;
    v_gun_offset := 0;
    FOR k IN 0..(jsonb_array_length(v_aktif_set) - 1) LOOP
      v_bas := v_aktif_set -> k ->> 'baslangic';
      v_bit := v_aktif_set -> k ->> 'bitis';
      IF v_bit <= v_bas THEN
        IF v_saat_str >= v_bas THEN
          v_vardiya_no := (v_aktif_set -> k ->> 'no')::int;
          v_gun_offset := -1;
          EXIT;
        ELSIF v_saat_str < v_bit THEN
          v_vardiya_no := (v_aktif_set -> k ->> 'no')::int;
          v_gun_offset := 0;
          EXIT;
        END IF;
      ELSE
        IF v_saat_str >= v_bas AND v_saat_str < v_bit THEN
          v_vardiya_no := (v_aktif_set -> k ->> 'no')::int;
          v_gun_offset := 0;
          EXIT;
        END IF;
      END IF;
    END LOOP;

    v_kural_tarih := p_tarih + v_gun_offset;

    IF v_vardiya_no IS NOT NULL THEN
      SELECT count(*) INTO v_duraklat_var
      FROM kural_duraklatmalari kd
      WHERE kd.firma_id = r.firma_id
        AND kd.tanim = r.tanim
        AND kd.tarih = p_tarih
        AND kd.vardiya_no = v_vardiya_no
        AND (kd.proje_id = r.l_proje_id OR (kd.proje_id IS NULL AND r.l_proje_id IS NULL))
        AND kd.ust_lokasyon_id IS NOT NULL
        AND kd.ust_lokasyon_id = r.l_ust_lokasyon_id;
      IF v_duraklat_var > 0 THEN
        v_duraklatilan := v_duraklatilan + 1; CONTINUE;
      END IF;
    END IF;

    IF r.frekans_tipi = 'haftalik' THEN
      SELECT
        (SELECT count(*) FROM canli_gorevler
          WHERE kural_id = r.id
            AND DATE(aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul') >= v_hafta_basi
            AND DATE(aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul') <  v_hafta_sonu)
      + (SELECT count(*) FROM canli_gorevler_arsiv
          WHERE kural_id = r.id
            AND DATE(aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul') >= v_hafta_basi
            AND DATE(aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul') <  v_hafta_sonu)
      INTO v_hafta_sayac;

      IF v_hafta_sayac >= COALESCE(r.haftalik_frekans_sayisi, 1) THEN
        v_hafta_dolu := v_hafta_dolu + 1;
        CONTINUE;
      END IF;

      SELECT count(*) INTO v_mevcut
      FROM canli_gorevler
      WHERE kural_id = r.id
        AND DATE(aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul') = v_kural_tarih;
      IF v_mevcut = 0 THEN
        SELECT count(*) INTO v_mevcut
        FROM canli_gorevler_arsiv
        WHERE kural_id = r.id
          AND DATE(aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul') = v_kural_tarih;
      END IF;
      IF v_mevcut > 0 THEN
        v_atlanan := v_atlanan + 1; CONTINUE;
      END IF;

      v_aktif_iso := ((v_kural_tarih::timestamp + r.aktif_olma_saati) AT TIME ZONE 'Europe/Istanbul');

      -- Haftalık: gunluk_frekans_sayisi=0 (tekil semantik — günlük frekans toplamına girmesin)
      INSERT INTO canli_gorevler (
        firma_id, proje_id, tanim, lokasyon_id, atanan_kullanici_id,
        durum, aktif_olma_tarihi, olusturma_tarihi, olusturan_id,
        islemi_yapan_id, gunluk_frekans_sayisi, kural_id, frekans_tipi,
        vardiya_gunu
      ) VALUES (
        r.firma_id, r.l_proje_id, r.tanim, r.lokasyon_id, r.atanan_kullanici_id,
        'HAZIR', v_aktif_iso, now(), r.olusturan_id,
        r.olusturan_id, 0, r.id, 'haftalik',
        p_tarih
      );
      v_uretilen := v_uretilen + 1;

    ELSE
      SELECT count(*) INTO v_mevcut
      FROM canli_gorevler
      WHERE kural_id = r.id
        AND proje_id = r.l_proje_id
        AND DATE(aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul') = v_kural_tarih;

      IF v_mevcut = 0 THEN
        SELECT count(*) INTO v_mevcut
        FROM canli_gorevler_arsiv
        WHERE kural_id = r.id
          AND DATE(aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul') = v_kural_tarih;
      END IF;

      IF v_mevcut > 0 THEN
        v_atlanan := v_atlanan + 1; CONTINUE;
      END IF;

      FOR k IN 1..COALESCE(r.gunluk_frekans_sayisi, 1) LOOP
        v_aktif_iso := ((v_kural_tarih::timestamp + r.aktif_olma_saati) AT TIME ZONE 'Europe/Istanbul');
        INSERT INTO canli_gorevler (
          firma_id, proje_id, tanim, lokasyon_id, atanan_kullanici_id,
          durum, aktif_olma_tarihi, olusturma_tarihi, olusturan_id,
          islemi_yapan_id, gunluk_frekans_sayisi, kural_id, frekans_tipi,
          vardiya_gunu
        ) VALUES (
          r.firma_id, r.l_proje_id, r.tanim, r.lokasyon_id, r.atanan_kullanici_id,
          'HAZIR', v_aktif_iso, now(), r.olusturan_id,
          r.olusturan_id, COALESCE(r.gunluk_frekans_sayisi, 1), r.id, 'gunluk',
          p_tarih
        );
        v_uretilen := v_uretilen + 1;
      END LOOP;
    END IF;
  END LOOP;

  DELETE FROM kural_duraklatmalari WHERE tarih < p_tarih;

  RETURN jsonb_build_object(
    'ok',           true,
    'tarih',        p_tarih::text,
    'gun_no',       v_gun_no,
    'uretilen',     v_uretilen,
    'atlanan',      v_atlanan,
    'duraklatilan', v_duraklatilan,
    'hafta_dolu',   v_hafta_dolu
  );
END $function$;

-- Backfill: Migration 069 ile yanlış değerle yazılmış haftalık görevleri 0'a çek
UPDATE canli_gorevler
SET gunluk_frekans_sayisi = 0
WHERE frekans_tipi = 'haftalik'
  AND gunluk_frekans_sayisi <> 0;
