-- 095: PG fonksiyonlarını proje override > firma fallback ile uyumlu hale getir
--
-- Migration 094 sonrası projeler tablosuna da vardiya kolonları eklendi. Lib/API
-- tarafı getEffectiveVardiya() helper'ı ile her okumayı proje override pattern'ine
-- çevirdik. Ama DB-side PG fonksiyonları (gece_gorev_uret, vardiya_gunu_hesapla)
-- hâlâ direkt firmalar tablosundan okuyordu. Çanakkale gibi farklı vardiyalı
-- projelerde:
--   - gece_gorev_uret kural lokasyonunun projesindeki override'ı yok sayar →
--     yanlış vardiya_no + yanlış sarkan offset + yanlış duraklatma kontrolü
--   - vardiya_gunu_hesapla sadece firma alır → yanlış vardiya_gunu
--
-- Bu migration:
--   1. get_efektif_vardiya(p_firma_id, p_proje_id) helper fn'i ekler
--      (mergeVardiyaRows() SQL karşılığı)
--   2. vardiya_gunu_hesapla'ya opsiyonel p_proje_id parametresi ekler
--   3. gece_gorev_uret cache key'ini firma_id'den (firma_id, proje_id)
--      kombosuna çevirir ve get_efektif_vardiya kullanır
--
-- get_efektif_durum_sure (mig 014) zaten proje override destekliyor — dokunma.
-- gun_ici_durum_guncelle (mig 071) onu çağırıyor — dolaylı doğru.

-- ─── 1) Helper: efektif vardiya (proje override > firma fallback) ─────────
CREATE OR REPLACE FUNCTION public.get_efektif_vardiya(
  p_firma_id uuid,
  p_proje_id uuid DEFAULT NULL
)
RETURNS TABLE(vardiya_sayisi int, tum_vardiya_ayarlari jsonb)
LANGUAGE sql STABLE
AS $$
  WITH
    f AS (SELECT vardiya_sayisi, tum_vardiya_ayarlari
          FROM firmalar WHERE id = p_firma_id),
    p AS (SELECT vardiya_sayisi, tum_vardiya_ayarlari
          FROM projeler WHERE id = p_proje_id)
  SELECT
    COALESCE((SELECT vardiya_sayisi FROM p), (SELECT vardiya_sayisi FROM f)),
    COALESCE((SELECT tum_vardiya_ayarlari FROM p), (SELECT tum_vardiya_ayarlari FROM f))
$$;

COMMENT ON FUNCTION public.get_efektif_vardiya(uuid, uuid) IS
  'Mig 094 + 095: Bir firma+proje için efektif vardiya ayarları. Önce projeden, sonra firmadan. lib/vardiya/getEffective.ts SQL karşılığı.';

-- ─── 2) vardiya_gunu_hesapla — proje override desteği ────────────────────
-- Eski signature (firma+iso) DROP edilip yenisi yazılıyor.
-- Mig 068'de backfill için kullanıldı, runtime'da PG-side çağrısı yok.
-- TS-side aynı isimli vardiyaGunuHesapla (lib/gorev/vardiyaGunu.ts) ayrı, etkilenmez.
DROP FUNCTION IF EXISTS public.vardiya_gunu_hesapla(timestamptz, uuid);

CREATE OR REPLACE FUNCTION public.vardiya_gunu_hesapla(
  p_aktif_iso timestamptz,
  p_firma_id  uuid,
  p_proje_id  uuid DEFAULT NULL
) RETURNS date
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_tr_dt          timestamptz;
  v_tr_date        date;
  v_tr_saat        text;
  v_vardiya_sayisi int;
  v_tum_ayar       jsonb;
  v_aktif_set      jsonb;
  k                int;
  v_bas            text;
  v_bit            text;
