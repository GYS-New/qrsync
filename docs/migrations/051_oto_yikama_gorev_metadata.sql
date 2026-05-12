-- Migration 051: Oto Yıkama'yı mevcut "gorevler" tablosu üzerinden yürüt;
--                 mevcut tabloya kolon EKLEMEDEN, yana 1:1 metadata tablosu.
--
-- Karar: yikama_gorevleri ayrı tablosu kaldırıldı; yıkama görevleri normal
-- spesifik görev olarak gorevler tablosuna yazılacak (mobil mevcut akışla
-- görür). gorevler ve gorevler_arsiv tablolarına yıkamaya özel kolon
-- eklenmiyor — onun yerine yana 1:1 oto_yikama_gorev_metadata tablosu.
--
-- Veri henüz yok (yikama_gorevleri tablosu boş), temiz drop + recreate.

-- 1) Eski şemayı temizle
DROP TABLE IF EXISTS yikama_gorevleri;
DROP TYPE IF EXISTS yikama_gorev_durum;

-- 2) Yıkamaya özel metadata — gorevler ile 1:1
CREATE TABLE IF NOT EXISTS public.oto_yikama_gorev_metadata (
  gorev_id   uuid PRIMARY KEY REFERENCES gorevler(id) ON DELETE CASCADE,
  arac_id    uuid NOT NULL REFERENCES araclar(id) ON DELETE CASCADE,
  plaka_snapshot text NOT NULL,        -- araç silinse de raporda plaka okunur
  hedef_tarih    date NOT NULL,        -- görev hangi gün için planlandı
  olusturma_tarihi timestamptz NOT NULL DEFAULT now(),

  -- Aynı (plaka, lokasyon, gün) için duplicate görev oluşmasın diye yardımcı
  -- index. Asıl uniqueness API katmanında kontrol edilir (gorevler tablosuna
  -- üst constraint koymadığımız için).
  UNIQUE (arac_id, hedef_tarih, gorev_id)
);

CREATE INDEX IF NOT EXISTS oto_yikama_metadata_arac_tarih_idx
  ON oto_yikama_gorev_metadata(arac_id, hedef_tarih);
CREATE INDEX IF NOT EXISTS oto_yikama_metadata_tarih_idx
  ON oto_yikama_gorev_metadata(hedef_tarih);

ALTER TABLE oto_yikama_gorev_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oto_yikama_metadata_sa_select ON oto_yikama_gorev_metadata;
CREATE POLICY oto_yikama_metadata_sa_select ON oto_yikama_gorev_metadata
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users
                 WHERE users.id = auth.uid()
                   AND users.rol IN ('super_admin', 'alt_super_admin')));

-- 3) Trigger: yıkama görevi TAMAMLANDI olunca araclar.son_yikama_tarihi'ni güncelle
--    Sadece metadata kaydı olan görevler etkilenir; normal görevler için no-op.
CREATE OR REPLACE FUNCTION oto_yikama_son_yikama_guncelle()
RETURNS TRIGGER AS $$
DECLARE
  v_arac_id uuid;
BEGIN
  IF NEW.durum = 'TAMAMLANDI' AND (OLD.durum IS NULL OR OLD.durum != 'TAMAMLANDI') THEN
    SELECT arac_id INTO v_arac_id
      FROM oto_yikama_gorev_metadata
      WHERE gorev_id = NEW.id;
    IF v_arac_id IS NOT NULL THEN
      UPDATE araclar
        SET son_yikama_tarihi = COALESCE(NEW.tamamlanma_tarihi, now())
        WHERE id = v_arac_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gorevler_oto_yikama_son_yikama ON gorevler;
CREATE TRIGGER gorevler_oto_yikama_son_yikama
  AFTER UPDATE OF durum ON gorevler
  FOR EACH ROW
  EXECUTE FUNCTION oto_yikama_son_yikama_guncelle();

COMMENT ON TABLE oto_yikama_gorev_metadata IS
  'Oto Yıkama: spesifik göreve yıkamaya özel metadata (araç, plaka snapshot, hedef tarih) ekler. gorevler tablosuyla 1:1.';
