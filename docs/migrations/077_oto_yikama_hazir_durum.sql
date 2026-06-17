-- Migration 077: Oto Yıkama görevleri için gerçek 'HAZIR' durumu + HAZIR→ACIK cron RPC.
--
-- Önce UI türetilmiş bir durumdu (durum=ACIK + hedef_tarih>bugün). Şimdi DB'de
-- gerçek enum değeri olarak tutulur — böylece mobil/canlı sorgular filtre
-- yapabilir, snapshot zaten 'HAZIR' beklemekteydi.
--
-- Yaşam döngüsü: HAZIR (oluşturma) → ACIK (hedef tarih geldiğinde, her gece
-- 00:01 TR cron) → ISLEMDE (personel başlat) → TAMAMLANDI / IPTAL.

-- 1) Enum'a HAZIR değeri ekle (zaten varsa hata vermez)
ALTER TYPE gorev_durum ADD VALUE IF NOT EXISTS 'HAZIR' BEFORE 'ACIK';

-- 2) HAZIR → ACIK geçiş RPC'si
--    Sadece yıkama görevleri için (oto_yikama_gorev_metadata bağlı olanlar).
--    GYS spesifik görevlerine dokunmaz.
CREATE OR REPLACE FUNCTION public.oto_yikama_hazir_to_acik()
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
  SET durum = 'ACIK',
      durum_degisim_tarihi = now()
  FROM oto_yikama_gorev_metadata m
  WHERE m.gorev_id = g.id
    AND g.durum = 'HAZIR'
    AND m.hedef_tarih <= v_bugun;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'acilan',  v_count,
    'tarih',   v_bugun,
    'zaman',   now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.oto_yikama_hazir_to_acik() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.oto_yikama_hazir_to_acik() TO service_role;

COMMENT ON FUNCTION public.oto_yikama_hazir_to_acik() IS
  'Oto Yıkama: hedef tarihi gelmiş HAZIR görevleri ACIK''a günceller. Her gece 00:01 TR cron tetikler.';
