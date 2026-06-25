-- 096: pg_cron schedule'larını TR saatinde yaz (cron.timezone='Europe/Istanbul')
--
-- ÖNŞART: Bu migration apply edilmeden ÖNCE Supabase project RESTART edilmiş
-- ve cron.timezone='Europe/Istanbul' set edilmiş olmalı.
--
-- Adımlar:
--   1. Düşük trafik penceresi seç (örn Pazar gece 04:00 TR)
--   2. Supabase Dashboard'tan reboot OR:
--        ALTER SYSTEM SET cron.timezone = 'Europe/Istanbul';
--        (restart sonrası etkili)
--   3. Restart tamamlandığında bu migration'ı apply et
--
-- Doğrulama: cron.job'taki yeni schedule string'leri TR-saatinde yorumlanır.
-- Tetikleme saatleri DEĞİŞMEZ — TR'de DST olmadığı için UTC ↔ TR çevrimi sabit.
--
-- Detaylar: docs/runbooks/CRON_TR_SAATLERI.md

-- Önce timezone doğrula
DO $$
DECLARE v_tz text;
BEGIN
  v_tz := current_setting('cron.timezone', true);
  IF v_tz IS NULL OR v_tz != 'Europe/Istanbul' THEN
    RAISE EXCEPTION 'cron.timezone "Europe/Istanbul" değil, şu an: %. Önce ALTER SYSTEM SET cron.timezone = ''Europe/Istanbul''; sonra Supabase reboot yap.', COALESCE(v_tz, 'NULL');
  END IF;
END $$;

-- Schedule'ları TR saatinde yeniden yaz (tetikleme saatleri aynı kalır)
SELECT cron.alter_job(jobid := j.jobid, schedule := s.new_schedule)
FROM cron.job j
JOIN (VALUES
  ('qrsync-gece-dongu',           '30 23 * * *'),  -- 23:30 TR
  ('qrsync-duraklatma-temizle',   '5 0 * * *'),    -- 00:05 TR
  ('oto-yikama-gorev-uret',       '55 23 * * *'),  -- 23:55 TR
  ('oto-yikama-yapilamadi',       '0 0 * * *'),    -- 00:00 TR
  ('oto-yikama-hazir-acik',       '1 0 * * *'),    -- 00:01 TR
  ('oto-yikama-arsiv',            '30 0 * * *'),   -- 00:30 TR
  ('mobil_anket_cevap_temizlik',  '30 6 1 * *'),   -- ayın 1'i 06:30 TR
  ('mobil_hata_log_temizlik',     '0 6 * * *')     -- 06:00 TR
) AS s(jobname, new_schedule) ON j.jobname = s.jobname;

-- Frequency-based job'lar (her N dakika/saat) timezone'dan etkilenmez,
-- aynı kalır: qrsync-gun-ici-durum (*/1), qrsync-vardiya-bildirim (*/5),
-- oto-yikama-islemde-iptal (0 *), oto-yikama-rapor-gonder (*/15)

-- Doğrulama
SELECT jobname, schedule
FROM cron.job
WHERE jobname LIKE 'qrsync-%' OR jobname LIKE 'oto-yikama-%' OR jobname LIKE 'mobil_%'
ORDER BY jobname;
