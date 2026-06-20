-- Migration 087: oto_yikama_rapor_zamanlama
--
-- Oto Yıkama modülü için otomatik rapor mail gönderim zamanlamaları.
-- GYS'deki rapor_zamanlama tablosunun Oto Yıkama özelinde versiyonu —
-- proje/üst lokasyon parametreleri yok (firma seviyesi), rapor içeriği
-- /api/oto-yikama/raporlar/excel endpoint'iyle üretilir.
--
-- Tekrar tipleri: 'gunluk' (her gün), 'haftalik' (gun_secimi[0]=ISO gün
-- 1=Pzt..7=Paz), 'aylik' (gun_secimi[0]=1..28 ayın günü).
-- Periyot mantığı:
--   günlük  → rapor = önceki gün         → sonraki gönderim = yarın saat X
--   haftalık → rapor = önceki hafta (Pzt-Paz) → sonraki = haftanın seçili günü
--   aylık   → rapor = önceki ay (tüm gün)  → sonraki = ayın seçili günü
--
-- Cron (pg_cron) her 15 dakikada bir HTTP endpoint'i tetikler; aktif=true
-- ve sonraki_gonderim_tarihi <= now() kayıtları işler.

CREATE TABLE IF NOT EXISTS public.oto_yikama_rapor_zamanlama (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id uuid NOT NULL REFERENCES public.firmalar(id) ON DELETE CASCADE,
  olusturan_id uuid REFERENCES public.users(id) ON DELETE SET NULL,

  -- Alıcı e-postaları (toplu gönderim için array)
  alici_emails text[] NOT NULL,

  -- Mail konusu (NULL ise default kullanılır)
  konu text,

  -- Tekrar tipi: 'gunluk' | 'haftalik' | 'aylik'
  tekrar_tipi text NOT NULL CHECK (tekrar_tipi IN ('gunluk', 'haftalik', 'aylik')),

  -- Haftalık: ISO gün (1=Pzt..7=Paz). Aylık: 1..28 (29-31 ayda olmayabilir).
  gun_secimi int[],

  -- Gönderim saati (TR — HH:MM)
  saat time NOT NULL DEFAULT '08:00',

  -- Açıklama — mail gövdesine eklenir
  aciklama text,

  -- Aç/kapat
  aktif boolean NOT NULL DEFAULT true,

  -- Cron tarafından güncellenir
  son_gonderim_tarihi    timestamptz,
  sonraki_gonderim_tarihi timestamptz NOT NULL,

  olusturma_tarihi  timestamptz NOT NULL DEFAULT now(),
  guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oyrz_firma_idx
  ON public.oto_yikama_rapor_zamanlama(firma_id);

CREATE INDEX IF NOT EXISTS oyrz_cron_idx
  ON public.oto_yikama_rapor_zamanlama(sonraki_gonderim_tarihi)
  WHERE aktif = true;

-- guncelleme_tarihi otomatik
CREATE OR REPLACE FUNCTION public.oto_yikama_rapor_zamanlama_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.guncelleme_tarihi := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS oyrz_touch_trg ON public.oto_yikama_rapor_zamanlama;
CREATE TRIGGER oyrz_touch_trg
  BEFORE UPDATE ON public.oto_yikama_rapor_zamanlama
  FOR EACH ROW EXECUTE FUNCTION public.oto_yikama_rapor_zamanlama_touch();

-- RLS — SA tüm firmaları, TA kendi firmasını görür/değiştirir
ALTER TABLE public.oto_yikama_rapor_zamanlama ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oyrz_sa_all ON public.oto_yikama_rapor_zamanlama;
CREATE POLICY oyrz_sa_all ON public.oto_yikama_rapor_zamanlama
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
      AND users.rol IN ('super_admin', 'alt_super_admin'))
  );

DROP POLICY IF EXISTS oyrz_ta_own_firma ON public.oto_yikama_rapor_zamanlama;
CREATE POLICY oyrz_ta_own_firma ON public.oto_yikama_rapor_zamanlama
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.rol = 'tenant_admin'
      AND users.firma_id = oto_yikama_rapor_zamanlama.firma_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.oto_yikama_rapor_zamanlama TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oto_yikama_rapor_zamanlama TO service_role;

COMMENT ON TABLE public.oto_yikama_rapor_zamanlama IS
  'Oto Yıkama otomatik rapor mail gönderim zamanlamaları. pg_cron her 15dk kontrol eder, sonraki_gonderim_tarihi <= now() ve aktif=true olanları işler. Rapor içeriği: önceki periyot (gün/hafta/ay), Excel attach edilir.';
