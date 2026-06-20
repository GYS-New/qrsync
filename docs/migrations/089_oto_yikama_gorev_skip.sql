-- Migration 089: oto_yikama_gorev_skip
--
-- Yıkama Takvimi sayfasında kullanıcı bir tahmini görevi "iptal" ettiğinde
-- bu tabloya (arac_id, tarih) kaydı yazılır. Cron RPC bu tabloya bakıp
-- skip yapar — DB'de IPTAL kayıt oluşmaz, hiç planlanmamış gibi davranır.
--
-- Audit yok: skip kaydı kullanıcı işlemi olarak tutulur (kim ne zaman skip
-- etti), ama görev/metadata tablolarına bulaşmaz → Görev Kayıtları ve
-- Arşiv "temiz" kalır.
--
-- Skip kaldırma: aynı arac+tarih DELETE → tahmin tekrar görünür, cron
-- üretmeye başlar.

CREATE TABLE IF NOT EXISTS public.oto_yikama_gorev_skip (
  firma_id uuid NOT NULL REFERENCES public.firmalar(id) ON DELETE CASCADE,
  arac_id uuid NOT NULL REFERENCES public.araclar(id) ON DELETE CASCADE,
  tarih date NOT NULL,
  olusturan_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (arac_id, tarih)
);

CREATE INDEX IF NOT EXISTS oygs_firma_tarih_idx
  ON public.oto_yikama_gorev_skip(firma_id, tarih);

-- RLS — service_role bypass, authenticated tam CRUD (sayfa düzeyinde
-- assertModulYetkisi + endpoint scope kontrolü zaten var)
ALTER TABLE public.oto_yikama_gorev_skip ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oygs_open_all ON public.oto_yikama_gorev_skip;
CREATE POLICY oygs_open_all ON public.oto_yikama_gorev_skip
  FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oto_yikama_gorev_skip TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oto_yikama_gorev_skip TO service_role;

COMMENT ON TABLE public.oto_yikama_gorev_skip IS
  'Yıkama Takvimi tahmini görev iptalleri. Cron oto_yikama_gorev_uret_ertesi_gun() bu tabloya bakıp skip yapar. Görev/metadata kayıtlarına dokunulmaz — temiz audit.';
