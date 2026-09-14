-- Migration 112: PDKS Tablet — dönen (rotasyonlu) mesai QR sistemi
--
-- Amac: Sabit basili mesai QR'i fotograflanip WhatsApp'la gonderilerek
-- tesise gelmeden is basi yapiliyor. Tesis girisine tablet konur, tablet
-- her ~30 sn'de yeni QR gosterir. QR aynı isi yapar (toggle: acik kayit
-- yoksa giris, varsa cikis) — sadece gecerlilik penceresi kisadir.
--
-- 3 katman guvenlik:
--   1) Rotasyon: token her 30 sn degisir
--   2) Zaman toleransi: +/- 1 pencere (30 sn)
--   3) TEK KULLANIM: aynı token ikinci kez kabul edilmez
--
-- Mobil (APK) tarafi degismiyor — mevcut /api/app/mesai-okut ayni cagirilir.

-- ── Tablo: pdks_terminalleri ────────────────────────────────────────────────
-- Kapsam PROJE bazli (lokasyon degil, mobil ekibin duzeltmesi).
CREATE TABLE IF NOT EXISTS public.pdks_terminalleri (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_key  text NOT NULL UNIQUE,         -- panelden uretilen, tablete elle girilen anahtar (PDKS-XXXX-XXXX)
  ad            text NOT NULL,                -- ör "A Blok Ana Giris" — tablette gosterilecek
  firma_id      uuid NOT NULL REFERENCES public.firmalar(id) ON DELETE CASCADE,
  proje_id      uuid NOT NULL REFERENCES public.projeler(id) ON DELETE CASCADE,
  aktif         boolean NOT NULL DEFAULT true,
  cihaz_id      text,                         -- tabletin Device.getId() — ilk dogrulamada yazilir
  terminal_token text UNIQUE,                 -- opak, tablette saklanir; iptal edilebilir
  son_gorulme   timestamptz,                  -- her qr-paket cagirisinda guncellenir
  olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
  guncelleme_tarihi timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pdks_terminalleri_firma_idx ON public.pdks_terminalleri(firma_id);
CREATE INDEX IF NOT EXISTS pdks_terminalleri_proje_idx ON public.pdks_terminalleri(proje_id);

-- ── Tablo: pdks_kullanilan_tokenlar ─────────────────────────────────────────
-- Tek kullanim kurali. Her rotasyon token'i sadece bir kez kabul edilir.
-- INSERT unique constraint ile atomik: ikinci insert 23505 hatasi doner,
-- endpoint bunu QR_KULLANILDI olarak yorumlar.
-- Eski kayitlar cron ile ~10 dk sonra temizlenir (pencere 30 sn + tolerans).
CREATE TABLE IF NOT EXISTS public.pdks_kullanilan_tokenlar (
  token_hash    text PRIMARY KEY,             -- sha256(token) — asil token kaydedilmez
  terminal_id   uuid NOT NULL REFERENCES public.pdks_terminalleri(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kullanilma_tarihi timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pdks_kullanilan_tokenlar_temizlik_idx
  ON public.pdks_kullanilan_tokenlar(kullanilma_tarihi);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.pdks_terminalleri ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdks_kullanilan_tokenlar ENABLE ROW LEVEL SECURITY;

-- SA/AA hepsini gorur; tenant_admin sadece kendi firmasini; digerleri okumaz.
CREATE POLICY pdks_terminalleri_sa_all ON public.pdks_terminalleri
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.rol IN ('super_admin','alt_super_admin'))
    OR (
      EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.rol = 'tenant_admin' AND u.firma_id = pdks_terminalleri.firma_id)
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.rol IN ('super_admin','alt_super_admin'))
    OR (
      EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.rol = 'tenant_admin' AND u.firma_id = pdks_terminalleri.firma_id)
    )
  );

-- pdks_kullanilan_tokenlar: sadece service_role yazar/okur (endpoint'lerden)
-- authenticated icin policy YOK — yani RLS bloklar. service_role RLS bypass eder.

-- ── Grants ──────────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdks_terminalleri TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdks_terminalleri TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pdks_kullanilan_tokenlar TO service_role;

-- ── mesai kayitlari: terminal denetim izi (opsiyonel kolon) ────────────────
ALTER TABLE public.personel_mesai_kayitlari
  ADD COLUMN IF NOT EXISTS pdks_terminal_id uuid REFERENCES public.pdks_terminalleri(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS personel_mesai_pdks_terminal_idx
  ON public.personel_mesai_kayitlari(pdks_terminal_id)
  WHERE pdks_terminal_id IS NOT NULL;

-- Ayni kolon arsive de eklensin (migration 111 kaynakli kolon drift bug'i tekrarlamasin)
ALTER TABLE public.personel_mesai_kayitlari_arsiv
  ADD COLUMN IF NOT EXISTS pdks_terminal_id uuid;

-- ── Yorum ───────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.pdks_terminalleri IS
  'PDKS tablet terminalleri — rotasyonlu mesai QR sistemi. Bkz. migration 112 ve /api/pdks/*.';
COMMENT ON TABLE public.pdks_kullanilan_tokenlar IS
  'Kullanilmis rotasyon token hashleri (tek kullanim kurali). ~10 dk eski kayitlar cron ile silinir.';
COMMENT ON COLUMN public.personel_mesai_kayitlari.pdks_terminal_id IS
  'Rotasyon token ile acilan mesai kaydinin hangi PDKS tabletinden geldigi (denetim izi).';
