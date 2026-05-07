-- ─────────────────────────────────────────────────────────────────────────
-- Yeni bildirim tipi: kritik_uyari
-- Sistem seviyesi kritik olaylar (örn. proje pasif edildi) için.
-- Frontend'de modal popup tetikler.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TYPE bildirim_tip ADD VALUE IF NOT EXISTS 'kritik_uyari';
