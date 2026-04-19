-- ─────────────────────────────────────────────────────────────────────────
-- 013: HAFTALIK FREKANS DESTEĞİ
-- Mevcut günlük sistemi hiç etkilemez. Tüm yeni alanlar NULLABLE.
-- Eski kurallar varsayılan 'gunluk' tipi ile çalışmaya devam eder.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) gorev_kurallari: frekans tipi + haftalık sayı
ALTER TABLE gorev_kurallari
  ADD COLUMN IF NOT EXISTS frekans_tipi text NOT NULL DEFAULT 'gunluk'
    CHECK (frekans_tipi IN ('gunluk','haftalik')),
  ADD COLUMN IF NOT EXISTS haftalik_frekans_sayisi int
    CHECK (haftalik_frekans_sayisi IS NULL OR haftalik_frekans_sayisi BETWEEN 1 AND 20);

-- gunluk_frekans_sayisi'ni nullable yap (haftalık kurallarda kullanılmayacak)
-- NOT: Eski kayıtlar zaten dolu, veri kaybı yok.
ALTER TABLE gorev_kurallari
  ALTER COLUMN gunluk_frekans_sayisi DROP NOT NULL;

-- Eski CHECK kaldır, yeni koşullu CHECK ekle
ALTER TABLE gorev_kurallari
  DROP CONSTRAINT IF EXISTS gorev_kurallari_gunluk_frekans_sayisi_check;

ALTER TABLE gorev_kurallari
  ADD CONSTRAINT gorev_kurallari_frekans_check CHECK (
    (frekans_tipi = 'gunluk' AND gunluk_frekans_sayisi IS NOT NULL
      AND gunluk_frekans_sayisi BETWEEN 1 AND 24)
    OR
    (frekans_tipi = 'haftalik' AND haftalik_frekans_sayisi IS NOT NULL
      AND haftalik_frekans_sayisi BETWEEN 1 AND 20)
  );

COMMENT ON COLUMN gorev_kurallari.frekans_tipi IS
  'gunluk: her gün aktif_gunler içindeki günlerde gunluk_frekans_sayisi kadar üretir. haftalik: hafta içinde (Pzt 00:00 başlangıçlı) aktif_gunler içindeki izinli günlerde haftalik_frekans_sayisi kadar üretir.';


-- 2) lokasyonlar: haftalık frekans sayısı (lokasyon başına default)
ALTER TABLE lokasyonlar
  ADD COLUMN IF NOT EXISTS haftalik_frekans_sayisi int
    CHECK (haftalik_frekans_sayisi IS NULL OR haftalik_frekans_sayisi BETWEEN 0 AND 20);

COMMENT ON COLUMN lokasyonlar.haftalik_frekans_sayisi IS
  'Frekans Sayıları sayfasından lokasyon başına atanır. Haftalık kural oluştururken varsayılan olarak buradan okunur. NULL = henüz atanmadı.';


-- 3) firmalar: haftalık durum değişim süreleri
ALTER TABLE firmalar
  ADD COLUMN IF NOT EXISTS haftalik_acik_bekleme_saat int
    CHECK (haftalik_acik_bekleme_saat IS NULL OR haftalik_acik_bekleme_saat BETWEEN 1 AND 240),
  ADD COLUMN IF NOT EXISTS haftalik_bekleme_gecmis_saat int
    CHECK (haftalik_bekleme_gecmis_saat IS NULL OR haftalik_bekleme_gecmis_saat BETWEEN 1 AND 240);

COMMENT ON COLUMN firmalar.haftalik_acik_bekleme_saat IS
  'Haftalık görevler için Açık → Beklemede geçiş süresi (saat). NULL ise günlük değere fallback.';
COMMENT ON COLUMN firmalar.haftalik_bekleme_gecmis_saat IS
  'Haftalık görevler için Beklemede → Zamanı Geçmiş geçiş süresi (saat). NULL ise günlük değere fallback.';


-- 4) projeler: aynı override alanları (proje > firma cascade)
ALTER TABLE projeler
  ADD COLUMN IF NOT EXISTS haftalik_acik_bekleme_saat int
    CHECK (haftalik_acik_bekleme_saat IS NULL OR haftalik_acik_bekleme_saat BETWEEN 1 AND 240),
  ADD COLUMN IF NOT EXISTS haftalik_bekleme_gecmis_saat int
    CHECK (haftalik_bekleme_gecmis_saat IS NULL OR haftalik_bekleme_gecmis_saat BETWEEN 1 AND 240);


-- 5) canli_gorevler: üretildiği kuralın tipini cache'le (opsiyonel ama cron hızlı kararlar için faydalı)
-- Mevcut görevler NULL kalır — cron nullable kabul eder ve kural tipine bakarak yorumlar.
ALTER TABLE canli_gorevler
  ADD COLUMN IF NOT EXISTS frekans_tipi text
    CHECK (frekans_tipi IS NULL OR frekans_tipi IN ('gunluk','haftalik'));

COMMENT ON COLUMN canli_gorevler.frekans_tipi IS
  'Üretildiği kuralın tipini yansıtır. NULL = eski kayıt (gunluk kabul edilir). Durum geçiş süreleri bu alana göre seçilir.';

-- Hafta sayaçları için index (cron bu sorguyu çok sık çalıştıracak)
CREATE INDEX IF NOT EXISTS idx_canli_gorevler_haftalik_sayac
  ON canli_gorevler(kural_id, aktif_olma_tarihi)
  WHERE frekans_tipi = 'haftalik';
