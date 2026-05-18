-- Migration 064: kural_duraklatmalari UNIQUE constraint'ine ust_lokasyon_id ekle
--
-- Sorun: Mevcut UNIQUE (firma_id, proje_id, tanim, tarih, vardiya_no) constraint
-- ust_lokasyon_id'yi içermiyor. Bu yüzden aynı tanım (örn "WC TEMİZLİĞİ") farklı
-- üst lokasyonlar için (MONTAJ + DISGS) aynı tarih+vardiya'ya eklenmek istenince
-- duplicate hatası veriyor.
--
-- POST endpoint zaten onConflict: 'firma_id,proje_id,ust_lokasyon_id,tanim,tarih,
-- vardiya_no' ile upsert yapıyor — DB constraint'i de aynı kolonları içermeli.

ALTER TABLE kural_duraklatmalari
  DROP CONSTRAINT IF EXISTS kural_duraklatmalari_firma_id_proje_id_tanim_tarih_vardiya__key;

ALTER TABLE kural_duraklatmalari
  ADD CONSTRAINT kural_duraklatmalari_uniq
  UNIQUE (firma_id, proje_id, ust_lokasyon_id, tanim, tarih, vardiya_no);

COMMENT ON CONSTRAINT kural_duraklatmalari_uniq ON kural_duraklatmalari IS
  'Aynı üst lokasyon + tanım + tarih + vardiya için tek bir duraklatma kaydı. Farklı üst lokasyonlar için aynı tanım birden fazla kez girilebilir.';
