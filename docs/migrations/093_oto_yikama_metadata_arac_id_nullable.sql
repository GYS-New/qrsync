-- 093: oto_yikama_gorev_metadata.arac_id nullable yapıldı
--
-- Sebep: Ekstra Görev sayfasında "Yeni Plaka" (sistemde tanımlı olmayan
-- ama elle yazılmış plaka) veya "PLAKASIZ" (tanımsız araç) ile manuel
-- görev oluşturulabilmesi gerekiyor. Önceden arac_id NOT NULL olduğu için
-- her ekstra görev mutlaka bir araclar kaydına bağlı olmak zorundaydı.
--
-- Yeni davranış:
--   - arac_id NULL kabul edilir → araç DB'de yok, sadece plaka_snapshot
--     ile takip edilir (PLAKASIZ veya elden yazılmış plaka).
--   - Mevcut FK CASCADE'i bozmaz (FK zaten nullable kolona da uygulanır).
--   - plaka_snapshot hala NOT NULL — manuel plaka için zorunlu (PLAKASIZ
--     string'i yazılabilir).

ALTER TABLE oto_yikama_gorev_metadata
  ALTER COLUMN arac_id DROP NOT NULL;
