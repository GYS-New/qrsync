-- ─────────────────────────────────────────────────────────────────────────
-- 014: gece_gorev_uret + gece_tam_dongu PG fonksiyonlarını yeniden yaz
--   1) Haftalık kural desteği (frekans_tipi + hafta sayaçlı üretim)
--   2) Durum geçiş süreleri firmalar/projeler tablosundan okunur
--      (ESKIDEN hardcoded 12/12 idi — bu mevcut bir bug'ı da düzeltir)
--   3) frekans_tipi="haftalik" olan görevler için haftalık süreler geçerli;
--      haftalık süre NULL ise günlük değere fallback yapılır.
-- ─────────────────────────────────────────────────────────────────────────

-- ─── YARDIMCI FONKSIYON: efektif durum süresi ────────────────────────────
CREATE OR REPLACE FUNCTION get_efektif_durum_sure(
  p_firma_id uuid,
  p_proje_id uuid,
  p_tip text
)
RETURNS TABLE(acik_bekleme_saat int, bekleme_gecmis_saat int)
LANGUAGE sql
STABLE
AS $$
  WITH
    f AS (SELECT acik_bekleme_saat, bekleme_gecmis_saat,
                 haftalik_acik_bekleme_saat, haftalik_bekleme_gecmis_saat
          FROM firmalar WHERE id = p_firma_id),
    p AS (SELECT acik_bekleme_saat, bekleme_gecmis_saat,
                 haftalik_acik_bekleme_saat, haftalik_bekleme_gecmis_saat
          FROM projeler WHERE id = p_proje_id)
  SELECT
    CASE WHEN COALESCE(p_tip, 'gunluk') = 'haftalik' THEN
      COALESCE(
        (SELECT haftalik_acik_bekleme_saat FROM p),
        (SELECT haftalik_acik_bekleme_saat FROM f),
        (SELECT acik_bekleme_saat FROM p),
        (SELECT acik_bekleme_saat FROM f),
        8
      )
    ELSE
      COALESCE(
        (SELECT acik_bekleme_saat FROM p),
        (SELECT acik_bekleme_saat FROM f),
        8
      )
    END AS acik_bekleme_saat,
    CASE WHEN COALESCE(p_tip, 'gunluk') = 'haftalik' THEN
      COALESCE(
        (SELECT haftalik_bekleme_gecmis_saat FROM p),
        (SELECT haftalik_bekleme_gecmis_saat FROM f),
        (SELECT bekleme_gecmis_saat FROM p),
        (SELECT bekleme_gecmis_saat FROM f),
        12
      )
    ELSE
      COALESCE(
        (SELECT bekleme_gecmis_saat FROM p),
        (SELECT bekleme_gecmis_saat FROM f),
        12
      )
    END AS bekleme_gecmis_saat
$$;


