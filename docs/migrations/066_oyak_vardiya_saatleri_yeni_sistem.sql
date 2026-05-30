-- ─────────────────────────────────────────────────────────────────────────────
-- 066: OYAK RENAULT vardiya saatleri yeni sistem (geçerlilik 2026-06-01 V1)
--
-- Kullanıcı talebi (2026-05-30):
--   01.06.2026 V1 itibariyle ATALIAN firma vardiya saatleri değişiyor.
--   Yeni saatler: V1=23:30-07:30, V2=07:30-15:30, V3=15:30-23:30
--   (Mevcut: V1=00:00-08:00, V2=08:00-16:00, V3=16:00-00:00)
--
--   Tüm kuralların aktif_olma_saati 30 dk geriye alınacak (vardiya başı +5 dk
--   grace korunuyor):
--     00:05 → 23:35  (68 kural — V1)
--     08:00 → 07:30  (179 kural — V2)
--     16:00 → 15:30  (128 kural — V3)
--
-- ÇALIŞTIRMA ZAMANI: 2026-05-30 (kullanıcı onayı sonrası erkene alındı).
--   Sebep: 30 ve 31 May için kural_duraklatmalari kayıtları eklendi —
--   bu iki günde görev üretilmeyecek. Migration erken çalıştırılabilir.
--   30 May 23:30 TR cron çalıştığında 31 May için üretim deneyecek ama
--   duraklatma var → 0 üretim. 31 May 23:30 TR cron 1 Haziran için
--   üretim yapacak (~375 görev) → V1 23:30'da başlar.
--
-- KAPSAM: ATALIAN firmasının firma-level vardiya ayarı + OYAK RENAULT projesinin
-- aktif gorev_kurallari + pg_cron schedule + gece_tam_dongu() fonksiyonu.
--
-- ATALIAN'ın diğer projeleri (BOSCH, Rexroth, SİRO ENERJİ, TOGG) pasif ve hiç
-- kuralı yok → firma vardiya ayarı değişimi onları etkilemez.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── 1) ATALIAN firma vardiya ayarı güncelle ──────────────────────────────
-- vardiya_saatleri (tek aktif set) + tum_vardiya_ayarlari içindeki "3" key'i.
-- 1/2/4 vardiya tanımları kullanılmıyor, dokunulmuyor.
UPDATE firmalar SET
  vardiya_saatleri = '[
    {"no":1,"baslangic":"23:30","bitis":"07:30"},
    {"no":2,"baslangic":"07:30","bitis":"15:30"},
    {"no":3,"baslangic":"15:30","bitis":"23:30"}
  ]'::jsonb,
  tum_vardiya_ayarlari = jsonb_set(
    COALESCE(tum_vardiya_ayarlari, '{}'::jsonb),
    '{3}',
    '[
      {"no":1,"baslangic":"23:30","bitis":"07:30"},
      {"no":2,"baslangic":"07:30","bitis":"15:30"},
      {"no":3,"baslangic":"15:30","bitis":"23:30"}
    ]'::jsonb
  )
WHERE id = 'a121c4be-77ef-4cc7-8384-9f121eb22112';


-- ─── 2) OYAK RENAULT aktif kural saatleri −30 dk shift ────────────────────
-- Sadece OYAK projesinin aktif kuralları. 375 satır beklenir.
UPDATE gorev_kurallari gk
SET aktif_olma_saati = gk.aktif_olma_saati - INTERVAL '30 minutes'
FROM lokasyonlar l
WHERE gk.lokasyon_id = l.id
  AND gk.firma_id = 'a121c4be-77ef-4cc7-8384-9f121eb22112'
  AND l.proje_id  = 'bd9dfb20-16aa-4038-9542-83abb167e6ee'
  AND gk.aktif    = true;

-- Beklenen: 00:05 → 23:35, 08:00 → 07:30, 16:00 → 15:30
-- 00:05 - 30dk = -00:25 → PG saat aritmetiği bunu 23:35 olarak modulo'lar
-- (saat veri tipi cyclic — 24 saat döngü)

