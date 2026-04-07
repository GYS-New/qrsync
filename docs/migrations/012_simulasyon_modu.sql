-- ═══════════════════════════════════════════════════════════════════════════
-- 012 — Simülasyon Modu (v2 — grup bazlı)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Ana simülasyon ayarları (üst lokasyon bazlı)
CREATE TABLE IF NOT EXISTS simulasyon_ayarlari (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id        uuid NOT NULL REFERENCES firmalar(id) ON DELETE CASCADE,
  proje_id        uuid REFERENCES projeler(id) ON DELETE CASCADE,
  aktif           boolean NOT NULL DEFAULT false,
  ust_lokasyon_id uuid NOT NULL REFERENCES lokasyonlar(id) ON DELETE CASCADE,
  olusturan_id    uuid REFERENCES users(id),
  olusturma_tarihi timestamptz DEFAULT now(),
  guncelleme_tarihi timestamptz DEFAULT now(),
  UNIQUE (firma_id, proje_id, ust_lokasyon_id)
);

ALTER TABLE simulasyon_ayarlari ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sa_full" ON simulasyon_ayarlari FOR ALL USING (true) WITH CHECK (true);

-- 2. Grup bazlı ayarlar (her grup için ayrı hedef ve süre)
CREATE TABLE IF NOT EXISTS simulasyon_grup_ayarlari (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulasyon_id   uuid NOT NULL REFERENCES simulasyon_ayarlari(id) ON DELETE CASCADE,
  grup_id         uuid NOT NULL REFERENCES lokasyon_gruplari(id) ON DELETE CASCADE,
  hedef_oran      integer NOT NULL DEFAULT 100 CHECK (hedef_oran BETWEEN 1 AND 100),
  gorev_suresi_dk integer NOT NULL DEFAULT 10 CHECK (gorev_suresi_dk >= 1),
  UNIQUE (simulasyon_id, grup_id)
);

ALTER TABLE simulasyon_grup_ayarlari ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sga_full" ON simulasyon_grup_ayarlari FOR ALL USING (true) WITH CHECK (true);

-- 3. Simülasyona dahil edilecek personeller
CREATE TABLE IF NOT EXISTS simulasyon_personeller (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulasyon_id   uuid NOT NULL REFERENCES simulasyon_ayarlari(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (simulasyon_id, user_id)
);

ALTER TABLE simulasyon_personeller ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sp_full" ON simulasyon_personeller FOR ALL USING (true) WITH CHECK (true);

-- 4. canli_gorevler'e simüle flag'i
ALTER TABLE canli_gorevler
  ADD COLUMN IF NOT EXISTS simule_tamamlandi boolean DEFAULT false;

ALTER TABLE canli_gorevler_arsiv
  ADD COLUMN IF NOT EXISTS simule_tamamlandi boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_canli_gorevler_simule ON canli_gorevler(simule_tamamlandi) WHERE simule_tamamlandi = true;
