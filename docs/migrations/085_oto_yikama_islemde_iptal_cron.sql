-- Migration 085: pg_cron schedule — Oto Yıkama ISLEMDE iptal cron'u.
--
-- Saatte bir (her saatin 0. dakikası), Supabase pg_cron + pg_net
-- üzerinden Railway endpoint'ini çağırır. Endpoint RPC'yi tetikler
-- (migration 084) ve iptal edilen görevler için FCM bildirim gönderir.
--
-- Pattern referansı: qrsync-vardiya-bildirim job'u (lib/cron pattern).
-- Vault'ta saklanan 'cron_secret' x-cron-token header'a yazılır;
-- endpoint env CRON_SECRET ile karşılaştırır.

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobid FROM cron.job WHERE jobname = 'oto-yikama-islemde-iptal'
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'oto-yikama-islemde-iptal',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://iogys.com.tr/api/cron/oto-yikama-islemde-iptal',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', COALESCE((SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'), '')
    ),
    timeout_milliseconds := 60000
  );
  $$
);
