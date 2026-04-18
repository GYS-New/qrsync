-- İO Asistan sessiz hata/diagnostic logu
-- Kullanıcıya görünmez, SA sonradan inceleyebilir.
-- Migration: 2026-04-17 io_asistan_hata_log
CREATE TABLE IF NOT EXISTS public.io_asistan_hata_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  firma_id uuid,
  proje_id uuid,
  tip text NOT NULL,             -- 'api_error' | 'tool_error' | 'rate_limit' | 'max_iter'
  mesaj text,
  detay jsonb,                   -- stack, tool adı, input vb.
  tarih timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_io_hata_tarih ON public.io_asistan_hata_log(tarih DESC);
CREATE INDEX IF NOT EXISTS idx_io_hata_user  ON public.io_asistan_hata_log(user_id);
CREATE INDEX IF NOT EXISTS idx_io_hata_tip   ON public.io_asistan_hata_log(tip);

COMMENT ON TABLE public.io_asistan_hata_log IS 'İO asistan çalışma zamanı hataları — kullanıcıya görünmez, SA inceler.';
