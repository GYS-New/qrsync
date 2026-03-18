-- Migration 006: Müşteri Değerlendirmeleri
-- QR veya NFC okutulan anonim kişilerin bıraktığı yıldız + yorum kayıtları

CREATE TABLE IF NOT EXISTS musteri_degerlendirmeleri (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lokasyon_id       UUID        NOT NULL REFERENCES lokasyonlar(id) ON DELETE CASCADE,
  firma_id          UUID        NOT NULL REFERENCES firmalar(id) ON DELETE CASCADE,
  proje_id          UUID        REFERENCES projeler(id) ON DELETE SET NULL,

  kanal             TEXT        NOT NULL CHECK (kanal IN ('QR','NFC')),
  qr_token          TEXT,                        -- hangi token'dan geldiği

  yildiz            SMALLINT    NOT NULL CHECK (yildiz BETWEEN 1 AND 5),
  yorum             TEXT,                        -- isteğe bağlı
  ad_soyad          TEXT,                        -- isteğe bağlı
  gorsel_url        TEXT,                        -- Supabase storage public URL

  ip_adresi         TEXT,
  user_agent        TEXT,

  olusturma_tarihi  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_md_firma    ON musteri_degerlendirmeleri(firma_id, olusturma_tarihi DESC);
CREATE INDEX IF NOT EXISTS idx_md_lokasyon ON musteri_degerlendirmeleri(lokasyon_id, olusturma_tarihi DESC);
CREATE INDEX IF NOT EXISTS idx_md_proje    ON musteri_degerlendirmeleri(proje_id,   olusturma_tarihi DESC);

-- RLS: anonim de insert edebilir, okuma firma bazlı
ALTER TABLE musteri_degerlendirmeleri ENABLE ROW LEVEL SECURITY;

CREATE POLICY "md_public_insert" ON musteri_degerlendirmeleri
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "md_firma_select" ON musteri_degerlendirmeleri
  FOR SELECT TO authenticated
  USING (
    firma_id = (SELECT firma_id FROM users WHERE id = auth.uid())
    OR
    (SELECT rol FROM users WHERE id = auth.uid()) IN ('super_admin','alt_super_admin')
  );

-- Supabase Storage: manuel oluşturun
-- Bucket: degerlendirme-gorseller | Public: true | Max: 5MB | MIME: image/*
