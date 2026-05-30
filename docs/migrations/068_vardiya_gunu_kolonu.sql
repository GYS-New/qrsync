-- ─────────────────────────────────────────────────────────────────────────────
-- 068: vardiya_gunu kolonu — sarkan vardiya görevlerinin "ait oldukları gün"
--
-- DURUM: ✅ Apply edildi (2026-05-30)
--
-- Sorun: V1 sarkan vardiya (örn 23:30-07:30) → V1 görevinin aktif_olma_tarihi
--   önceki gün akşamı oluyor. Raporlar aktif_olma_tarihi'nin TR günü ile
--   filtrelediği için "1 Haz V1" görevi "31 May" altında listeleniyordu.
--   Kullanıcı isteği: "1 Haz raporu V1+V2+V3 hepsini içermeli".
--
-- Çözüm: vardiya_gunu (date) kolonu — görevin "ait olduğu vardiya günü".
--   gece_gorev_uret p_tarih değerini bu kolona yazar. Raporlar tarih
--   filtresini vardiya_gunu üzerinden yapar.
--
-- Backfill: vardiya_gunu_hesapla() helper'ı ile mevcut görevler için
--   aktif_olma_tarihi'nin firma vardiya ayarına göre sahip olduğu gün
--   hesaplanır (sarkan + evening half → trGun+1, diğer → trGun).
--
-- Mobil/real-time akış (gorevlerim, scan/context) etkilenmez — onlar
-- aktif_olma_tarihi ile çalışmaya devam eder ("ne zaman aktif" sorusu
-- "hangi vardiya günü" sorusundan farklı).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE canli_gorevler        ADD COLUMN IF NOT EXISTS vardiya_gunu date;
ALTER TABLE canli_gorevler_arsiv  ADD COLUMN IF NOT EXISTS vardiya_gunu date;

CREATE INDEX IF NOT EXISTS idx_canli_gorevler_vardiya_gunu       ON canli_gorevler       (vardiya_gunu);
CREATE INDEX IF NOT EXISTS idx_canli_gorevler_arsiv_vardiya_gunu ON canli_gorevler_arsiv (vardiya_gunu);

-- Yardımcı: aktif_olma_tarihi + firma_id → vardiya_gunu hesabı
CREATE OR REPLACE FUNCTION vardiya_gunu_hesapla(
  p_aktif_iso timestamptz,
  p_firma_id  uuid
) RETURNS date
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_tr_dt        timestamptz;
  v_tr_date      date;
  v_tr_saat      text;
  v_vardiya_sayisi int;
  v_aktif_set    jsonb;
  k int;
  v_bas text;
  v_bit text;
BEGIN
  IF p_aktif_iso IS NULL THEN RETURN NULL; END IF;
  v_tr_dt   := p_aktif_iso AT TIME ZONE 'Europe/Istanbul';
  v_tr_date := v_tr_dt::date;
  v_tr_saat := to_char(v_tr_dt, 'HH24:MI');

  SELECT vardiya_sayisi, tum_vardiya_ayarlari -> vardiya_sayisi::text
  INTO v_vardiya_sayisi, v_aktif_set
  FROM firmalar WHERE id = p_firma_id;
  IF v_aktif_set IS NULL THEN RETURN v_tr_date; END IF;

  FOR k IN 0..(jsonb_array_length(v_aktif_set) - 1) LOOP
    v_bas := v_aktif_set -> k ->> 'baslangic';
    v_bit := v_aktif_set -> k ->> 'bitis';
    -- Sarkan vardiya (örn V1 23:30-07:30) + saat evening half'ta
    -- (örn 23:35 >= 23:30) → bu görev sonraki günün vardiyası
    IF v_bit <= v_bas AND v_tr_saat >= v_bas THEN
      RETURN v_tr_date + 1;
    END IF;
  END LOOP;
  RETURN v_tr_date;
END $$;

-- Backfill — apply esnasında bir kez çalışır
UPDATE canli_gorevler SET vardiya_gunu = vardiya_gunu_hesapla(aktif_olma_tarihi, firma_id)
  WHERE vardiya_gunu IS NULL AND aktif_olma_tarihi IS NOT NULL;

UPDATE canli_gorevler_arsiv SET vardiya_gunu = vardiya_gunu_hesapla(aktif_olma_tarihi, firma_id)
  WHERE vardiya_gunu IS NULL AND aktif_olma_tarihi IS NOT NULL;

-- NOT: gece_gorev_uret() ayrı bir migration ile güncellendi (068b)
-- INSERT'lere vardiya_gunu = p_tarih eklendi (yeni görevler için).
