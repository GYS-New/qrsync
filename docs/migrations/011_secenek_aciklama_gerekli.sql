-- 011_secenek_aciklama_gerekli.sql
-- checklist_madde_secenekleri tablosuna per-option açıklama zorunluluğu eklendi
-- Eski madde-level aciklama_gerekli_yapilamadi yerine her seçenek kendi ayarını tutar.

ALTER TABLE checklist_madde_secenekleri
  ADD COLUMN IF NOT EXISTS aciklama_gerekli boolean NOT NULL DEFAULT false;

-- Mevcut veriler için: deger 'yapılamadı' içeriyorsa aciklama_gerekli = true
UPDATE checklist_madde_secenekleri
SET aciklama_gerekli = true
WHERE lower(deger) LIKE '%yapılamadı%'
   OR lower(deger) LIKE '%yapilamadi%'
   OR lower(deger) LIKE '%yapılmadı%'
   OR lower(deger) LIKE '%yapilmadi%';
