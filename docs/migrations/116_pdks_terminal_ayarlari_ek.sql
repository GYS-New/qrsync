-- Migration 116: pdks_terminalleri — ek 5 ayar kolonu
--
-- Mobil ekip istegi (03276f48): panel su an sadece 6 ayar tutuyor (pin,
-- ad_kisalt, ses_acik, ses_duzey, pilde_kis, liste_gizle). Eksikler:
--
--   pencere_saniye  — QR rotasyon suresi terminal bazli (15/30/60 sn).
--                     Yerine sabit PDKS_PENCERE_SANIYE=15 kullaniliyordu.
--   paket_dakika    — Tablet qr-paket cagirisinda talep edecegi uzunluk (60-1440).
--   liste_poll_sn   — Iceridekiler listesi yenilenme sikligi (3-120).
--   vurgu_sn        — Yeni okutan isminin yanip sonme suresi (3-60).
--   cikis_goster_sn — Cikis yapan personelin listede kalma suresi (2-60).
--
-- Kullanim:
--   qr-paket: pencere_saniye terminal kolonundan alinir (env fallback yok artik).
--   mesai-okut: token cozumunde pencereNoBul(zamanMs, terminal.pencere_saniye).
--   ayarlar nesnesi (terminal-dogrula + icerideki-personel): son 4 alan eklendi.

ALTER TABLE public.pdks_terminalleri
  ADD COLUMN IF NOT EXISTS pencere_saniye smallint NOT NULL DEFAULT 30
    CHECK (pencere_saniye IN (15, 30, 60)),
  ADD COLUMN IF NOT EXISTS paket_dakika smallint NOT NULL DEFAULT 720
    CHECK (paket_dakika BETWEEN 60 AND 1440),
  ADD COLUMN IF NOT EXISTS liste_poll_sn smallint NOT NULL DEFAULT 8
    CHECK (liste_poll_sn BETWEEN 3 AND 120),
  ADD COLUMN IF NOT EXISTS vurgu_sn smallint NOT NULL DEFAULT 12
    CHECK (vurgu_sn BETWEEN 3 AND 60),
  ADD COLUMN IF NOT EXISTS cikis_goster_sn smallint NOT NULL DEFAULT 6
    CHECK (cikis_goster_sn BETWEEN 2 AND 60);

COMMENT ON COLUMN public.pdks_terminalleri.pencere_saniye IS 'QR rotasyon penceresi (sn): 15/30/60.';
COMMENT ON COLUMN public.pdks_terminalleri.paket_dakika IS 'Tablet qr-paket paket uzunlugu talebi (dk). 60-1440.';
COMMENT ON COLUMN public.pdks_terminalleri.liste_poll_sn IS 'Iceridekiler listesi poll sikligi (sn). 3-120.';
COMMENT ON COLUMN public.pdks_terminalleri.vurgu_sn IS 'Yeni okutan isminin yanip sonme suresi (sn). 3-60.';
COMMENT ON COLUMN public.pdks_terminalleri.cikis_goster_sn IS 'Cikis listedeki kalma suresi (sn). 2-60.';
