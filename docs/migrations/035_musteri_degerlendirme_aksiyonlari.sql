-- ─────────────────────────────────────────────────────────────────────────
-- 035: Müşteri değerlendirmeleri için aksiyon kaydı
--
-- Düşük puanlı (≤3★) değerlendirmelere ilgili yetkili kullanıcıların
-- aksiyon yazıp görsel ekleyebilmesi için tablo.
--
-- Risk: SIFIR — yeni tablo, FK ON DELETE CASCADE.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS musteri_degerlendirme_aksiyonlari (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  degerlendirme_id uuid NOT NULL UNIQUE
                   REFERENCES musteri_degerlendirmeleri(id) ON DELETE CASCADE,
  aksiyon_metni    text NOT NULL,
  gorsel_urls      text[] NOT NULL DEFAULT '{}',
  olusturan_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
  guncelleme_tarihi timestamptz
);

CREATE INDEX IF NOT EXISTS idx_musteri_deger_aksiyon_deger
  ON musteri_degerlendirme_aksiyonlari (degerlendirme_id);

COMMENT ON TABLE musteri_degerlendirme_aksiyonlari IS
  'Düşük puanlı müşteri değerlendirmelerine yetkili U/TA kullanıcılarının '
  'aldığı aksiyonların kaydı (text + opsiyonel görseller).';
