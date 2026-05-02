-- ─────────────────────────────────────────────────────────────────────────
-- 036: bildirim_tip enum'a 'musteri_degerlendirme' değeri ekle
--
-- Müşteri değerlendirmesi geldiğinde TA + yetkili U'lara web in-app bildirim
-- atılır (push'a ek olarak). Bu enum değeri ile bildirimler tablosunda
-- ayırt edilir.
--
-- Risk: SIFIR — enum genişletme, mevcut değerleri etkilemez.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TYPE bildirim_tip ADD VALUE IF NOT EXISTS 'musteri_degerlendirme';
