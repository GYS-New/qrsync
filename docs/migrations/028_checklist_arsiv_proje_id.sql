-- ─────────────────────────────────────────────────────────────────────────
-- 028: checklist_sonuc_basliklari_arsiv.proje_id EKSİK KOLON
--   RPC arsivle_canli_gorevler_atomik ve trigger arsivle_canli_gorev_ceklist
--   bu kolona yazmaya çalışıyor ama tabloda yoktu — gece döngüsü hata atıyordu.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE checklist_sonuc_basliklari_arsiv
  ADD COLUMN IF NOT EXISTS proje_id uuid NULL;
COMMENT ON COLUMN checklist_sonuc_basliklari_arsiv.proje_id
  IS 'Arşivleme sırasında kaynak canli_gorev/gorev kaydından kopyalanır. Eski kayıtlarda NULL.';
