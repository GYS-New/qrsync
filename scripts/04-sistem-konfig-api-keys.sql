-- Sistem konfigürasyonuna API key kolonları
-- 2026-04-18 — Anthropic (İO Asistan) + Resend (e-posta)

ALTER TABLE public.sistem_konfigurasyon
  ADD COLUMN IF NOT EXISTS anthropic_api_key text,
  ADD COLUMN IF NOT EXISTS resend_api_key text;

COMMENT ON COLUMN public.sistem_konfigurasyon.anthropic_api_key IS 'İO Asistan için Anthropic API key. Boşsa env ANTHROPIC_API_KEY kullanılır.';
COMMENT ON COLUMN public.sistem_konfigurasyon.resend_api_key IS 'E-posta gönderimi için Resend API key. Boşsa env RESEND_API_KEY kullanılır.';
