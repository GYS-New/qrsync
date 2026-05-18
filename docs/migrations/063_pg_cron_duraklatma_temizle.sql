-- Migration 063: kural_duraklatmalari otomatik temizlik cron'u
--
-- İhtiyaç: Kullanıcı bir tarih için duraklatma girdiğinde, o tarih geçtikten
-- sonra kayıt DB'de gereksiz birikiyor. gece_gorev_uret fonksiyonu zaten
-- tarihi geçen duraklatmaları görmezden geliyor (tarih = p_tarih filtresi),
-- ama temizlik yine de iyi pratik.
--
-- Zamanlama: Her gün TR 00:05 (UTC 21:05) — gece_tam_dongu'dan 4dk sonra.

SELECT cron.schedule(
  'qrsync-duraklatma-temizle',
  '5 21 * * *',  -- UTC 21:05 = TR 00:05
  $$DELETE FROM kural_duraklatmalari WHERE tarih < (NOW() AT TIME ZONE 'Europe/Istanbul')::date$$
);

-- Doğrulama (manual):
-- SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'qrsync-duraklatma-temizle';
--
-- Manuel tetikleme (test):
-- DELETE FROM kural_duraklatmalari WHERE tarih < (NOW() AT TIME ZONE 'Europe/Istanbul')::date;
