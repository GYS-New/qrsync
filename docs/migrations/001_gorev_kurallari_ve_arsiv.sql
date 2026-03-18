-- ══════════════════════════════════════════════════════════════════════════
-- QRSync — Görev Kuralları & Arşiv Sistemi Migration
-- Supabase SQL Editor'da tek seferde çalıştırılır.
-- ══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ENUM: canli_gorev_durum genişletildi
-- ─────────────────────────────────────────────────────────────────────────
-- ZAMANI_GECMIS ve SILINDI mevcut tabloda kullanılıyorsa enum'a ekle
DO $$ BEGIN
  ALTER TYPE canli_gorev_durum_enum ADD VALUE IF NOT EXISTS 'ZAMANI_GECMIS';
  ALTER TYPE canli_gorev_durum_enum ADD VALUE IF NOT EXISTS 'SILINDI';
EXCEPTION WHEN undefined_object THEN
  NULL; -- enum yok, durum text olarak tutuluyorsa bu blok atlanır
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. TABLO: gorev_kurallari
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS gorev_kurallari (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id                uuid NOT NULL REFERENCES firmalar(id) ON DELETE CASCADE,
  lokasyon_id             uuid NOT NULL REFERENCES lokasyonlar(id) ON DELETE CASCADE,
  tanim                   text NOT NULL,
  -- Hangi günler: 0=Pazar 1=Pazartesi ... 6=Cumartesi (JS Date.getDay() ile uyumlu)
  aktif_gunler            int[] NOT NULL CHECK (cardinality(aktif_gunler) > 0),
  gunluk_frekans_sayisi   int  NOT NULL CHECK (gunluk_frekans_sayisi BETWEEN 1 AND 24),
  aktif_olma_saati        time NOT NULL DEFAULT '08:00',          -- her gün hangi saatte açılacak
  baslangic_tarihi        date NOT NULL DEFAULT CURRENT_DATE,
  bitis_tarihi            date,                                    -- NULL = süresiz
  atanan_kullanici_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  olusturan_id            uuid REFERENCES users(id) ON DELETE SET NULL,
  -- Raporlama için orijinal import verisini koru
  kaynak                  text DEFAULT 'manuel',                   -- 'manuel' | 'import'
  aktif                   boolean NOT NULL DEFAULT true,
  kayit_tarihi            timestamptz NOT NULL DEFAULT now(),
  guncelleme_tarihi       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gorev_kurallari_firma    ON gorev_kurallari(firma_id);
CREATE INDEX IF NOT EXISTS idx_gorev_kurallari_lokasyon ON gorev_kurallari(lokasyon_id);
CREATE INDEX IF NOT EXISTS idx_gorev_kurallari_aktif    ON gorev_kurallari(aktif) WHERE aktif = true;

COMMENT ON TABLE gorev_kurallari IS
  'Frekans tabanlı görev şablonları. Cron job her gece bu kurallardan günlük canli_gorevler üretir.';
COMMENT ON COLUMN gorev_kurallari.aktif_gunler IS
  '0=Pazar,1=Pzt,2=Sal,3=Çar,4=Per,5=Cum,6=Cmt — JS getDay() ile uyumlu';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. TABLO: canli_gorevler_arsiv
-- canli_gorevler ile birebir aynı yapı + arsivleme alanları
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS canli_gorevler_arsiv (
  -- Orijinal canli_gorevler alanları (aynı)
  id                          uuid PRIMARY KEY,
  firma_id                    uuid NOT NULL,
  tanim                       text NOT NULL,
  lokasyon_id                 uuid,
  atanan_kullanici_id         uuid,
  durum                       text NOT NULL,
  aktif_olma_tarihi           timestamptz,
  olusturma_tarihi            timestamptz,
  olusturan_id                uuid,
  baslatilma_tarihi           timestamptz,
  baslatan_kullanici_id       uuid,
  tamamlanma_tarihi           timestamptz,
  tamamlayan_kullanici_id     uuid,
  islemi_yapan_id             uuid,
  tamamlanma_suresi_saniye    int,
  iptal_eden_id               uuid,
  iptal_tarihi                timestamptz,
  durum_degisim_tarihi        timestamptz,
  gunluk_frekans_sayisi       int DEFAULT 0,
  -- Yeni alan: hangi kuraldan üretildi (raporlama için)
  kural_id                    uuid REFERENCES gorev_kurallari(id) ON DELETE SET NULL,
  -- Arşivleme meta
  arsiv_tarihi                timestamptz NOT NULL DEFAULT now(),
  arsiv_nedeni                text         -- 'gun_sonu' | 'manuel' | 'lokasyon_silindi'
);

CREATE INDEX IF NOT EXISTS idx_arsiv_firma       ON canli_gorevler_arsiv(firma_id);
CREATE INDEX IF NOT EXISTS idx_arsiv_lokasyon    ON canli_gorevler_arsiv(lokasyon_id);
CREATE INDEX IF NOT EXISTS idx_arsiv_durum       ON canli_gorevler_arsiv(durum);
CREATE INDEX IF NOT EXISTS idx_arsiv_aktif_tarih ON canli_gorevler_arsiv(aktif_olma_tarihi);
CREATE INDEX IF NOT EXISTS idx_arsiv_kural       ON canli_gorevler_arsiv(kural_id);

COMMENT ON TABLE canli_gorevler_arsiv IS
  'Tamamlanmış/süresi geçmiş/iptal edilmiş görevlerin kalıcı arşivi. Raporlar bu tablodan üretilir.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. canli_gorevler tablosuna kural_id kolonu ekle
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE canli_gorevler
  ADD COLUMN IF NOT EXISTS kural_id uuid REFERENCES gorev_kurallari(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_canli_gorevler_kural ON canli_gorevler(kural_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. FONKSİYON: gun_sonu_arsivle()
-- Terminal durumdaki görevleri arşive taşır.
-- Terminal durumlar: TAMAMLANDI, ZAMANINDA_YAPILAMAYAN, ZAMANI_GECMIS, IPTAL, SILINDI
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gun_sonu_arsivle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_arsivlenen int := 0;
  v_hata       text;
BEGIN
  -- Terminal durumdaki tüm görevleri arşive kopyala
  WITH arsive_tasinanlar AS (
    INSERT INTO canli_gorevler_arsiv (
      id, firma_id, tanim, lokasyon_id, atanan_kullanici_id, durum,
      aktif_olma_tarihi, olusturma_tarihi, olusturan_id,
      baslatilma_tarihi, baslatan_kullanici_id,
      tamamlanma_tarihi, tamamlayan_kullanici_id,
      islemi_yapan_id, tamamlanma_suresi_saniye,
      iptal_eden_id, iptal_tarihi, durum_degisim_tarihi,
      gunluk_frekans_sayisi, kural_id,
      arsiv_tarihi, arsiv_nedeni
    )
    SELECT
      id, firma_id, tanim, lokasyon_id, atanan_kullanici_id, durum,
      aktif_olma_tarihi, olusturma_tarihi, olusturan_id,
      baslatilma_tarihi, baslatan_kullanici_id,
      tamamlanma_tarihi, tamamlayan_kullanici_id,
      islemi_yapan_id, tamamlanma_suresi_saniye,
      iptal_eden_id, iptal_tarihi, durum_degisim_tarihi,
      COALESCE(gunluk_frekans_sayisi, 0), kural_id,
      now(), 'gun_sonu'
    FROM canli_gorevler
    WHERE durum IN ('TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS', 'IPTAL', 'SILINDI')
    -- Çakışma varsa güncelleme yapma (idempotent)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  ),
  -- Arşive giden kayıtları aktif tablodan sil
  silme AS (
    DELETE FROM canli_gorevler
    WHERE id IN (SELECT id FROM arsive_tasinanlar)
    RETURNING id
  )
  SELECT count(*) INTO v_arsivlenen FROM silme;

  RETURN jsonb_build_object(
    'ok', true,
    'arsivlenen', v_arsivlenen,
    'zaman', now()
  );
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_hata = MESSAGE_TEXT;
  RETURN jsonb_build_object('ok', false, 'hata', v_hata);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. FONKSİYON: gece_gorev_uret(p_tarih date)
-- Verilen tarih için aktif kurallara göre görev üretir.
-- Aynı kural+tarih için zaten görev varsa üretmez (idempotent).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gece_gorev_uret(p_tarih date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gun_no      int;   -- 0=Pazar...6=Cmt
  v_uretilen    int := 0;
  v_atlanan     int := 0;
  v_hata        text;
  r             RECORD;
  v_saat        text;
  v_aktif_iso   timestamptz;
  v_mevcut      int;
  k             int;
BEGIN
  -- Verilen tarihin gün numarası (0=Pazar, JS ile uyumlu)
  -- PostgreSQL EXTRACT DOW: 0=Pazar,1=Pzt...6=Cmt — JS ile aynı
  v_gun_no := EXTRACT(DOW FROM p_tarih)::int;

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
      -- Bu kural bu gün çalışıyor mu?
      AND v_gun_no = ANY(gk.aktif_gunler)
  LOOP
    -- Bu kural için bugün zaten aktif görev var mı? (idempotent)
    SELECT count(*) INTO v_mevcut
    FROM canli_gorevler
    WHERE kural_id = r.id
      AND proje_id = r.l_proje_id
      -- Gün karşılaştırması TRT'e göre yapılmalı (aksi halde gün sınırında kayar)
      AND DATE(aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul') = p_tarih;

    -- Arşivde de kontrol et (çift üretimi önle)
    IF v_mevcut = 0 THEN
      SELECT count(*) INTO v_mevcut
      FROM canli_gorevler_arsiv
      WHERE kural_id = r.id
        AND DATE(aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul') = p_tarih;
    END IF;

    IF v_mevcut > 0 THEN
      v_atlanan := v_atlanan + 1;
      CONTINUE;
    END IF;

    -- gunluk_frekans_sayisi kadar görev üret
    FOR k IN 1..r.gunluk_frekans_sayisi LOOP
      -- aktif_olma_saati, kullanıcı beklentisine göre TRT saatidir.
      -- timestamptz üretimini "Europe/Istanbul" üzerinden yap ki UTC'ye doğru çevrilsin.
      v_aktif_iso := ((p_tarih::timestamp + r.aktif_olma_saati) AT TIME ZONE 'Europe/Istanbul');

      INSERT INTO canli_gorevler (
        firma_id,
        proje_id,
        tanim,
        lokasyon_id,
        atanan_kullanici_id,
        durum,
        aktif_olma_tarihi,
        olusturma_tarihi,
        olusturan_id,
        islemi_yapan_id,
        gunluk_frekans_sayisi,
        kural_id
      ) VALUES (
        r.firma_id,
        r.l_proje_id,
        r.tanim,
        r.lokasyon_id,
        r.atanan_kullanici_id,
        'HAZIR',
        v_aktif_iso,
        now(),
        r.olusturan_id,
        r.olusturan_id,
        r.gunluk_frekans_sayisi,
        r.id
      );

      v_uretilen := v_uretilen + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',       true,
    'tarih',    p_tarih::text,
    'gun_no',   v_gun_no,
    'uretilen', v_uretilen,
    'atlanan',  v_atlanan,
    'zaman',    now()
  );
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_hata = MESSAGE_TEXT;
  RETURN jsonb_build_object('ok', false, 'hata', v_hata);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. FONKSİYON: gece_tam_dongu()
-- Her gece sırayla çalıştırılacak ana fonksiyon:
--   1. Durum geçişlerini uygula (HAZIR→ACIK, ACIK→BEKLEMEDE vb.)
--   2. Terminal görevleri arşivle
--   3. Yeni günün görevlerini üret
-- ─────────────────────────────────────────────────────────────────────────
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
  -- Durum geçiş sabitleri (liveStatus.ts ile senkron)
  v_acik_bekleme_saat   int := 12;
  v_bekleme_gecmis_saat int := 12;
  v_gecti                int := 0;
  v_aktive               int := 0;
  v_beklemeye            int := 0;
BEGIN
  -- ── ADIM 1: Durum geçişleri ──────────────────────────────────────────
  -- HAZIR → ACIK (aktif_olma_tarihi geçmişse)
  UPDATE canli_gorevler
  SET durum = 'ACIK', durum_degisim_tarihi = v_now
  WHERE durum = 'HAZIR' AND aktif_olma_tarihi <= v_now;
  GET DIAGNOSTICS v_aktive = ROW_COUNT;

  -- ACIK → BEKLEMEDE (12 saatten uzun süredir açık)
  UPDATE canli_gorevler
  SET durum = 'BEKLEMEDE', durum_degisim_tarihi = v_now
  WHERE durum = 'ACIK'
    AND aktif_olma_tarihi <= (v_now - (v_acik_bekleme_saat || ' hours')::interval);
  GET DIAGNOSTICS v_beklemeye = ROW_COUNT;

  -- BEKLEMEDE → ZAMANI_GECMIS (12 saat bekleme sonrası)
  UPDATE canli_gorevler
  SET durum = 'ZAMANI_GECMIS', durum_degisim_tarihi = v_now
  WHERE durum = 'BEKLEMEDE'
    AND durum_degisim_tarihi <= (v_now - (v_bekleme_gecmis_saat || ' hours')::interval);
  GET DIAGNOSTICS v_gecti = ROW_COUNT;

  v_durum_sonuc := jsonb_build_object(
    'aktive', v_aktive,
    'beklemeye', v_beklemeye,
    'zamani_gecmis', v_gecti
  );

  -- ── ADIM 2: Terminal görevleri arşivle ───────────────────────────────
  v_arsiv_sonuc := gun_sonu_arsivle();

  -- ── ADIM 3: Yeni günün görevlerini üret (bugün için) ─────────────────
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

-- ─────────────────────────────────────────────────────────────────────────
-- 8. pg_cron ZAMANLAMASI
-- Supabase'de pg_cron extension aktifse aşağıdaki satır çalışır.
-- Dashboard > Database > Extensions > pg_cron aktif edin, sonra çalıştırın.
-- ─────────────────────────────────────────────────────────────────────────
-- Her gece 00:01'de Türkiye saati = UTC 21:01 önceki gün
-- (Türkiye UTC+3, yani gece yarısı 00:01 TRT = 21:01 UTC önceki gün)
SELECT cron.schedule(
  'qrsync-gece-dongu',          -- job adı (unique)
  '1 21 * * *',                 -- UTC 21:01 = Türkiye 00:01
  'SELECT gece_tam_dongu()'
);

-- ─────────────────────────────────────────────────────────────────────────
-- 9. RLS POLİTİKALARI
-- ─────────────────────────────────────────────────────────────────────────
-- Mevcut politikaları drop et
DROP POLICY IF EXISTS "gorev_kurallari_okuma" ON gorev_kurallari;
DROP POLICY IF EXISTS "gorev_kurallari_yazma" ON gorev_kurallari;
DROP POLICY IF EXISTS "arsiv_okuma" ON canli_gorevler_arsiv;
DROP POLICY IF EXISTS "arsiv_yazma_service" ON canli_gorevler_arsiv;

ALTER TABLE gorev_kurallari ENABLE ROW LEVEL SECURITY;
ALTER TABLE canli_gorevler_arsiv ENABLE ROW LEVEL SECURITY;

-- gorev_kurallari: tenant_admin kendi firmasını yönetir, super_admin her şeyi görür
CREATE POLICY "gorev_kurallari_okuma" ON gorev_kurallari
  FOR SELECT USING (
    firma_id IN (
      SELECT firma_id FROM users WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND rol IN ('super_admin', 'alt_super_admin')
    )
  );

CREATE POLICY "gorev_kurallari_yazma" ON gorev_kurallari
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND (
          (rol = 'tenant_admin' AND firma_id = gorev_kurallari.firma_id)
          OR rol IN ('super_admin', 'alt_super_admin')
        )
    )
  );

-- canli_gorevler_arsiv: okuma (raporlama için)
CREATE POLICY "arsiv_okuma" ON canli_gorevler_arsiv
  FOR SELECT USING (
    firma_id IN (
      SELECT firma_id FROM users WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND rol IN ('super_admin', 'alt_super_admin')
    )
  );

-- Arşiv yazma sadece service_role (cron fonksiyonları SECURITY DEFINER)
CREATE POLICY "arsiv_yazma_service" ON canli_gorevler_arsiv
  FOR INSERT WITH CHECK (true);  -- SECURITY DEFINER fn zaten kontrol eder

-- ─────────────────────────────────────────────────────────────────────────
-- 10. TEST: Fonksiyonları manuel test et
-- ─────────────────────────────────────────────────────────────────────────
-- Aşağıdaki satırları tek tek çalıştırarak test edin:

-- A) Bugün için görev üret (kural yoksa 0 döner, sorun değil):
--    SELECT gece_gorev_uret(CURRENT_DATE);

-- B) Terminal görevleri arşivle:
--    SELECT gun_sonu_arsivle();

-- C) Tam döngü (production'da her gece çalışacak olan):
--    SELECT gece_tam_dongu();

-- D) Cron jobları listele:
--    SELECT * FROM cron.job;

