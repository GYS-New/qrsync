-- 094: Vardiya ayarlarını proje seviyesine taşı (faz 1: kolonları ekle + firma değerlerini snapshot olarak kopyala)
--
-- Sebep: Mevcut yapıda vardiya ayarları firmalar tablosunda (firma seviyesi);
-- tüm projeler aynı vardiyaya zorunluydu. Yeni proje (Çanakkale Köprü) farklı
-- vardiya düzeni isteyince mimari sorun çıktı.
--
-- Strateji: Geri uyumlu kademeli geçiş.
--   1. projeler tablosuna 3 nullable kolon ekle (bu migration)
--   2. Mevcut tüm projelere firma değerlerini kopyala (snapshot) →
--      proje değerleri = firma değerleri → davranış değişmez
--   3. Kod tarafında okuma noktaları helper getEffectiveVardiya() üzerinden:
--      önce proje değeri, yoksa firma fallback
--   4. UI panel'de "Firma Default" vs "Proje Override" toggle
--
-- Risk: Düşük. Bu migration sonrası eski kod (firmadan okuyan) hala doğru
-- sonuç verir çünkü proje değerleri firma'nın aynısı. Override işlemi
-- ancak UI'dan kullanıcı tetiklediğinde davranış değiştirir.

ALTER TABLE projeler
  ADD COLUMN IF NOT EXISTS vardiya_sayisi integer,
  ADD COLUMN IF NOT EXISTS vardiya_saatleri jsonb,
  ADD COLUMN IF NOT EXISTS tum_vardiya_ayarlari jsonb;

-- Snapshot: tüm projeler için firma değerlerini kopyala
UPDATE projeler p
SET vardiya_sayisi = f.vardiya_sayisi,
    vardiya_saatleri = f.vardiya_saatleri,
    tum_vardiya_ayarlari = f.tum_vardiya_ayarlari
FROM firmalar f
WHERE p.firma_id = f.id
  AND (p.vardiya_sayisi IS NULL OR p.vardiya_saatleri IS NULL OR p.tum_vardiya_ayarlari IS NULL);

COMMENT ON COLUMN projeler.vardiya_sayisi IS 'Proje-seviyesi vardiya sayısı override. NULL ise firma değeri kullanılır.';
COMMENT ON COLUMN projeler.vardiya_saatleri IS 'Proje-seviyesi vardiya saatleri (legacy 3-vardiya jsonb). NULL ise firma değeri kullanılır.';
COMMENT ON COLUMN projeler.tum_vardiya_ayarlari IS 'Proje-seviyesi tüm vardiya konfigürasyonu (yeni format). NULL ise firma değeri kullanılır.';
