-- FIRMA BAZLI ARŞİV DEPOLAMA KAPASİTESİ
--
-- SA, her firma için rezerve edilen depolama miktarını MB cinsinden belirler.
-- TA, kendi firmasının arşiv kapasite göstergesini bu limite göre görür.
-- Varsayılan 1024 MB (1 GB).

ALTER TABLE public.firmalar
  ADD COLUMN IF NOT EXISTS depolama_kapasitesi_mb integer NOT NULL DEFAULT 1024;

COMMENT ON COLUMN public.firmalar.depolama_kapasitesi_mb IS
  'Firma başına rezerve edilen arşiv depolama limiti (MB). SA firma detayından düzenler.';
