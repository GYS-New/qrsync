-- Migration 007: Müşteri Değerlendirmelerine arşiv desteği
-- SA ve TA değerlendirmeleri arşivleyebilmeli veya silebilmelidir.

ALTER TABLE musteri_degerlendirmeleri
  ADD COLUMN IF NOT EXISTS arsivlendi       BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS arsivleme_tarihi TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_md_arsiv ON musteri_degerlendirmeleri(firma_id, arsivlendi, olusturma_tarihi DESC);

-- Güncelleme politikası: SA her firma, TA kendi firması
CREATE POLICY "md_firma_update" ON musteri_degerlendirmeleri
  FOR UPDATE TO authenticated
  USING (
    firma_id = (SELECT firma_id FROM users WHERE id = auth.uid())
    OR
    (SELECT rol FROM users WHERE id = auth.uid()) IN ('super_admin','alt_super_admin')
  )
  WITH CHECK (
    firma_id = (SELECT firma_id FROM users WHERE id = auth.uid())
    OR
    (SELECT rol FROM users WHERE id = auth.uid()) IN ('super_admin','alt_super_admin')
  );

-- Silme politikası: aynı kural
CREATE POLICY "md_firma_delete" ON musteri_degerlendirmeleri
  FOR DELETE TO authenticated
  USING (
    firma_id = (SELECT firma_id FROM users WHERE id = auth.uid())
    OR
    (SELECT rol FROM users WHERE id = auth.uid()) IN ('super_admin','alt_super_admin')
  );
