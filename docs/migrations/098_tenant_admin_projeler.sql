-- 098: TA çoklu proje atama — tenant_admin_projeler junction tablo
--
-- Sebep: TA şu ana kadar tek projeye atanıyordu (users.proje_id). SA artık
-- bir TA'yı birden fazla projeye atayabilir → o TA tüm seçili projeleri
-- görüntüleyip TA yetkisiyle yönetebilir.
--
-- Tasarım:
--   - users.proje_id geriye uyumluluk için KALDIRILMADI; TA için "default
--     proje" gibi davranır (cookie yoksa hangi projeye düşeceği).
--   - tenant_admin_projeler junction: TA'nın izinli olduğu TÜM projeler.
--   - getAktifProje TA için cookie izinli olmalı; değilse junction'daki
--     ilk izinli projeye fallback.
--
-- Seed: mevcut TA'ların proje_id'leri junction'a kopyalanır → davranış
-- değişmez. Çoklu proje atama ancak SA UI'dan ek seçim yaptığında devreye
-- girer.

CREATE TABLE IF NOT EXISTS tenant_admin_projeler (
  user_id     uuid NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  proje_id    uuid NOT NULL REFERENCES projeler(id) ON DELETE CASCADE,
  firma_id    uuid NOT NULL REFERENCES firmalar(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES users(id),
  PRIMARY KEY (user_id, proje_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_admin_projeler_user  ON tenant_admin_projeler (user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_admin_projeler_proje ON tenant_admin_projeler (proje_id);
CREATE INDEX IF NOT EXISTS idx_tenant_admin_projeler_firma ON tenant_admin_projeler (firma_id);

COMMENT ON TABLE tenant_admin_projeler IS
  'TA''nın görüntüleyebileceği projeler. Junction; users.proje_id default proje olarak korunur.';

-- Seed: tüm aktif TA'ların mevcut proje_id'lerini kopyala
INSERT INTO tenant_admin_projeler (user_id, proje_id, firma_id)
SELECT u.id, u.proje_id, u.firma_id
FROM users u
WHERE u.rol = 'tenant_admin'
  AND u.aktif = true
  AND u.proje_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE tenant_admin_projeler ENABLE ROW LEVEL SECURITY;

-- SA tam yetki
CREATE POLICY "tap_sa_full" ON tenant_admin_projeler
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND rol IN ('super_admin', 'alt_super_admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND rol IN ('super_admin', 'alt_super_admin')
    )
  );

-- TA kendi kayıtlarını okuyabilir (proje seçici dropdown'u için)
CREATE POLICY "tap_ta_self_read" ON tenant_admin_projeler
  FOR SELECT
  USING (user_id = auth.uid());

-- GRANT (mig template — Yeni tablo/view DDL'inde zorunlu)
GRANT ALL ON tenant_admin_projeler TO authenticated;
GRANT ALL ON tenant_admin_projeler TO service_role;
