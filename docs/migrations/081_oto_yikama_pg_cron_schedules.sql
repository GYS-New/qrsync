-- Migration 081: Oto Yıkama cron'larını Supabase pg_cron'a kaydet.
--
-- Sebep: Railway cron'ları çalışmıyordu (railway.json tanımları olsa da
-- son 48 saatte cron_log'da hiç oto_yikama_* girişi yok). Mevcut GYS
-- cron'ları (qrsync-gece-dongu, qrsync-duraklatma-temizle vb.) zaten
-- Supabase pg_cron'da kayıtlı — Oto Yıkama da aynı pattern'i takip eder.
--
-- pg_cron RPC'leri doğrudan DB içinde tetikler, network/auth gereksiz.
-- cron.schedule idempotent değil; yeniden çalıştırılırsa duplicate olur.
-- Bu yüzden önce job adına göre unschedule edilir.
--
-- TR saatleri (UTC + 3):
--   23:55 üret      → 20:55 UTC
--   00:00 yapılamadı → 21:00 UTC
--   00:01 hazir-acik → 21:01 UTC
--   00:30 arşiv     → 21:30 UTC

-- Önceki tanımlar varsa temizle (idempotent yeniden çalıştırma için)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT jobid, jobname FROM cron.job
           WHERE jobname IN (
             'oto-yikama-gorev-uret',
             'oto-yikama-yapilamadi',
             'oto-yikama-hazir-acik',
             'oto-yikama-arsiv'
           )
  LOOP
    PERFORM cron.unschedule(r.jobid);
  END LOOP;
END $$;

-- Schedule kur
SELECT cron.schedule(
  'oto-yikama-gorev-uret',
  '55 20 * * *',
  $$SELECT oto_yikama_gorev_uret_ertesi_gun()$$
);

SELECT cron.schedule(
  'oto-yikama-yapilamadi',
  '0 21 * * *',
  $$SELECT oto_yikama_acik_to_yapilamadi()$$
);

SELECT cron.schedule(
  'oto-yikama-hazir-acik',
  '1 21 * * *',
  $$SELECT oto_yikama_hazir_to_acik()$$
);

SELECT cron.schedule(
  'oto-yikama-arsiv',
  '30 21 * * *',
  $$SELECT oto_yikama_arsivle()$$
);
