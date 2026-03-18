-- ═══════════════════════════════════════════════════════════════
-- FREKANS GÖSTERGELERİ BACKFILL MIGRATION
-- Supabase SQL Editor'da çalıştırın
-- ═══════════════════════════════════════════════════════════════

-- ADIM 1: Kolon yoksa ekle (zaten varsa atlar)
ALTER TABLE canli_gorevler
  ADD COLUMN IF NOT EXISTS gunluk_frekans_sayisi integer NOT NULL DEFAULT 0;

-- ADIM 2: Mevcut frekans görevlerini backfill et
-- Frekans görevi = aynı (firma_id, lokasyon_id, tanim, tarih) grubunda birden fazla kayıt olan
-- Günlük frekans sayısı = o gün içinde aynı lokasyon+tanim'den kaç kayıt var
UPDATE canli_gorevler AS cg
SET gunluk_frekans_sayisi = sub.daily_count
FROM (
  SELECT
    id,
    COUNT(*) OVER (
      PARTITION BY firma_id, lokasyon_id, tanim, DATE(aktif_olma_tarihi)
    ) AS daily_count
  FROM canli_gorevler
  WHERE gunluk_frekans_sayisi = 0   -- sadece henüz set edilmemişleri güncelle
    AND aktif_olma_tarihi IS NOT NULL
) sub
WHERE cg.id = sub.id
  AND sub.daily_count > 1;          -- tek kayıt olanlar tekil görev → 0 kalır

-- ADIM 3: Sonucu kontrol et
SELECT
  tanim,
  lokasyon_id,
  DATE(aktif_olma_tarihi) AS tarih,
  COUNT(*) AS kayit_sayisi,
  MAX(gunluk_frekans_sayisi) AS gfs_degeri
FROM canli_gorevler
WHERE aktif_olma_tarihi IS NOT NULL
GROUP BY tanim, lokasyon_id, DATE(aktif_olma_tarihi)
ORDER BY kayit_sayisi DESC
LIMIT 20;
