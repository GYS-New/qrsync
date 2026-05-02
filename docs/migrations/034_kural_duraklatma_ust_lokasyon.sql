-- ─────────────────────────────────────────────────────────────────────────
-- 034: Kural duraklatması üst lokasyon bazlı
--
-- Sorun: kural_duraklatmalari sadece (firma_id, proje_id, tanim, tarih, vardiya_no)
-- ile unique tutuluyordu. Aynı tanımlı kurallar birden fazla üst lokasyonda
-- olabildiğinden, MONTAJ duraklatınca DİSGS de duraklıyordu.
--
-- Çözüm: ust_lokasyon_id ekle, PG fonksiyonu bu alanla filtrele.
-- Eski kayıtlar (NULL ust_lokasyon_id) yeni mantıkta eşleşmez → INERT olur.
-- Kullanıcı UI'dan doğru üst lokasyonla yeniden duraklatabilir.
--
-- Risk: Mevcut 3 duraklatma kaydı etkisiz hale gelir (kullanıcı isteği:
-- "Mevcut duraklatmalara dokunma ben onları başlatırım").
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Yeni kolon (nullable, eski kayıtlar NULL kalır)
ALTER TABLE kural_duraklatmalari
  ADD COLUMN IF NOT EXISTS ust_lokasyon_id uuid REFERENCES lokasyonlar(id) ON DELETE CASCADE;

COMMENT ON COLUMN kural_duraklatmalari.ust_lokasyon_id IS
  'Duraklatmanın geçerli olacağı üst lokasyon (parent_id IS NULL olan lokasyon). '
  'NULL ise duraklatma INERT (hiçbir şey duraklatmaz) — geriye uyumluluk için.';

-- 2) Eski unique constraint'i kaldır (varsa)
ALTER TABLE kural_duraklatmalari
  DROP CONSTRAINT IF EXISTS kural_duraklatmalari_firma_id_proje_id_tanim_tarih_vardiya_no_key;

-- 3) Yeni unique constraint (ust_lokasyon_id dahil)
ALTER TABLE kural_duraklatmalari
  ADD CONSTRAINT kural_duraklatmalari_unique_ust_lok
    UNIQUE NULLS NOT DISTINCT (firma_id, proje_id, ust_lokasyon_id, tanim, tarih, vardiya_no);

-- 4) Sorgu performansı için index
CREATE INDEX IF NOT EXISTS idx_kural_duraklatmalari_ust_lokasyon
  ON kural_duraklatmalari (ust_lokasyon_id, tarih)
  WHERE ust_lokasyon_id IS NOT NULL;

-- 5) Üst lokasyonu bulan helper SQL fonksiyonu
-- (parent_id IS NULL olan ataya kadar gider, döngü koruması yok ama
-- hiyerarşi güvenli varsayılıyor — UI lokasyon hiyerarşisini koruyor)
CREATE OR REPLACE FUNCTION get_ust_lokasyon_id(p_lok_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  WITH RECURSIVE up AS (
    SELECT id, parent_id FROM lokasyonlar WHERE id = p_lok_id
    UNION ALL
    SELECT l.id, l.parent_id FROM lokasyonlar l
    INNER JOIN up ON l.id = up.parent_id
  )
  SELECT id FROM up WHERE parent_id IS NULL LIMIT 1
$$;

COMMENT ON FUNCTION get_ust_lokasyon_id IS
  'Verilen lokasyon id''sinin en üst (root, parent_id IS NULL) atasını döner. '
  'gece_gorev_uret duraklatma filtresinde kullanılır.';

-- 6) gece_gorev_uret fonksiyonunu yeniden tanımla
-- (014 numaralı dosyadan alınan tam tanım, sadece duraklatma sorgusu güncellendi)
CREATE OR REPLACE FUNCTION gece_gorev_uret(p_tarih date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
      get_ust_lokasyon_id(gk.lokasyon_id) AS l_ust_lokasyon_id  -- YENİ
    FROM gorev_kurallari gk
    JOIN lokasyonlar l ON l.id = gk.lokasyon_id
    WHERE gk.aktif = true
      AND gk.baslangic_tarihi <= p_tarih
      AND (gk.bitis_tarihi IS NULL OR gk.bitis_tarihi >= p_tarih)
      AND v_gun_no = ANY(gk.aktif_gunler)
  LOOP
    -- Vardiya tespiti
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

    -- ── DURAKLATMA KONTROLÜ — ÜST LOKASYON BAZLI (DEĞİŞEN KISIM) ──
    IF v_vardiya_no IS NOT NULL THEN
      SELECT count(*) INTO v_duraklat_var
      FROM kural_duraklatmalari kd
      WHERE kd.firma_id = r.firma_id
        AND kd.tanim = r.tanim
        AND kd.tarih = p_tarih
        AND kd.vardiya_no = v_vardiya_no
        AND (kd.proje_id = r.l_proje_id OR (kd.proje_id IS NULL AND r.l_proje_id IS NULL))
        AND kd.ust_lokasyon_id IS NOT NULL  -- NULL = INERT (eski kayıtlar atlanır)
        AND kd.ust_lokasyon_id = r.l_ust_lokasyon_id;
      IF v_duraklat_var > 0 THEN
        v_duraklatilan := v_duraklatilan + 1; CONTINUE;
      END IF;
    END IF;

    -- ── HAFTALIK KURAL ──
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

    -- ── GÜNLÜK KURAL ──
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
    'hafta_dolu',   v_hafta_dolu
  );
END $$;
