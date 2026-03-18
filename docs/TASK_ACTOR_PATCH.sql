-- Canlı görevlerde işlemi yapan kullanıcıyı da sakla
ALTER TABLE canli_gorevler
ADD COLUMN IF NOT EXISTS islemi_yapan_id uuid REFERENCES users(id);

-- Mevcut kayıtlarda boş olan alanları son anlamlı kullanıcı ile doldur
UPDATE canli_gorevler
SET islemi_yapan_id = COALESCE(islemi_yapan_id, tamamlayan_kullanici_id, iptal_eden_id, baslatan_kullanici_id, olusturan_id)
WHERE islemi_yapan_id IS NULL;