-- Doğrulama (RAISE NOTICE ile log'da gör):
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT to_char(gk.aktif_olma_saati, 'HH24:MI') AS saat, COUNT(*) AS adet
    FROM gorev_kurallari gk JOIN lokasyonlar l ON l.id = gk.lokasyon_id
    WHERE gk.firma_id = 'a121c4be-77ef-4cc7-8384-9f121eb22112'
      AND l.proje_id  = 'bd9dfb20-16aa-4038-9542-83abb167e6ee'
      AND gk.aktif    = true
    GROUP BY saat ORDER BY saat
  LOOP
    RAISE NOTICE 'Yeni saat: % (% kural)', r.saat, r.adet;
  END LOOP;
END $$;


-- ─── 3) gece_tam_dongu() — YARIN için üretim yap ──────────────────────────
-- Cron artık 23:30 TR'de çalışacak. O an v_tr_date hâlâ "bugün" — fakat
-- üretilecek görevler YARIN'a ait olduğu için tarih +1 gün ileri alınır.
-- Diğer adımlar (durum geçişleri, arşivleme) v_now ile çalıştığı için
-- davranışları değişmez.
CREATE OR REPLACE FUNCTION public.gece_tam_dongu()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_arsiv_sonuc   jsonb;
  v_uretim_sonuc  jsonb;
  v_durum_sonuc   jsonb;
  v_now           timestamptz := now();
  -- YENİ: yarın için üretim (cron TR 23:30'da çalışırken sonraki günü hedefler)
  v_tr_date       date := ((v_now AT TIME ZONE 'Europe/Istanbul') + INTERVAL '1 day')::date;
  v_gecti         int := 0;
  v_aktive        int := 0;
  v_beklemeye     int := 0;
  v_uretim_ok     boolean;
  v_uretilen      int;
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
  SET durum = 'ZAMANI_GECMIS', durum_degisim_tarihi = v_now
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

  v_durum_sonuc := jsonb_build_object(
    'aktive', v_aktive,
    'beklemeye', v_beklemeye,
    'zamani_gecmis', v_gecti
  );

  v_arsiv_sonuc := gun_sonu_arsivle();
  v_uretim_sonuc := gece_gorev_uret(v_tr_date);

  v_uretim_ok := COALESCE((v_uretim_sonuc->>'ok')::boolean, false);
  v_uretilen := COALESCE((v_uretim_sonuc->>'uretilen')::int, 0);

  INSERT INTO audit_log (tip, tablo, basarili, satir_sayisi, hata_mesaji, detay)
  VALUES (
    'cron_gece_dongu',
    'canli_gorevler',
    v_uretim_ok,
    v_uretilen,
    CASE WHEN v_uretim_ok THEN NULL ELSE COALESCE(v_uretim_sonuc->>'hata', 'Bilinmeyen hata') END,
    jsonb_build_object(
      'tr_tarih', v_tr_date,
      'durum_gecis', v_durum_sonuc,
      'arsiv', v_arsiv_sonuc,
      'uretim', v_uretim_sonuc
    )
  );

  RETURN jsonb_build_object(
    'ok',          true,
    'durum_gecis', v_durum_sonuc,
    'arsiv',       v_arsiv_sonuc,
    'uretim',      v_uretim_sonuc,
    'zaman',       v_now,
    'tr_tarih',    v_tr_date
  );
EXCEPTION WHEN OTHERS THEN
  INSERT INTO audit_log (tip, tablo, basarili, hata_mesaji)
  VALUES ('cron_gece_dongu', 'canli_gorevler', false, SQLERRM);
  RETURN jsonb_build_object('ok', false, 'hata', SQLERRM);
END;
$function$;

COMMENT ON FUNCTION gece_tam_dongu() IS
  'Gece otomasyonu: durum geçişleri + arşivleme + YARIN için görev üretimi. '
  'Cron TR 23:30''da çalışır → v_tr_date = yarın. Migration 066 (2026-05-31).';


-- ─── 4) pg_cron schedule: TR 23:30 = UTC 20:30 ────────────────────────────
-- Mevcut: '1 21 * * *' (UTC 21:01 = TR 00:01)
-- Yeni:   '30 20 * * *' (UTC 20:30 = TR 23:30)
SELECT cron.alter_job(
  job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'qrsync-gece-dongu'),
  schedule := '30 20 * * *'
);


-- ─── 5) Doğrulama notları ─────────────────────────────────────────────────
-- Migration sonrası kontrol:
--   1. firmalar.vardiya_saatleri için ATALIAN: yeni saatler [23:30,07:30,15:30]
--   2. gorev_kurallari saatleri: 23:35 (68), 07:30 (179), 15:30 (128)
--   3. cron.job 'qrsync-gece-dongu' schedule '30 20 * * *'
--   4. gece_tam_dongu() içinde "v_tr_date := ... + INTERVAL '1 day'"
--   5. İlk çalışma 2026-05-31 23:30 TR — 2026-06-01 görevlerini üretecek