-- E) Cron log:
--    SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;

-- ─────────────────────────────────────────────────────────────────
-- 11. MEVCUT GÖREVLER İÇİN proje_id GÜNCELLEMESİ
-- Önceden oluşturulmuş ama proje_id'si olmayan görevleri günceller
-- ─────────────────────────────────────────────────────────────────
UPDATE canli_gorevler 
SET proje_id = l.proje_id
FROM lokasyonlar l
WHERE canli_gorevler.lokasyon_id = l.id 
  AND canli_gorevler.proje_id IS NULL
  AND canli_gorevler.kural_id IS NOT NULL; -- Sadece kuraldan üretilen görevler

-- Arşivdeki görevleri de güncelle
UPDATE canli_gorevler_arsiv 
SET proje_id = l.proje_id
FROM lokasyonlar l
WHERE canli_gorevler_arsiv.lokasyon_id = l.id 
  AND canli_gorevler_arsiv.proje_id IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 12. TOGG PROJESİNE AİT TÜM GÖREVLERİ BAĞLA
-- Hem kuraldan üretilen hem manuel görevleri TOGG projesine bağla
-- ─────────────────────────────────────────────────────────────────
-- TOGG projesinin ID'sini bul (varsayılan olarak)
DO $$
DECLARE
  v_togg_proje_id uuid;
