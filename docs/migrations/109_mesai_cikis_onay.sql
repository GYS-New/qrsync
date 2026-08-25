-- Migration 109: Mesai cikis onay/hatirlatma sistemi
--
-- personel_mesai_kayitlari tablosuna 3 kolon:
--   - cikis_onay_token: push bildirim onay linki icin UUID (tek-kullanimlik)
--   - cikis_bildirim_gonderildi: bir kez push atildi mi (tekrar atmayi engeller)
--   - cikis_devam_flag: personel "devam ediyorum" dedi mi (cron atlar)
--
-- Kullanim:
--   1. Cron (5 dk): PT-aktif projelerde acik mesai + vardiya bitis + 15 dk
--      gecmis + cikis_bildirim_gonderildi=false ise → token uret, push at.
--   2. Personel push'a tiklar → /mesai/cikis-onay/{token} sayfasi acilir
--      (mobil ve web ortak). 2 buton: Cikisimi Yap / Devam Ediyorum.
--   3. Cron (5 dk): vardiya bitis + 30 dk gecmis + cikis_devam_flag=false ise
--      → otomatik kapat (cikis_tipi = 'OTOMATIK_ZAMAN_ASIMI').

ALTER TABLE personel_mesai_kayitlari
  ADD COLUMN IF NOT EXISTS cikis_onay_token text,
  ADD COLUMN IF NOT EXISTS cikis_bildirim_gonderildi boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cikis_devam_flag boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ix_mesai_cikis_token
  ON personel_mesai_kayitlari(cikis_onay_token)
  WHERE cikis_onay_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_mesai_acik_cikis_kontrol
  ON personel_mesai_kayitlari(kayit_tarihi, firma_id)
  WHERE cikis_saati IS NULL;

COMMENT ON COLUMN personel_mesai_kayitlari.cikis_onay_token IS
  'Cikis onay push bildiriminde kullanilan tek-kullanimlik token. Kullanildiktan sonra NULL yapilir.';
COMMENT ON COLUMN personel_mesai_kayitlari.cikis_bildirim_gonderildi IS
  'Cikis unutma push bildirimi bir kez gonderildi mi. TRUE = tekrar gonderme.';
COMMENT ON COLUMN personel_mesai_kayitlari.cikis_devam_flag IS
  'Personel push bildirimden "devam ediyorum" secti mi. TRUE ise otomatik zaman asimi kapatmasi da atlanir.';

-- cikis_tipi yeni degerler (dokumantasyon, enum yoksa constraint gerekli degil):
--   'QR', 'NFC', 'MOBIL', 'OTOMATIK_ONAY', 'OTOMATIK_ZAMAN_ASIMI'
