-- Migration 065: kural_duraklatmalari UNIQUE constraint temizliği
--
-- Migration 064 'kural_duraklatmalari_uniq' adında UNIQUE constraint eklemişti
-- (DISTINCT NULLS default). Daha sonra elle 'kural_duraklatmalari_unique_ust_lok'
-- adında NULLS NOT DISTINCT versiyonu eklenmiş — bu daha katı ve doğru (proje_id
-- NULL olan TA durumlarında da duplicate önler).
--
-- İki constraint aynı kolonları kapsıyordu (redundant). Eski olanı drop ediyoruz.

ALTER TABLE kural_duraklatmalari
  DROP CONSTRAINT IF EXISTS kural_duraklatmalari_uniq;

-- Doğrulama: sadece kural_duraklatmalari_unique_ust_lok kalmalı (UNIQUE NULLS NOT DISTINCT).