BEGIN
  SELECT id INTO v_togg_proje_id 
  FROM projeler 
  WHERE ad ILIKE '%TOGG%' 
  LIMIT 1;
  
  IF v_togg_proje_id IS NULL THEN
    RAISE EXCEPTION 'TOGG projesi bulunamadı. Lütfen proje adını kontrol edin.';
  END IF;
  
  -- Tüm canli_gorevler'i TOGG projesine bağla (proje_id'si NULL olanlar)
  UPDATE canli_gorevler 
  SET proje_id = v_togg_proje_id
  WHERE proje_id IS NULL;
  
  -- Tüm canli_gorevler_arsiv'i TOGG projesine bağla (proje_id'si NULL olanlar)
  UPDATE canli_gorevler_arsiv 
  SET proje_id = v_togg_proje_id
  WHERE proje_id IS NULL;
  
  -- ─────────────────────────────────────────────────────────────────
-- 13. MANUEL EKLENEN GÖREVLER İÇİN proje_id DÜZELTME
-- ─────────────────────────────────────────────────────────────────
-- ATALİAN firmasındaki tüm proje_id'si NULL olan görevleri TOGG projesine bağla
-- ÖNCE TABLO YAPISINI KONTROL EDİN:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'firmalar';
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'projeler';

DO $$
DECLARE
  v_atalian_firma_id uuid;
  v_togg_proje_id uuid;
  v_guncellenen int := 0;
