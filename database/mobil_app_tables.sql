-- =====================================================
-- QRSync Mobil Uygulama Tabloları
-- Bu SQL'i Supabase SQL Editor'de çalıştırın
-- =====================================================

-- 1. Cihaz token tablosu
CREATE TABLE IF NOT EXISTS device_tokens (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id       text NOT NULL UNIQUE,
  device_token    text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  firma_id        uuid NOT NULL REFERENCES firmalar(id) ON DELETE CASCADE,
  isim_soyisim    text NOT NULL,
  aktif           boolean DEFAULT true,
  kayit_tarihi    timestamptz DEFAULT now(),
  son_kullanim    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_device_id ON device_tokens(device_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_device_token ON device_tokens(device_token);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id);

-- 2. Uygulama indirme linkleri tablosu
CREATE TABLE IF NOT EXISTS app_download_links (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  firma_id        uuid NOT NULL REFERENCES firmalar(id) ON DELETE CASCADE,
  link_token      text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  mod             text NOT NULL DEFAULT 'QR' CHECK (mod IN ('QR', 'NFC')),
  aktif           boolean DEFAULT true,
  olusturma_tarihi timestamptz DEFAULT now(),
  olusturan_id    uuid REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_app_download_links_firma ON app_download_links(firma_id);
CREATE INDEX IF NOT EXISTS idx_app_download_links_token ON app_download_links(link_token);

-- =====================================================
-- RLS Politikaları (isteğe bağlı)
-- =====================================================

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_download_links ENABLE ROW LEVEL SECURITY;

-- Service role her şeye erişebilir
CREATE POLICY "service_role_device_tokens" ON device_tokens
  FOR ALL TO service_role USING (true);

CREATE POLICY "service_role_app_download_links" ON app_download_links
  FOR ALL TO service_role USING (true);

-- =====================================================
-- Test: Demo indirme linki oluştur (isteğe bağlı)
-- Firma ID'nizi buraya yazın
-- =====================================================
-- INSERT INTO app_download_links (firma_id, mod) 
-- VALUES ('FIRMA_ID_BURAYA', 'QR');
