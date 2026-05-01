-- ─────────────────────────────────────────────────────────────────────────
-- 033: Güvenlik ayarlarını Sistem Ayarları UI'dan yönetilebilir yap
--
-- Amaç: SA'lar Railway env'e ihtiyaç duymadan UI'dan açıp kapayabilsin.
-- Risk: SIFIR — yeni kolonlar default'lu (mevcut davranışla aynı).
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE sistem_konfigurasyon
  ADD COLUMN IF NOT EXISTS guvenlik_mail_aktif boolean NOT NULL DEFAULT true;

ALTER TABLE sistem_konfigurasyon
  ADD COLUMN IF NOT EXISTS rate_limit_mode text NOT NULL DEFAULT 'enforce'
    CHECK (rate_limit_mode IN ('off', 'log', 'enforce'));

COMMENT ON COLUMN sistem_konfigurasyon.guvenlik_mail_aktif IS
  'Güvenlik bildirim emaillerini aç/kapa. false ise cron mail göndermez (kayıt tutmaya devam eder).';

COMMENT ON COLUMN sistem_konfigurasyon.rate_limit_mode IS
  'Rate limit modu: enforce (varsayılan, 429 ile blokla), log (sadece kaydet), off (devre dışı).';
