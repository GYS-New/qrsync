-- ─────────────────────────────────────────────────────────────────────────
-- 015: MANUEL PUSH BİLDİRİMLERİ
--   - Proje Ayarları'na eklenen ana toggle + U/M rolü alt toggle'ları
--   - Log tablosu: kim, kime, ne zaman, ne gönderdi
--   - Varsayılan KAPALI — hiç kimse etkilenmez
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE firmalar
  ADD COLUMN IF NOT EXISTS manuel_push_aktif boolean,
  ADD COLUMN IF NOT EXISTS manuel_push_u_rolu boolean,
  ADD COLUMN IF NOT EXISTS manuel_push_m_rolu boolean;

ALTER TABLE projeler
  ADD COLUMN IF NOT EXISTS manuel_push_aktif boolean,
  ADD COLUMN IF NOT EXISTS manuel_push_u_rolu boolean,
  ADD COLUMN IF NOT EXISTS manuel_push_m_rolu boolean;

COMMENT ON COLUMN projeler.manuel_push_aktif IS
  'Manuel push bildirim ana toggle. KAPALI = hiç kimse gönderemez. AÇIK = TA ve SA her zaman gönderebilir; U/M için alt toggle''lara bakılır.';
COMMENT ON COLUMN projeler.manuel_push_u_rolu IS
  'manuel_push_aktif=true ise: U rolündeki kullanıcılar da bildirim gönderebilir mi?';
COMMENT ON COLUMN projeler.manuel_push_m_rolu IS
  'manuel_push_aktif=true ise: M (müşteri) rolündeki kullanıcılar da bildirim gönderebilir mi?';

CREATE TABLE IF NOT EXISTS push_bildirim_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id         uuid NOT NULL REFERENCES firmalar(id) ON DELETE CASCADE,
  proje_id         uuid REFERENCES projeler(id) ON DELETE SET NULL,
  gonderen_id      uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  gonderen_isim    text NOT NULL,
  alici_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  alici_isim       text NOT NULL,
  baslik           text NOT NULL,
  icerik           text NOT NULL,
  kanal            text NOT NULL DEFAULT 'default',
  cihaz_sayisi     int NOT NULL DEFAULT 0,
  basarili         boolean NOT NULL DEFAULT true,
  hata_mesaji      text,
  olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_log_firma    ON push_bildirim_log(firma_id);
CREATE INDEX IF NOT EXISTS idx_push_log_gonderen ON push_bildirim_log(gonderen_id);
CREATE INDEX IF NOT EXISTS idx_push_log_alici    ON push_bildirim_log(alici_id);
CREATE INDEX IF NOT EXISTS idx_push_log_tarih    ON push_bildirim_log(olusturma_tarihi DESC);
