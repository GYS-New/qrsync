-- ─────────────────────────────────────────────────────────────────────────
-- Personel Değerlendirme Raporu — yetki tanımları
-- Default: sadece SA görür. TA/U/M default kapalı, sonradan açılabilir.
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO kullanici_grubu_yetkileri (firma_id, rol, sayfa_kodu, gorebilir, ekleyebilir, duzenleyebilir, silebilir)
VALUES
  -- Global (firma_id NULL)
  (NULL, 'alt_super_admin', 'personel-degerlendirme-raporlari', true,  true,  true,  true),
  (NULL, 'tenant_admin',    'personel-degerlendirme-raporlari', false, false, false, false),
  (NULL, 'tenant_user',     'personel-degerlendirme-raporlari', false, false, false, false),
  (NULL, 'musteri',         'personel-degerlendirme-raporlari', false, false, false, false),
  -- ATALIAN
  ('a121c4be-77ef-4cc7-8384-9f121eb22112', 'alt_super_admin', 'personel-degerlendirme-raporlari', true,  true,  true,  true),
  ('a121c4be-77ef-4cc7-8384-9f121eb22112', 'tenant_admin',    'personel-degerlendirme-raporlari', false, false, false, false),
  ('a121c4be-77ef-4cc7-8384-9f121eb22112', 'tenant_user',     'personel-degerlendirme-raporlari', false, false, false, false),
  ('a121c4be-77ef-4cc7-8384-9f121eb22112', 'musteri',         'personel-degerlendirme-raporlari', false, false, false, false)
ON CONFLICT DO NOTHING;