BEGIN
  -- ATALİAN firmasını bul (sadece 'firma_adi' dene)
  SELECT id INTO v_atalian_firma_id 
  FROM firmalar 
  WHERE firma_adi ILIKE '%ATALİAN%' 
  LIMIT 1;
  
  IF v_atalian_firma_id IS NULL THEN
    RAISE EXCEPTION 'ATALİAN firması bulunamadı. Kolon adı: firma_adi (görselde görünen)';
  END IF;
  
  -- TOGG projesini bul (doğru kolon adı: 'ad')
  SELECT id INTO v_togg_proje_id 
  FROM projeler 
  WHERE ad ILIKE '%TOGG%' 
  AND firma_id = v_atalian_firma_id
  LIMIT 1;
  
  -- Tüm proje_id'si NULL olan görevleri güncelle
  UPDATE canli_gorevler 
  SET proje_id = v_togg_proje_id
  WHERE firma_id = v_atalian_firma_id
    AND proje_id IS NULL;
  
  GET DIAGNOSTICS v_guncellenen = ROW_COUNT;
  
  RAISE NOTICE 'ATALİAN firmasında % adet proje_id''si NULL olan görev TOGG projesine bağlandı.', v_guncellenen;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 14. TÜM GÖREVLER İÇİN proje_id DÜZELTME (Akıllı Mantık)
