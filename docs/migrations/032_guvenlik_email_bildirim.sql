-- ─────────────────────────────────────────────────────────────────────────
-- 032: Güvenlik email bildirim altyapısı
--
-- Amaç: Sistem kritik bir alert oluşturduğunda (saldırı şüphesi, anomali vs.)
-- konfigüre edilmiş email adresine otomatik bildirim gönderme.
--
-- Risk: SIFIR — sadece NULLABLE kolon ekler (DEFAULT'lu olanlar mevcut
-- satırlarda otomatik ozcana1679@gmail.com değerini alır).
-- Geri alma: 2 satır DROP COLUMN.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) sistem_konfigurasyon: bildirim email adresi
ALTER TABLE sistem_konfigurasyon
  ADD COLUMN IF NOT EXISTS guvenlik_email text DEFAULT 'ozcana1679@gmail.com';

COMMENT ON COLUMN sistem_konfigurasyon.guvenlik_email IS
  'Güvenlik bildirim emaillerinin gönderileceği adres. NULL veya boş ise bildirim atlanır.';

-- 2) sistem_alerts: hangi alert'in email gönderildiğini takip
ALTER TABLE sistem_alerts
  ADD COLUMN IF NOT EXISTS bildirim_tarihi timestamptz;

COMMENT ON COLUMN sistem_alerts.bildirim_tarihi IS
  'Email bildirimi gönderildiği zaman damgası. NULL = henüz bildirilmedi (cron tarafından email atılacak).';

-- 3) Bildirilmemiş kritik/yüksek alert'leri hızlıca bulmak için partial index
CREATE INDEX IF NOT EXISTS idx_alerts_bildirim_pending
  ON sistem_alerts (tarih DESC)
  WHERE bildirim_tarihi IS NULL AND seviye IN ('kritik', 'yuksek');