BEGIN
  IF p_aktif_iso IS NULL THEN RETURN NULL; END IF;
  v_tr_dt   := p_aktif_iso AT TIME ZONE 'Europe/Istanbul';
  v_tr_date := v_tr_dt::date;
  v_tr_saat := to_char(v_tr_dt, 'HH24:MI');

  SELECT ev.vardiya_sayisi, ev.tum_vardiya_ayarlari
  INTO v_vardiya_sayisi, v_tum_ayar
  FROM get_efektif_vardiya(p_firma_id, p_proje_id) ev;

  IF v_tum_ayar IS NULL OR v_vardiya_sayisi IS NULL THEN RETURN v_tr_date; END IF;
  v_aktif_set := v_tum_ayar -> v_vardiya_sayisi::text;
  IF v_aktif_set IS NULL THEN RETURN v_tr_date; END IF;

  FOR k IN 0..(jsonb_array_length(v_aktif_set) - 1) LOOP
    v_bas := v_aktif_set -> k ->> 'baslangic';
    v_bit := v_aktif_set -> k ->> 'bitis';
    -- Sarkan vardiya (örn V1 23:30-07:30) + saat evening half'ta
    -- (örn 23:35 >= 23:30) → bu görev sonraki günün vardiyası
    IF v_bit <= v_bas AND v_tr_saat >= v_bas THEN
      RETURN v_tr_date + 1;
    END IF;
  END LOOP;
  RETURN v_tr_date;
END $$;

-- ─── 3) gece_gorev_uret — proje override (cache key firma+proje) ─────────
-- 071'in tüm semantiği korunur, sadece vardiya okuma noktası değişir:
-- v_firma_cache key'i 'firma_id' yerine 'firma_id|proje_id' olur ve
-- get_efektif_vardiya() çağrılır.
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
  v_cache        jsonb := '{}'::jsonb;
  v_cache_key    text;
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
    -- Cache key: firma+proje. Çanakkale gibi farklı vardiyalı projelerde
    -- her firma+proje kombosu kendi ayarına sahip olur.
    v_cache_key := r.firma_id::text || '|' || COALESCE(r.l_proje_id::text, '');
    IF NOT v_cache ? v_cache_key THEN
      SELECT ev.vardiya_sayisi, ev.tum_vardiya_ayarlari
      INTO v_vardiya_sayisi, v_tum_ayar
      FROM get_efektif_vardiya(r.firma_id, r.l_proje_id) ev;

      v_vardiya_sayisi := COALESCE(v_vardiya_sayisi, 3);
      v_aktif_set := COALESCE(v_tum_ayar -> v_vardiya_sayisi::text, '[]'::jsonb);
      v_cache := v_cache || jsonb_build_object(
        v_cache_key, jsonb_build_object('sayisi', v_vardiya_sayisi, 'set', v_aktif_set)
      );
    ELSE
      v_aktif_set := v_cache -> v_cache_key -> 'set';
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

      INSERT INTO canli_gorevler (
        firma_id, proje_id, tanim, lokasyon_id, atanan_kullanici_id,
        durum, aktif_olma_tarihi, olusturma_tarihi, olusturan_id,
        islemi_yapan_id, gunluk_frekans_sayisi, kural_id, frekans_tipi,
        vardiya_gunu, acik_bekleme_saat, bekleme_gecmis_saat
      ) VALUES (
        r.firma_id, r.l_proje_id, r.tanim, r.lokasyon_id, r.atanan_kullanici_id,
        'HAZIR', v_aktif_iso, now(), r.olusturan_id,
        r.olusturan_id, 0, r.id, 'haftalik',
        p_tarih, r.acik_bekleme_saat, r.bekleme_gecmis_saat
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
          vardiya_gunu, acik_bekleme_saat, bekleme_gecmis_saat
        ) VALUES (
          r.firma_id, r.l_proje_id, r.tanim, r.lokasyon_id, r.atanan_kullanici_id,
          'HAZIR', v_aktif_iso, now(), r.olusturan_id,
          r.olusturan_id, COALESCE(r.gunluk_frekans_sayisi, 1), r.id, 'gunluk',
          p_tarih, r.acik_bekleme_saat, r.bekleme_gecmis_saat
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
