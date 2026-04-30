-- ─────────────────────────────────────────────────────────────────────────
-- 031: users — telefonu boş olan kullanıcılara default '0 555 555 55 55' ata
--
-- Amaç: Push gönderim/raporlamada eksik telefon problemlerini önlemek için
-- standartlaştırma. Telefonu olan kullanıcılar HİÇBİR ŞEKİLDE etkilenmez —
-- sadece NULL veya whitespace-only değerler güncellenir.
--
-- Risk: SIFIR — sadece NULL/boş değerleri etkiler. Mevcut yazılı telefon
-- numaraları (her formatta) olduğu gibi kalır.
-- Geri alma: aynı kayıtları NULL'a döndürmek (varsa eski hâlleri).
-- ─────────────────────────────────────────────────────────────────────────

UPDATE users
SET telefon = '0 555 555 55 55'
WHERE telefon IS NULL
   OR trim(telefon) = '';
