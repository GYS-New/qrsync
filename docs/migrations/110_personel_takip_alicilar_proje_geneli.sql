-- Migration 110: personel_takip_alicilar proje geneli destegi
--
-- Onceki durum: ust_lokasyon_id NOT NULL — her satir mutlaka bir ust
-- lokasyona bagliydi. Personelleri sabit ust_lokasyon'a atanmayan projelerde
-- (ornek: Canakkale) alici tanimlanamiyordu; sistem TA'yi otomatik ekliyordu.
--
-- Yeni durum: ust_lokasyon_id NULLABLE.
--   - ust_lokasyon_id DOLU → o ust lokasyonun personeli icin uygulanir (mevcut)
--   - ust_lokasyon_id NULL → proje geneli, tum personel icin uygulanir (yeni)
--
-- Uygulama: cron 3. bildirimde:
--   a) Personelin ust_lokasyon'una atanmis alicilar (varsa)
--   b) Projeye atanmis "proje geneli" alicilar (ust_lokasyon_id NULL)
--   birlesim (tekilleştir)
--
-- TA otomatik alici da KALDIRILDI (kod tarafi). TA'lar da alici listesinden
-- secilmeli.

ALTER TABLE personel_takip_alicilar ALTER COLUMN ust_lokasyon_id DROP NOT NULL;

COMMENT ON COLUMN personel_takip_alicilar.ust_lokasyon_id IS
  'Ust lokasyon ID. NULL = proje geneli (tum personel icin uygulanir). Personelleri sabit ust_lokasyon''a atanmayan projeler icin.';
