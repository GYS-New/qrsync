-- ─────────────────────────────────────────────────────────────────────────
-- 025: FIX — audit_checklist_sablon_trigger json karşılaştırma hatası
--
-- Sorun: UPDATE sırasında "row_to_json(OLD) IS DISTINCT FROM row_to_json(NEW)"
--        kontrolü yapılıyordu. PostgreSQL `json` tipinde eşitlik operatörünü
--        desteklemiyor — "operator does not exist: json = json" hatası atıp
--        tüm UPDATE'i abort ediyordu. Çeklist şablonu kaydet = patlıyordu.
--
-- Fix:   row_to_json → to_jsonb. jsonb tipi IS DISTINCT FROM operatörünü
--        destekler, değişim tespiti doğru çalışır.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_checklist_sablon_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (tip, tablo, kullanici_id, firma_id, detay)
    VALUES (
      'checklist_sablon_ekle', 'checklist_sablonlari',
      auth.uid(), NEW.firma_id,
      jsonb_build_object(
        'sablon_id', NEW.id,
        'baslik', NEW.baslik,
        'tanim', NEW.tanim,
        'versiyon', NEW.versiyon
      )
    );
  ELSIF TG_OP = 'UPDATE' AND (to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW)) THEN
    INSERT INTO audit_log (tip, tablo, kullanici_id, firma_id, detay)
    VALUES (
      'checklist_sablon_guncelle', 'checklist_sablonlari',
      auth.uid(), NEW.firma_id,
      jsonb_build_object(
        'sablon_id', NEW.id,
        'baslik', NEW.baslik,
        'eski_baslik', OLD.baslik,
        'eski_aktif', OLD.aktif,
        'yeni_aktif', NEW.aktif
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;
