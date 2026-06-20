-- Migration 084: ISLEMDE'de askıda kalan Oto Yıkama görevlerini iptal eden RPC.
--
-- Mobile ekip talebi (2026-06-20): Yeni 2-aşamalı akışta personel
-- "Yıkamayı Başlat" basıp tamamlamayı unutursa görev süresiz ISLEMDE
-- kalır → araç için ertesi gün yeni ekstra başlatma 409 PLANLI_AKTIF_VAR
-- ile engellenir, saha tıkanır.
--
-- Bu RPC 6 saatten uzun süredir ISLEMDE duran Oto Yıkama görevlerini
-- IPTAL'e çeker ve iptal edilenlerin (gorev_id, plaka, baslatan_kullanici)
-- listesini jsonb olarak döner — caller (HTTP endpoint) bu listeyi
-- FCM bildirimi göndermek için kullanır.
--
-- Eşik 6 saat: tek vardiya içinde + manuel uzun yıkamalar (5sa 30dk gibi)
-- hala kabul edilir + saha 6sa askida görev görmek istemez.
--
-- Schedule: pg_cron tarafından saatte bir HTTP endpoint'e POST atılır;
-- endpoint bu RPC'yi çağırır. pg_cron kaydı ayrı bir migration'da (085).
--
-- SECURITY DEFINER: cron mantığı için service_role yetkisiyle çalışmalı.

CREATE OR REPLACE FUNCTION public.oto_yikama_islemde_to_iptal()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_esik_saat int := 6;
  v_iptal jsonb;
  v_sayi int;
BEGIN
  -- 1) Eşiği geçmiş Oto Yıkama görevlerini listele (FCM için)
  SELECT
    jsonb_agg(jsonb_build_object(
      'gorev_id',    g.id,
      'plaka',       m.plaka_snapshot,
      'baslatan_id', g.baslatan_kullanici_id,
      'baslatilma',  g.baslatilma_tarihi
    )),
    count(*)
  INTO v_iptal, v_sayi
  FROM gorevler g
  JOIN oto_yikama_gorev_metadata m ON m.gorev_id = g.id
  WHERE g.durum = 'ISLEMDE'
    AND g.baslatilma_tarihi < (now() - (v_esik_saat || ' hours')::interval);

  -- 2) Hiçbiri yoksa erken dön
  IF COALESCE(v_sayi, 0) = 0 THEN
    RETURN jsonb_build_object(
      'sayi', 0,
      'esik_saat', v_esik_saat,
      'iptal_edilen', '[]'::jsonb,
      'zaman', now()
    );
  END IF;

  -- 3) Toplu IPTAL — sadece Oto Yıkama metadata'lı ve hala ISLEMDE olanlar
  UPDATE gorevler g
  SET durum = 'IPTAL',
      tamamlanma_tarihi = now(),
      durum_degisim_tarihi = now(),
      iptal_sebep = 'Yıkama süresi aşımı (' || v_esik_saat || ' saat) — otomatik iptal'
  FROM oto_yikama_gorev_metadata m
  WHERE m.gorev_id = g.id
    AND g.durum = 'ISLEMDE'
    AND g.baslatilma_tarihi < (now() - (v_esik_saat || ' hours')::interval);

  RETURN jsonb_build_object(
    'sayi', v_sayi,
    'esik_saat', v_esik_saat,
    'iptal_edilen', v_iptal,
    'zaman', now()
  );
END;
$function$;

COMMENT ON FUNCTION public.oto_yikama_islemde_to_iptal IS
  'Oto Yıkama ISLEMDE görevlerinden 6+ saat eski olanları IPTAL eder. Saatte bir pg_cron + HTTP endpoint tarafından çağrılır; dönen liste FCM bildirimi için kullanılır.';

GRANT EXECUTE ON FUNCTION public.oto_yikama_islemde_to_iptal() TO service_role;
