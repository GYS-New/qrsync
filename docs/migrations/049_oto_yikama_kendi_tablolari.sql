-- Migration 049: Oto Yıkama kendi tabloları — mevcut görev sistemine dokunmaz
--
-- 048'de eklenen iki kolonu GERİ AL (yanlış tasarım kararıydı):
--   - gorevler.hedef_tarih
--   - lokasyonlar.yikama_istasyonu_mi
--
-- Onların yerine Oto Yıkama'ya özel iki yeni tablo kuruyoruz:
--   - yikama_istasyonlari : hangi lokasyon istasyon (mevcut lokasyon
--                           QR sistemini kullanır, ayrı flag DB temizliği)
--   - yikama_gorevleri    : plaka × istasyon × tarih bazlı görev,
--                           mevcut gorevler tablosundan tamamen bağımsız

-- 1) 048 geri al
DROP INDEX IF EXISTS gorevler_hedef_tarih_idx;
ALTER TABLE gorevler   DROP COLUMN IF EXISTS hedef_tarih;
ALTER TABLE lokasyonlar DROP COLUMN IF EXISTS yikama_istasyonu_mi;

-- 2) Yıkama istasyonları (lokasyon ↔ oto yıkama bağlama tablosu)
CREATE TABLE IF NOT EXISTS public.yikama_istasyonlari (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id uuid NOT NULL REFERENCES firmalar(id) ON DELETE CASCADE,
  lokasyon_id uuid NOT NULL REFERENCES lokasyonlar(id) ON DELETE CASCADE,
  ad text NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  notlar text,
  olusturan_id uuid REFERENCES users(id) ON DELETE SET NULL,
  olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
  guncelleme_tarihi timestamptz NOT NULL DEFAULT now(),
  UNIQUE (firma_id, lokasyon_id)
);

CREATE INDEX IF NOT EXISTS yikama_istasyonlari_firma_aktif_idx
  ON yikama_istasyonlari(firma_id, aktif);
CREATE INDEX IF NOT EXISTS yikama_istasyonlari_lokasyon_idx
  ON yikama_istasyonlari(lokasyon_id);

-- 3) Görev durum ENUM
DO $$ BEGIN
  CREATE TYPE yikama_gorev_durum AS ENUM ('ACIK', 'ISLEMDE', 'TAMAMLANDI', 'IPTAL');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 4) Yıkama görevleri (plaka × istasyon × tarih)
CREATE TABLE IF NOT EXISTS public.yikama_gorevleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id uuid NOT NULL REFERENCES firmalar(id) ON DELETE CASCADE,
  arac_id uuid NOT NULL REFERENCES araclar(id) ON DELETE CASCADE,
  istasyon_id uuid NOT NULL REFERENCES yikama_istasyonlari(id) ON DELETE CASCADE,

  -- Plaka değişirse görev geçmişi bozulmasın diye snapshot tutulur.
  plaka_snapshot text NOT NULL,
  hedef_tarih date NOT NULL,
  durum yikama_gorev_durum NOT NULL DEFAULT 'ACIK',

  -- Operasyon audit
  olusturan_id uuid REFERENCES users(id) ON DELETE SET NULL,
  olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
  baslatan_id uuid REFERENCES users(id) ON DELETE SET NULL,
  baslatilma_tarihi timestamptz,
  tamamlayan_id uuid REFERENCES users(id) ON DELETE SET NULL,
  tamamlanma_tarihi timestamptz,
  iptal_sebep text,
  notlar text,

  -- Aynı (plaka, istasyon, gün) için tek görev — duplicate engelle
  UNIQUE (firma_id, arac_id, istasyon_id, hedef_tarih)
);

CREATE INDEX IF NOT EXISTS yikama_gorevleri_firma_tarih_durum_idx
  ON yikama_gorevleri(firma_id, hedef_tarih, durum);
CREATE INDEX IF NOT EXISTS yikama_gorevleri_istasyon_tarih_idx
  ON yikama_gorevleri(istasyon_id, hedef_tarih);
CREATE INDEX IF NOT EXISTS yikama_gorevleri_arac_idx
  ON yikama_gorevleri(arac_id);
CREATE INDEX IF NOT EXISTS yikama_gorevleri_durum_idx
  ON yikama_gorevleri(durum) WHERE durum IN ('ACIK', 'ISLEMDE');

-- 5) RLS (sadece SA görür/yönetir — yetki helper'ı zaten API tarafında check ediyor)
ALTER TABLE yikama_istasyonlari ENABLE ROW LEVEL SECURITY;
ALTER TABLE yikama_gorevleri    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS yikama_istasyonlari_sa_select ON yikama_istasyonlari;
CREATE POLICY yikama_istasyonlari_sa_select ON yikama_istasyonlari
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users
                 WHERE users.id = auth.uid()
                   AND users.rol IN ('super_admin', 'alt_super_admin')));

DROP POLICY IF EXISTS yikama_gorevleri_sa_select ON yikama_gorevleri;
CREATE POLICY yikama_gorevleri_sa_select ON yikama_gorevleri
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users
                 WHERE users.id = auth.uid()
                   AND users.rol IN ('super_admin', 'alt_super_admin')));

-- 6) guncelleme_tarihi trigger
CREATE OR REPLACE FUNCTION yikama_istasyonlari_update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.guncelleme_tarihi = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS yikama_istasyonlari_update_ts ON yikama_istasyonlari;
CREATE TRIGGER yikama_istasyonlari_update_ts
  BEFORE UPDATE ON yikama_istasyonlari
  FOR EACH ROW EXECUTE FUNCTION yikama_istasyonlari_update_timestamp();

COMMENT ON TABLE yikama_istasyonlari IS 'Oto Yıkama: hangi lokasyon bir yıkama istasyonu. Mevcut lokasyon QR sistemiyle bağlanır.';
COMMENT ON TABLE yikama_gorevleri    IS 'Oto Yıkama: plaka × istasyon × hedef tarih bazlı görev. Mevcut gorevler tablosundan tamamen bağımsız.';
