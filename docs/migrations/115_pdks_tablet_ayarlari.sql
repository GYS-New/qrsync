-- Migration 115: pdks_terminalleri tablet ayar kolonlari
--
-- Mobil ekip istegi (1f5941ca): Tablet ayarlari (PIN, ad_kisalt, ses,
-- pilde_kis, liste_gizle) tabletin YERELINDE tutuluyordu. PIN unutulunca
-- ayarlara girilemez, tek care tabletin sıfırlanması. Ayrica birden fazla
-- terminal olunca her birine tek tek gidip ayar yapmak surdurulebilir degil.
--
-- Cozum: ayarlar pdks_terminalleri'ne yazilir, terminal-dogrula ve
-- icerideki-personel response'larina 'ayarlar' nesnesi eklenir. Tablet
-- 8 sn'de bir icerideki-personel cagirdigi icin panelden yapilan degisiklik
-- saniyeler icinde tablete yansir.

ALTER TABLE public.pdks_terminalleri
  ADD COLUMN IF NOT EXISTS pin text NOT NULL DEFAULT '1379'
    CHECK (pin ~ '^\d{4}$'),
  ADD COLUMN IF NOT EXISTS ad_kisalt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ses_acik boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ses_duzey smallint NOT NULL DEFAULT 3
    CHECK (ses_duzey BETWEEN 1 AND 3),
  ADD COLUMN IF NOT EXISTS pilde_kis boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS liste_gizle boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pdks_terminalleri.pin IS 'Tablet ayarlar ekrani PIN (4 hane) — panelden yonetilir, mobile ile senkron.';
COMMENT ON COLUMN public.pdks_terminalleri.ad_kisalt IS 'Iceridekiler listesinde ad kisalt (KVKK: Ahmet Y.).';
COMMENT ON COLUMN public.pdks_terminalleri.ses_acik IS 'Okutma bipi acik/kapali.';
COMMENT ON COLUMN public.pdks_terminalleri.ses_duzey IS '1-2-3 (3 = alarm kanali + tavan).';
COMMENT ON COLUMN public.pdks_terminalleri.pilde_kis IS 'Pil %35 alti ekran dusuk parlaklik.';
COMMENT ON COLUMN public.pdks_terminalleri.liste_gizle IS 'Iceridekiler listesi hic gorunmesin (siki KVKK).';
