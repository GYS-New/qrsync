-- ══════════════════════════════════════════════════════════════════════════
-- QRSync — Projeler Sistemi Migration
-- Supabase SQL Editor'da tek seferde çalıştırılır.
-- Mevcut veriye dokunmaz — proje_id opsiyoneldir (NULL = projesiz)
-- ══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. PROJELER TABLOSU
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projeler (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id        uuid NOT NULL REFERENCES firmalar(id) ON DELETE CASCADE,
  ad              text NOT NULL,
  aciklama        text,
  renk            text DEFAULT '#2e8b2e',   -- UI'da badge rengi
  aktif           boolean DEFAULT true,
  kayit_tarihi    timestamptz DEFAULT now(),
  kayit_yapan_id  uuid REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_projeler_firma_id ON projeler(firma_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. MEVCUT TABLOLARA proje_id EKLEME (opsiyonel, NULL = projesiz)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE lokasyonlar
  ADD COLUMN IF NOT EXISTS proje_id uuid REFERENCES projeler(id) ON DELETE SET NULL;

ALTER TABLE gorevler
  ADD COLUMN IF NOT EXISTS proje_id uuid REFERENCES projeler(id) ON DELETE SET NULL;

ALTER TABLE canli_gorevler
  ADD COLUMN IF NOT EXISTS proje_id uuid REFERENCES projeler(id) ON DELETE SET NULL;

ALTER TABLE canli_gorevler_arsiv
  ADD COLUMN IF NOT EXISTS proje_id uuid REFERENCES projeler(id) ON DELETE SET NULL;

ALTER TABLE gorev_kurallari
  ADD COLUMN IF NOT EXISTS proje_id uuid REFERENCES projeler(id) ON DELETE SET NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS proje_id uuid REFERENCES projeler(id) ON DELETE SET NULL;

-- checklist tablolarına da ekle
ALTER TABLE checklist_templates
  ADD COLUMN IF NOT EXISTS proje_id uuid REFERENCES projeler(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. İNDEKSLER
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lokasyonlar_proje_id      ON lokasyonlar(proje_id);
CREATE INDEX IF NOT EXISTS idx_gorevler_proje_id          ON gorevler(proje_id);
CREATE INDEX IF NOT EXISTS idx_canli_gorevler_proje_id    ON canli_gorevler(proje_id);
CREATE INDEX IF NOT EXISTS idx_gorev_kurallari_proje_id   ON gorev_kurallari(proje_id);
CREATE INDEX IF NOT EXISTS idx_users_proje_id             ON users(proje_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RLS — PROJELER TABLOSU
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE projeler ENABLE ROW LEVEL SECURITY;

-- SA: tüm projeleri görür
CREATE POLICY projeler_sa_all ON projeler
  FOR ALL
  TO authenticated
  USING (get_my_rol() IN ('super_admin', 'alt_super_admin'));

-- TA: kendi firmasının projelerini görür ve yönetir
CREATE POLICY projeler_ta_select ON projeler
  FOR SELECT
  TO authenticated
  USING (firma_id = get_my_firma_id());

CREATE POLICY projeler_ta_insert ON projeler
  FOR INSERT
  TO authenticated
  WITH CHECK (firma_id = get_my_firma_id() AND get_my_rol() = 'tenant_admin');

CREATE POLICY projeler_ta_update ON projeler
  FOR UPDATE
  TO authenticated
  USING (firma_id = get_my_firma_id() AND get_my_rol() = 'tenant_admin');

CREATE POLICY projeler_ta_delete ON projeler
  FOR DELETE
  TO authenticated
  USING (firma_id = get_my_firma_id() AND get_my_rol() = 'tenant_admin');

-- ─────────────────────────────────────────────────────────────────────────
-- 5. YARDIMCI FONKSİYON: Proje bazlı özet
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_proje_ozet(p_firma_id uuid)
RETURNS TABLE (
  proje_id        uuid,
  proje_ad        text,
  toplam_gorev    bigint,
  acik_gorev      bigint,
  tamamlanan      bigint,
  kullanici_sayisi bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.ad,
    COUNT(DISTINCT cg.id)                                            AS toplam_gorev,
    COUNT(DISTINCT cg.id) FILTER (WHERE cg.durum IN ('HAZIR','ACIK','BEKLEMEDE')) AS acik_gorev,
    COUNT(DISTINCT cg.id) FILTER (WHERE cg.durum = 'TAMAMLANDI')   AS tamamlanan,
    COUNT(DISTINCT u.id)                                             AS kullanici_sayisi
  FROM projeler p
  LEFT JOIN canli_gorevler cg ON cg.proje_id = p.id
  LEFT JOIN users u ON u.proje_id = p.id AND u.aktif = true
  WHERE p.firma_id = p_firma_id AND p.aktif = true
  GROUP BY p.id, p.ad;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. KONTROL
-- ─────────────────────────────────────────────────────────────────────────
SELECT 'projeler tablosu oluşturuldu' AS durum;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'projeler'
ORDER BY ordinal_position;
