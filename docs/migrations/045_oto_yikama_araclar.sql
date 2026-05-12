-- Oto Yıkama Modülü — Araç Kayıtları + Plaka Audit Log
--
-- Mimari: Yıkama görevleri mevcut spesifik görev (gorevler) sistemi üzerinden
-- yürür. Bu tablolar SADECE araç metadata (plaka, marka, periyot) için.
-- Görev oluşturma akışında plaka bilgisi tanım'a yazılır, mobil app değişmez.

CREATE TABLE IF NOT EXISTS public.araclar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id uuid NOT NULL REFERENCES firmalar(id) ON DELETE CASCADE,
  proje_id uuid REFERENCES projeler(id) ON DELETE SET NULL,

  plaka text NOT NULL,
  marka text,
  model text,
  renk text,
  departman text,

  periyot_gun int NOT NULL DEFAULT 7,
  son_yikama_tarihi timestamptz,
  aktif boolean NOT NULL DEFAULT true,

  notlar text,
  olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
  guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
  olusturan_id uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS araclar_firma_plaka_uniq
  ON araclar(firma_id, plaka)
  WHERE aktif = true;

CREATE INDEX IF NOT EXISTS araclar_firma_aktif_idx ON araclar(firma_id, aktif);
CREATE INDEX IF NOT EXISTS araclar_plaka_idx ON araclar(plaka);
CREATE INDEX IF NOT EXISTS araclar_proje_idx ON araclar(proje_id);

CREATE TABLE IF NOT EXISTS public.arac_plaka_gecmisi (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arac_id uuid NOT NULL REFERENCES araclar(id) ON DELETE CASCADE,
  eski_plaka text NOT NULL,
  yeni_plaka text NOT NULL,
  degisim_tarihi timestamptz NOT NULL DEFAULT now(),
  degisturen_id uuid REFERENCES users(id) ON DELETE SET NULL,
  sebep text
);

CREATE INDEX IF NOT EXISTS arac_plaka_gecmisi_arac_idx ON arac_plaka_gecmisi(arac_id);
CREATE INDEX IF NOT EXISTS arac_plaka_gecmisi_eski_plaka_idx ON arac_plaka_gecmisi(eski_plaka);

CREATE OR REPLACE FUNCTION araclar_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.guncelleme_tarihi = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS araclar_update_ts ON araclar;
CREATE TRIGGER araclar_update_ts
  BEFORE UPDATE ON araclar
  FOR EACH ROW EXECUTE FUNCTION araclar_update_timestamp();

ALTER TABLE araclar ENABLE ROW LEVEL SECURITY;
ALTER TABLE arac_plaka_gecmisi ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS araclar_sa_select ON araclar;
CREATE POLICY araclar_sa_select ON araclar
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.rol IN ('super_admin', 'alt_super_admin')
    )
  );

DROP POLICY IF EXISTS arac_plaka_gecmisi_sa_select ON arac_plaka_gecmisi;
CREATE POLICY arac_plaka_gecmisi_sa_select ON arac_plaka_gecmisi
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.rol IN ('super_admin', 'alt_super_admin')
    )
  );
