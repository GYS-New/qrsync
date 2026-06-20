-- Migration 088: pg_cron schedule — Oto Yıkama rapor gönderim cron'u.
--
-- Her 15 dakikada bir Railway endpoint'ini çağırır. Endpoint vakti gelmiş
-- (sonraki_gonderim_tarihi <= now() ve aktif=true) zamanlamaları işler.
--
-- Pattern: Migration 085 (oto-yikama-islemde-iptal) + vardiya-bildirim cron'u
-- ile aynı. pg_net.http_post + vault.cron_secret + x-cron-token header.

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobid FROM cron.job WHERE jobname = 'oto-yikama-rapor-gonder'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'oto-yikama-rapor-gonder',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://iogys.com.tr/api/cron/oto-yikama-rapor-gonder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'), '')
    ),
    timeout_milliseconds := 120000
  );
  $$
);