-- ─────────────────────────────────────────────────────────────────
-- Tüm görevler lokasyonun proje_id'sine bağlanır
-- Sadece mevcut açık/beklemedeki görevler TOGG projesine bağlanır
DO $$
DECLARE
  v_atalian_firma_id uuid;
  v_togg_proje_id uuid;
  v_tum_guncellenen int := 0;
  v_togg_guncellenen int := 0;
BEGIN
  -- ATALİAN firmasını bul
  SELECT id INTO v_atalian_firma_id 
  FROM firmalar 
  WHERE firma_adi ILIKE '%ATALİAN%' 
  LIMIT 1;
  
  -- TOGG projesini bul
  SELECT id INTO v_togg_proje_id 
  FROM projeler 
  WHERE ad ILIKE '%TOGG%' 
  AND firma_id = v_atalian_firma_id
  LIMIT 1;
  
  -- 1. Tüm proje_id'si NULL olan görevleri lokasyonun proje_id'sine bağla
  UPDATE canli_gorevler cg
  SET proje_id = l.proje_id
  FROM lokasyonlar l
  WHERE cg.lokasyon_id = l.id
    AND cg.firma_id = v_atalian_firma_id
    AND cg.proje_id IS NULL;
  
  GET DIAGNOSTICS v_tum_guncellenen = ROW_COUNT;
  
  -- 2. Mevcut açık/beklemedeki görevleri TOGG projesine bağla
  UPDATE canli_gorevler 
  SET proje_id = v_togg_proje_id
  WHERE firma_id = v_atalian_firma_id
    AND durum IN ('ACIK', 'BEKLEMEDE')
    AND olusturma_tarihi >= CURRENT_DATE - INTERVAL '7 days'; -- Son 7 günde eklenenler
  
  GET DIAGNOSTICS v_togg_guncellenen = ROW_COUNT;
  
  RAISE NOTICE 'Toplam % görev lokasyon projesine bağlandı, % mevcut görev TOGG projesine bağlandı.', 
    v_tum_guncellenen, v_togg_guncellenen;
END $$;
