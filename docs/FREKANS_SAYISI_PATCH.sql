-- canli_gorevler tablosuna gunluk_frekans_sayisi kolonu ekle
-- 0 = tekil görev (frekans yok), >0 = günlük frekans sayısı
ALTER TABLE canli_gorevler
  ADD COLUMN IF NOT EXISTS gunluk_frekans_sayisi integer NOT NULL DEFAULT 0;
