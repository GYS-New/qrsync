-- ─────────────────────────────────────────────────────────────────────────
-- 010_gun_sonu_arsivle_fix.sql
--
-- SORUN: gun_sonu_arsivle() fonksiyonu terminal durumlu görevleri (TAMAMLANDI,
-- ZAMANINDA_YAPILAMAYAN, ZAMANI_GECMIS, IPTAL, SILINDI) arşivlemiyordu.
--
-- NEDENLER:
--   1. proje_id kolonu migration 003'te eklendi, fonksiyon güncellenmedi
--   2. Gerçek DB fonksiyonu 001 migrasyonundan farklılaşmış olabilir
--   3. SET search_path eksikliği (SECURITY DEFINER güvenlik iyi pratik)
--
-- DÜZELTME: Fonksiyon sıfırdan doğru şekilde yeniden oluşturuldu.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION gun_sonu_arsivle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_arsivlenen int := 0;
  v_hata       text;
BEGIN
  -- Terminal durumdaki TÜM görevleri arşive kopyala (kural_id fark etmeksizin)
  WITH arsive_tasinanlar AS (
    INSERT INTO canli_gorevler_arsiv (
      id, firma_id, proje_id, tanim, lokasyon_id, atanan_kullanici_id, durum,
      aktif_olma_tarihi, olusturma_tarihi, olusturan_id,
      baslatilma_tarihi, baslatan_kullanici_id,
      tamamlanma_tarihi, tamamlayan_kullanici_id,
      islemi_yapan_id, tamamlanma_suresi_saniye,
      iptal_eden_id, iptal_tarihi, durum_degisim_tarihi,
      gunluk_frekans_sayisi, kural_id,
      arsiv_tarihi, arsiv_nedeni
    )
    SELECT
      id, firma_id, proje_id, tanim, lokasyon_id, atanan_kullanici_id, durum,
      aktif_olma_tarihi, olusturma_tarihi, olusturan_id,
      baslatilma_tarihi, baslatan_kullanici_id,
      tamamlanma_tarihi, tamamlayan_kullanici_id,
      islemi_yapan_id, tamamlanma_suresi_saniye,
      iptal_eden_id, iptal_tarihi, durum_degisim_tarihi,
      COALESCE(gunluk_frekans_sayisi, 0), kural_id,
      now(), 'gun_sonu'
    FROM canli_gorevler
    WHERE durum IN ('TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS', 'IPTAL', 'SILINDI')
    -- Zaten arşivlenmişse tekrar ekleme (idempotent)
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  ),
  -- Arşive başarıyla eklenen kayıtları canlı tablodan sil
  silme AS (
    DELETE FROM canli_gorevler
    WHERE id IN (SELECT id FROM arsive_tasinanlar)
    RETURNING id
  )
  SELECT count(*) INTO v_arsivlenen FROM silme;

  RETURN jsonb_build_object(
    'ok',        true,
    'arsivlenen', v_arsivlenen,
    'zaman',     now()
  );

EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_hata = MESSAGE_TEXT;
  RETURN jsonb_build_object('ok', false, 'hata', v_hata);
END;
$$;

-- Fonksiyon sahibini postgres yap (SECURITY DEFINER tam etki için)
ALTER FUNCTION gun_sonu_arsivle() OWNER TO postgres;

-- ─────────────────────────────────────────────────────────────────────────
-- TEST: Çalıştırdıktan sonra şunu dene:
--   SELECT gun_sonu_arsivle();
-- Beklenen: {"ok": true, "arsivlenen": 7, "zaman": "..."}
-- (canli_gorevler'deki 7 terminal görev arşivlenmeli)
-- ─────────────────────────────────────────────────────────────────────────
