-- Migration 008: Personel Takibi v2
-- Her firma+proje için iş başı / iş bitimi QR ve NFC token'ları
-- + personel_mesai_kayitlari arşiv desteği + firma_id ekleme

-- ── 1. Mesai QR/NFC kod tablosu ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mesai_qr_kodlari (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id          UUID        NOT NULL REFERENCES firmalar(id)  ON DELETE CASCADE,
  proje_id          UUID        REFERENCES projeler(id)           ON DELETE CASCADE,
  tip               TEXT        NOT NULL CHECK (tip IN ('GIRIS','CIKIS')),
  token             TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  nfc_token         TEXT        UNIQUE,
  aktif             BOOLEAN     NOT NULL DEFAULT TRUE,
  olusturma_tarihi  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mqk_firma_proje ON mesai_qr_kodlari(firma_id, proje_id);
CREATE INDEX IF NOT EXISTS idx_mqk_token        ON mesai_qr_kodlari(token);
CREATE INDEX IF NOT EXISTS idx_mqk_nfc          ON mesai_qr_kodlari(nfc_token);

-- ── 2. personel_mesai_kayitlari — firma_id + arşiv kolonları ─────────────────
ALTER TABLE personel_mesai_kayitlari
  ADD COLUMN IF NOT EXISTS firma_id          UUID        REFERENCES firmalar(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS arsivlendi        BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS arsivleme_tarihi  TIMESTAMPTZ;

-- Mevcut kayıtlar için firma_id'yi projeden doldurun (manuel adım):
-- UPDATE personel_mesai_kayitlari pmk
--   SET firma_id = p.firma_id
--   FROM projeler p WHERE p.id = pmk.proje_id;

CREATE INDEX IF NOT EXISTS idx_pmk_bugun  ON personel_mesai_kayitlari(firma_id, proje_id, kayit_tarihi) WHERE NOT arsivlendi;
CREATE INDEX IF NOT EXISTS idx_pmk_arsiv  ON personel_mesai_kayitlari(firma_id, arsivlendi, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pmk_user   ON personel_mesai_kayitlari(user_id, kayit_tarihi);

-- ── 3. RLS — mesai_qr_kodlari ────────────────────────────────────────────────
ALTER TABLE mesai_qr_kodlari ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mqk_select" ON mesai_qr_kodlari FOR SELECT TO authenticated
  USING (
    firma_id = (SELECT firma_id FROM users WHERE id = auth.uid())
    OR (SELECT rol FROM users WHERE id = auth.uid()) IN ('super_admin','alt_super_admin')
  );

CREATE POLICY "mqk_insert" ON mesai_qr_kodlari FOR INSERT TO authenticated
  WITH CHECK (
    firma_id = (SELECT firma_id FROM users WHERE id = auth.uid())
    OR (SELECT rol FROM users WHERE id = auth.uid()) IN ('super_admin','alt_super_admin')
  );

CREATE POLICY "mqk_delete" ON mesai_qr_kodlari FOR DELETE TO authenticated
  USING (
    firma_id = (SELECT firma_id FROM users WHERE id = auth.uid())
    OR (SELECT rol FROM users WHERE id = auth.uid()) IN ('super_admin','alt_super_admin')
  );

-- Anonim kullanıcılar token ile okuyabilmeli (QR tarama sayfası için)
CREATE POLICY "mqk_anon_token" ON mesai_qr_kodlari FOR SELECT TO anon
  USING (aktif = TRUE);

-- ── 4. RLS — personel_mesai_kayitlari (güncelle + sil) ───────────────────────
ALTER TABLE personel_mesai_kayitlari ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pmk_select" ON personel_mesai_kayitlari FOR SELECT TO authenticated
  USING (
    firma_id = (SELECT firma_id FROM users WHERE id = auth.uid())
    OR user_id = auth.uid()
    OR (SELECT rol FROM users WHERE id = auth.uid()) IN ('super_admin','alt_super_admin')
  );

CREATE POLICY "pmk_insert" ON personel_mesai_kayitlari FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR (SELECT rol FROM users WHERE id = auth.uid()) IN ('super_admin','alt_super_admin','tenant_admin'));

CREATE POLICY "pmk_update" ON personel_mesai_kayitlari FOR UPDATE TO authenticated
  USING (
    firma_id = (SELECT firma_id FROM users WHERE id = auth.uid())
    OR (SELECT rol FROM users WHERE id = auth.uid()) IN ('super_admin','alt_super_admin')
  );

-- ── 5. Görev atama kısıtı notu ────────────────────────────────────────────────
-- Pasif personele görev ataması: API katmanında kontrol edilir.
-- users tablosuna computed field yerine, görev atama endpoint'lerinde
-- aşağıdaki sorgu ile kontrol yapılmalıdır:
--
-- SELECT COUNT(*) FROM personel_mesai_kayitlari
--   WHERE user_id = $atanan_id
--     AND kayit_tarihi = CURRENT_DATE
--     AND giris_saati IS NOT NULL
--     AND cikis_saati IS NULL
--     AND NOT arsivlendi
-- → 0 ise atama engellenir.
