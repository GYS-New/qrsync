-- 072: gun_sonu_arsivle — TÜM kolonları kopyala (vardiya_gunu dahil)
--
-- Hata: gun_sonu_arsivle() arşive taşırken sadece 22 kolon kopyalıyordu.
-- Eksik 10 kolon: vardiya_gunu, acik_bekleme_saat, bekleme_gecmis_saat,
-- frekans_tipi, son_tamamlama_kanali, iptal_sebep, mobil_kayit_id,
-- simule_tamamlandi, lisans_beklemeye_alindi.
--
-- En kritik: vardiya_gunu NULL kaldığı için raporlar (vardiya_gunu üzerinden
-- filtre yapan ALL endpoints) arşive taşınmış görevleri görmedi.
-- 1 Haz için 875 görev arşivde durmasına rağmen 'görev bulunamadı' diyordu.
--
-- Düzeltme:
-- 1. INSERT listesine eksik 10 kolon eklendi (vardiya_gunu vd.)
-- 2. Mevcut arşivdeki tüm NULL vardiya_gunu kayıtları vardiya_gunu_hesapla()
--    helper'ı ile backfill edildi.
--
-- Apply tarihi: 2026-06-01

CREATE OR REPLACE FUNCTION public.gun_sonu_arsivle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_arsivlenen int := 0;
  v_hata       text;
BEGIN
  WITH arsive_tasinanlar AS (
    INSERT INTO canli_gorevler_arsiv (
      id, firma_id, proje_id, tanim, lokasyon_id, atanan_kullanici_id, durum,
      aktif_olma_tarihi, olusturma_tarihi, olusturan_id,
      baslatilma_tarihi, baslatan_kullanici_id,
      tamamlanma_tarihi, tamamlayan_kullanici_id,
      islemi_yapan_id, tamamlanma_suresi_saniye,
      iptal_eden_id, iptal_tarihi, iptal_sebep, durum_degisim_tarihi,
      gunluk_frekans_sayisi, kural_id,
      frekans_tipi, vardiya_gunu,
      acik_bekleme_saat, bekleme_gecmis_saat,
      son_tamamlama_kanali, simule_tamamlandi, lisans_beklemeye_alindi,
      mobil_kayit_id,
      arsiv_tarihi, arsiv_nedeni
    )
    SELECT
      id, firma_id, proje_id, tanim, lokasyon_id, atanan_kullanici_id, durum,
      aktif_olma_tarihi, olusturma_tarihi, olusturan_id,
      baslatilma_tarihi, baslatan_kullanici_id,
      tamamlanma_tarihi, tamamlayan_kullanici_id,
      islemi_yapan_id, tamamlanma_suresi_saniye,
      iptal_eden_id, iptal_tarihi, iptal_sebep, durum_degisim_tarihi,
      COALESCE(gunluk_frekans_sayisi, 0), kural_id,
      frekans_tipi, vardiya_gunu,
      acik_bekleme_saat, bekleme_gecmis_saat,
      son_tamamlama_kanali, simule_tamamlandi, lisans_beklemeye_alindi,
      mobil_kayit_id,
      now(), 'gun_sonu'
    FROM canli_gorevler
    WHERE durum IN ('TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS', 'IPTAL', 'SILINDI')
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  ),
  silme AS (
    DELETE FROM canli_gorevler
    WHERE id IN (SELECT id FROM arsive_tasinanlar)
    RETURNING id
  )
  SELECT count(*) INTO v_arsivlenen FROM silme;

  RETURN jsonb_build_object(
    'ok',         true,
    'arsivlenen', v_arsivlenen,
    'zaman',      now()
  );

EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_hata = MESSAGE_TEXT;
  RETURN jsonb_build_object('ok', false, 'hata', v_hata);
END;
$function$;

-- Backfill: mevcut arşiv kayıtlarındaki NULL vardiya_gunu değerlerini hesapla
UPDATE canli_gorevler_arsiv
SET vardiya_gunu = vardiya_gunu_hesapla(aktif_olma_tarihi, firma_id)
WHERE vardiya_gunu IS NULL
  AND aktif_olma_tarihi IS NOT NULL
  AND firma_id IS NOT NULL;
