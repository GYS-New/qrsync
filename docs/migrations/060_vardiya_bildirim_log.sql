-- Migration 060: Vardiya bitimi performans bildirim logu
--
-- İhtiyaç: Vardiya bitiminden 10dk sonra üst lokasyon yöneticilerine
-- (kullanici_lokasyon_yetkileri'nde kayıtlı U/M) performans push bildirimi.
-- Cron 5dk'da 1 çalışır — duplicate önlemek için unique log gerekli.

CREATE TABLE IF NOT EXISTS public.vardiya_bildirim_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id uuid NOT NULL REFERENCES firmalar(id) ON DELETE CASCADE,
  proje_id uuid REFERENCES projeler(id) ON DELETE CASCADE,
  ust_lokasyon_id uuid NOT NULL REFERENCES lokasyonlar(id) ON DELETE CASCADE,
  alici_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vardiya_no int NOT NULL,
  tarih date NOT NULL,
  gonderim_tarihi timestamptz NOT NULL DEFAULT now(),
  performans_data jsonb,
  UNIQUE (firma_id, proje_id, ust_lokasyon_id, alici_user_id, vardiya_no, tarih)
);

CREATE INDEX IF NOT EXISTS vardiya_bildirim_log_firma_tarih_idx
  ON public.vardiya_bildirim_log(firma_id, tarih);

ALTER TABLE public.vardiya_bildirim_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vardiya_bildirim_log_sa_select ON public.vardiya_bildirim_log;
CREATE POLICY vardiya_bildirim_log_sa_select ON public.vardiya_bildirim_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
                 AND users.rol IN ('super_admin', 'alt_super_admin')));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vardiya_bildirim_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vardiya_bildirim_log TO service_role;

COMMENT ON TABLE public.vardiya_bildirim_log IS
  'Vardiya bitimi performans bildirimleri — duplicate önlemek için unique kayıt. UNIQUE (firma+proje+ust_lokasyon+alici+vardiya+tarih).';
