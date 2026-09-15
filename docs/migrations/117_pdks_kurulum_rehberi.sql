-- Migration 117: pdks_kurulum_rehberi tablet kurulum rehberi tablosu
--
-- Mobil ekip istegi (4ea67b82): sahaya kurulum yapan kisi bir .txt dosya
-- ile geziyordu. Panelden erisilebilir, guncellenebilir, PDF/print edilebilir
-- kalici bir yerde durmalı.
--
-- Tasarim: singleton (id=1) tablo. SA duzenler, tenant_admin okur. Metin
-- markdown. Panelde iki yerde acilir:
--   1. Sayfa ust barinda "Kurulum Rehberi" butonu (her zaman)
--   2. Yeni terminal olusturuldugunda anahtar+rehber modali

CREATE TABLE IF NOT EXISTS public.pdks_kurulum_rehberi (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  versiyon text NOT NULL DEFAULT '1.1.1',
  tarih text NOT NULL DEFAULT '15 Eylul 2026',
  icerik text NOT NULL,
  guncelleyen_id uuid,
  guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pdks_kurulum_rehberi ENABLE ROW LEVEL SECURITY;

CREATE POLICY pdks_kurulum_rehberi_sa_all ON public.pdks_kurulum_rehberi
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.rol IN ('super_admin','alt_super_admin'))
    OR EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.rol = 'tenant_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.rol IN ('super_admin','alt_super_admin'))
  );

GRANT SELECT ON public.pdks_kurulum_rehberi TO authenticated;
GRANT ALL ON public.pdks_kurulum_rehberi TO service_role;

COMMENT ON TABLE public.pdks_kurulum_rehberi IS
  'PDKS tablet kurulum rehberi metni — singleton, SA duzenler.';

-- Default icerik ayri bir sekilde INSERT edildi (uzun metin) — bkz. deploy notu.