-- ─── FONKSIYON: gece_gorev_uret — YENIDEN YAZILDI ────────────────────────
CREATE OR REPLACE FUNCTION gece_gorev_uret(p_tarih date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gun_no       int;
  v_uretilen     int := 0;
  v_atlanan      int := 0;
  v_duraklatilan int := 0;
  v_hafta_dolu   int := 0;
  v_hata         text;
  r              RECORD;
  v_aktif_iso    timestamptz;
  v_mevcut       int;
  v_hafta_sayac  int;
  v_hafta_basi   date;
  v_hafta_sonu   date;
  k              int;
  v_vardiya_sayisi int;
  v_tum_ayar     jsonb;
  v_aktif_set    jsonb;
  v_vardiya_no   int;
  v_bas          text;
  v_bit          text;
  v_saat_str     text;
  v_duraklat_var int;
  v_firma_cache  jsonb := '{}'::jsonb;
BEGIN
  v_gun_no := EXTRACT(DOW FROM p_tarih)::int;
  -- Bu haftanın başlangıcı (Pazartesi)
  v_hafta_basi := date_trunc('week', p_tarih::timestamp)::date;
  v_hafta_sonu := v_hafta_basi + 7;

  FOR r IN
    SELECT
      gk.*,
      l.firma_id AS l_firma_id,
      l.proje_id AS l_proje_id
    FROM gorev_kurallari gk
    JOIN lokasyonlar l ON l.id = gk.lokasyon_id
    WHERE gk.aktif = true
      AND gk.baslangic_tarihi <= p_tarih
      AND (gk.bitis_tarihi IS NULL OR gk.bitis_tarihi >= p_tarih)
      AND v_gun_no = ANY(gk.aktif_gunler)
  LOOP
    -- ── DURAKLATMA KONTROLÜ (günlük mantık ile aynı, haftalıkta da aktif) ──
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
    FOR k IN 0..(jsonb_array_length(v_aktif_set) - 1) LOOP
      v_bas := v_aktif_set -> k ->> 'baslangic';
      v_bit := v_aktif_set -> k ->> 'bitis';
      IF v_bit <= v_bas THEN
        IF v_saat_str >= v_bas OR v_saat_str < v_bit THEN
          v_vardiya_no := (v_aktif_set -> k ->> 'no')::int; EXIT;
        END IF;
      ELSE
        IF v_saat_str >= v_bas AND v_saat_str < v_bit THEN
          v_vardiya_no := (v_aktif_set -> k ->> 'no')::int; EXIT;
        END IF;
      END IF;
    END LOOP;

    IF v_vardiya_no IS NOT NULL THEN
      SELECT count(*) INTO v_duraklat_var
      FROM kural_duraklatmalari kd
      WHERE kd.firma_id = r.firma_id AND kd.tanim = r.tanim
        AND kd.tarih = p_tarih AND kd.vardiya_no = v_vardiya_no
        AND (kd.proje_id = r.l_proje_id OR (kd.proje_id IS NULL AND r.l_proje_id IS NULL));
      IF v_duraklat_var > 0 THEN
        v_duraklatilan := v_duraklatilan + 1; CONTINUE;
      END IF;
    END IF;

    -- ════════════════════════════════════════════════════════════════════
    -- HAFTALIK KURAL: hafta sayacı hedefe ulaşıldıysa atla
    -- ════════════════════════════════════════════════════════════════════
    IF r.frekans_tipi = 'haftalik' THEN
      -- Bu hafta bu kural için kaç görev üretildi? (canlı + arşiv)
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

      -- Bugün bu kural için zaten üretilmişse atla (aynı gün 2 haftalık görev olmasın)
      SELECT count(*) INTO v_mevcut
      FROM canli_gorevler
      WHERE kural_id = r.id
        AND DATE(aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul') = p_tarih;
      IF v_mevcut = 0 THEN
        SELECT count(*) INTO v_mevcut
        FROM canli_gorevler_arsiv
        WHERE kural_id = r.id
          AND DATE(aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul') = p_tarih;
      END IF;
      IF v_mevcut > 0 THEN
        v_atlanan := v_atlanan + 1; CONTINUE;
      END IF;

      -- Üret: haftalıkta günde 1 adet
      v_aktif_iso := ((p_tarih::timestamp + r.aktif_olma_saati) AT TIME ZONE 'Europe/Istanbul');

      INSERT INTO canli_gorevler (
        firma_id, proje_id, tanim, lokasyon_id, atanan_kullanici_id,
        durum, aktif_olma_tarihi, olusturma_tarihi, olusturan_id,
        islemi_yapan_id, gunluk_frekans_sayisi, kural_id, frekans_tipi
      ) VALUES (
        r.firma_id, r.l_proje_id, r.tanim, r.lokasyon_id, r.atanan_kullanici_id,
        'HAZIR', v_aktif_iso, now(), r.olusturan_id,
        r.olusturan_id, NULL, r.id, 'haftalik'
      );
      v_uretilen := v_uretilen + 1;

    -- ════════════════════════════════════════════════════════════════════
    -- GÜNLÜK KURAL: mevcut mantık (idempotent, gunluk_frekans_sayisi kez)
    -- ════════════════════════════════════════════════════════════════════
    ELSE
      SELECT count(*) INTO v_mevcut
      FROM canli_gorevler
      WHERE kural_id = r.id
        AND proje_id = r.l_proje_id
        AND DATE(aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul') = p_tarih;

      IF v_mevcut = 0 THEN
        SELECT count(*) INTO v_mevcut
        FROM canli_gorevler_arsiv
        WHERE kural_id = r.id
          AND DATE(aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul') = p_tarih;
      END IF;

      IF v_mevcut > 0 THEN
        v_atlanan := v_atlanan + 1; CONTINUE;
      END IF;

      FOR k IN 1..COALESCE(r.gunluk_frekans_sayisi, 1) LOOP
        v_aktif_iso := ((p_tarih::timestamp + r.aktif_olma_saati) AT TIME ZONE 'Europe/Istanbul');
        INSERT INTO canli_gorevler (
          firma_id, proje_id, tanim, lokasyon_id, atanan_kullanici_id,
          durum, aktif_olma_tarihi, olusturma_tarihi, olusturan_id,
          islemi_yapan_id, gunluk_frekans_sayisi, kural_id, frekans_tipi
        ) VALUES (
          r.firma_id, r.l_proje_id, r.tanim, r.lokasyon_id, r.atanan_kullanici_id,
          'HAZIR', v_aktif_iso, now(), r.olusturan_id,
          r.olusturan_id, r.gunluk_frekans_sayisi, r.id, 'gunluk'
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
    'hafta_dolu',   v_hafta_dolu,
    'zaman',        now()
  );
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_hata = MESSAGE_TEXT;
  RETURN jsonb_build_object('ok', false, 'hata', v_hata);
END;
$$;


-- ─── FONKSIYON: gece_tam_dongu — YENIDEN YAZILDI ─────────────────────────
CREATE OR REPLACE FUNCTION gece_tam_dongu()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_arsiv_sonuc   jsonb;
  v_uretim_sonuc  jsonb;
  v_durum_sonuc   jsonb;
  v_now           timestamptz := now();
  v_gecti         int := 0;
  v_aktive        int := 0;
  v_beklemeye     int := 0;
BEGIN
  -- ── ADIM 1: HAZIR → ACIK (aktif_olma_tarihi geçmişse) ────────────────
  UPDATE canli_gorevler
  SET durum = 'ACIK', durum_degisim_tarihi = v_now
  WHERE durum = 'HAZIR' AND aktif_olma_tarihi <= v_now;
  GET DIAGNOSTICS v_aktive = ROW_COUNT;

  -- ── ADIM 2: ACIK → BEKLEMEDE (tipine göre efektif süre) ──────────────
  -- Efektif süre: görevin kendi frekans_tipi + firma/proje ayarları
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

  -- ── ADIM 3: BEKLEMEDE → ZAMANI_GECMIS ────────────────────────────────
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

  -- ── ADIM 4: Terminal görevleri arşivle ───────────────────────────────
  v_arsiv_sonuc := gun_sonu_arsivle();

  -- ── ADIM 5: Yeni günün görevlerini üret ──────────────────────────────
  v_uretim_sonuc := gece_gorev_uret(CURRENT_DATE);

  RETURN jsonb_build_object(
    'ok',          true,
    'durum_gecis', v_durum_sonuc,
    'arsiv',       v_arsiv_sonuc,
    'uretim',      v_uretim_sonuc,
    'zaman',       v_now
  );
END;
$$;
