-- Migration 078: Oto Yıkama görevleri için 'YAPILAMADI' durumu + gün sonu cron RPC.
--
-- Senaryo: hedef tarihi geçmiş ama AÇIK kalmış (personel başlatmamış)
-- yıkama görevleri otomatik olarak YAPILAMADI durumuna düşer. İŞLEMDE'de
-- yarım kalmış görevlere dokunulmaz (personel sabah devam edebilir).
--
-- Cron sırası (TR): 00:00 yapılamadı → 00:01 hazir-acik → 00:05 gece-dongu
-- → 00:30 arşiv. Önce eski açıklar kapanır, sonra yeni gün açılır.

-- 1) Enum'a YAPILAMADI değeri ekle (zaten varsa hata vermez)
ALTER TYPE gorev_durum ADD VALUE IF NOT EXISTS 'YAPILAMADI' AFTER 'IPTAL';

-- 2) ACIK → YAPILAMADI geçiş RPC'si
--    Sadece yıkama görevleri (oto_yikama_gorev_metadata bağlı).
--    GYS spesifik görevlerine dokunmaz.
CREATE OR REPLACE FUNCTION public.oto_yikama_acik_to_yapilamadi()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_bugun date := CURRENT_DATE;
BEGIN
  UPDATE gorevler g
  SET durum = 'YAPILAMADI',
      durum_degisim_tarihi = now()
  FROM oto_yikama_gorev_metadata m
  WHERE m.gorev_id = g.id
    AND g.durum = 'ACIK'
    AND m.hedef_tarih < v_bugun;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'yapilamadi_yapilan', v_count,
    'tarih',              v_bugun,
    'zaman',              now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.oto_yikama_acik_to_yapilamadi() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oto_yikama_acik_to_yapilamadi() TO service_role;

COMMENT ON FUNCTION public.oto_yikama_acik_to_yapilamadi() IS
  'Oto Yıkama: hedef tarihi geçmiş AÇIK görevleri YAPILAMADI''ya günceller. Her gece 00:00 TR cron tetikler. İŞLEMDE durumuna dokunmaz.';
