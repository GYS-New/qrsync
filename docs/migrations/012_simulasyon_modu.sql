-- ═══════════════════════════════════════════════════════════════════════════
-- 012 — Simülasyon Modu
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Simülasyon ayarları tablosu
CREATE TABLE IF NOT EXISTS simulasyon_ayarlari (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id        uuid NOT NULL REFERENCES firmalar(id) ON DELETE CASCADE,
  proje_id        uuid REFERENCES projeler(id) ON DELETE CASCADE,
  aktif           boolean NOT NULL DEFAULT false,
  ust_lokasyon_id uuid NOT NULL REFERENCES lokasyonlar(id) ON DELETE CASCADE,
  hedef_oran      integer NOT NULL DEFAULT 100 CHECK (hedef_oran BETWEEN 1 AND 100),
  gorev_suresi_dk integer NOT NULL DEFAULT 10 CHECK (gorev_suresi_dk >= 1),
  olusturan_id    uuid REFERENCES users(id),
  olusturma_tarihi timestamptz DEFAULT now(),
  guncelleme_tarihi timestamptz DEFAULT now(),
  UNIQUE (firma_id, proje_id, ust_lokasyon_id)
);

-- RLS
ALTER TABLE simulasyon_ayarlari ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sa_full" ON simulasyon_ayarlari
  FOR ALL USING (true) WITH CHECK (true);

-- 2. canli_gorevler'e simüle flag'i
ALTER TABLE canli_gorevler
  ADD COLUMN IF NOT EXISTS simule_tamamlandi boolean DEFAULT false;

ALTER TABLE canli_gorevler_arsiv
  ADD COLUMN IF NOT EXISTS simule_tamamlandi boolean DEFAULT false;

-- Index for quick filtering
CREATE INDEX IF NOT EXISTS idx_canli_gorevler_simule ON canli_gorevler(simule_tamamlandi) WHERE simule_tamamlandi = true;
