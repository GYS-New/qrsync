-- ─────────────────────────────────────────────────────────────────────────
-- Müşteri değerlendirme aksiyonları için arşiv tablosu
-- ─────────────────────────────────────────────────────────────────────────
-- 2026-05-08'de fark edilen veri kaybı:
-- musteri_degerlendirme_aksiyonlari.degerlendirme_id → musteri_degerlendirmeleri.id
-- ON DELETE CASCADE ile bağlıydı. Cron / manuel arşivleme musteri_degerlendirmeleri'den
-- delete yapınca PostgreSQL aksiyonları SESSİZCE siliyordu — audit izi yok, geri
-- dönüş yok. Free plan'da PITR olmadığı için kayıplar geri getirilemedi.
--
-- Çözüm:
-- - Yeni tablo: musteri_degerlendirme_aksiyonlari_arsiv (FK YOK — esnek)
-- - PATCH/cron arşivleme akışı önce aksiyonları kopyalar, sonra ana kayıt siler
-- - Geri yükleme: arşivden ana tabloya geri taşır
-- - Kalıcı sil: hem ana hem arşiv aksiyon kayıtlarını siler
--
-- Schema = aksiyon tablosu + arsivleme_tarihi.
-- Gerçek SQL Supabase MCP üzerinden uygulandı; kanonik referans dosyası burada.

CREATE TABLE IF NOT EXISTS musteri_degerlendirme_aksiyonlari_arsiv (
  id uuid PRIMARY KEY,
  degerlendirme_id uuid NOT NULL,
  aksiyon_metni text NOT NULL,
  gorsel_urls text[] NOT NULL DEFAULT '{}',
  olusturan_id uuid,
  olusturma_tarihi timestamptz NOT NULL,
  guncelleme_tarihi timestamptz,
  arsivleme_tarihi timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_md_aks_arsiv_degerlendirme
  ON musteri_degerlendirme_aksiyonlari_arsiv (degerlendirme_id);

CREATE INDEX IF NOT EXISTS idx_md_aks_arsiv_arsivleme_tarihi
  ON musteri_degerlendirme_aksiyonlari_arsiv (arsivleme_tarihi DESC);

ALTER TABLE musteri_degerlendirme_aksiyonlari_arsiv ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "md_aksiyon_arsiv_okuma" ON musteri_degerlendirme_aksiyonlari_arsiv;
CREATE POLICY "md_aksiyon_arsiv_okuma" ON musteri_degerlendirme_aksiyonlari_arsiv
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid()
      AND u.rol IN ('super_admin','alt_super_admin','tenant_admin'))
  );

DROP POLICY IF EXISTS "md_aksiyon_arsiv_yazma_service" ON musteri_degerlendirme_aksiyonlari_arsiv;
CREATE POLICY "md_aksiyon_arsiv_yazma_service" ON musteri_degerlendirme_aksiyonlari_arsiv
  FOR INSERT WITH CHECK (true);

COMMENT ON TABLE musteri_degerlendirme_aksiyonlari_arsiv IS
  'Arşivlenmiş müşteri değerlendirmelerine ait aksiyon kayıtları. CASCADE delete ile veri kaybını önler.';
