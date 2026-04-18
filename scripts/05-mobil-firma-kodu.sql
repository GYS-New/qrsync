-- Mobil firma kodu: 6 karakter, I/O/0/1 hariç 32 karakterli alfabeden
-- Tek APK üzerinden çoklu firma desteği için.
-- Migration: 2026-04-19

CREATE OR REPLACE FUNCTION public.generate_mobil_firma_kodu() RETURNS text AS $$
DECLARE
  chars text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  result text := '';
  i int;
BEGIN
  FOR i IN 1..6 LOOP
    result := result || substr(chars, floor(random() * 32 + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;

ALTER TABLE public.firmalar
  ADD COLUMN IF NOT EXISTS mobil_firma_kodu text;

-- Mevcut firmaları doldur (unique çakışmada tekrar dene)
DO $$
DECLARE
  r record;
  try_code text;
  attempt int;
BEGIN
  FOR r IN SELECT id FROM public.firmalar WHERE mobil_firma_kodu IS NULL LOOP
    attempt := 0;
    LOOP
      try_code := public.generate_mobil_firma_kodu();
      BEGIN
        UPDATE public.firmalar SET mobil_firma_kodu = try_code WHERE id = r.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        attempt := attempt + 1;
        IF attempt > 30 THEN RAISE; END IF;
      END;
    END LOOP;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS firmalar_mobil_firma_kodu_unique ON public.firmalar(mobil_firma_kodu);
ALTER TABLE public.firmalar ALTER COLUMN mobil_firma_kodu SET NOT NULL;
ALTER TABLE public.firmalar ALTER COLUMN mobil_firma_kodu SET DEFAULT public.generate_mobil_firma_kodu();

COMMENT ON COLUMN public.firmalar.mobil_firma_kodu IS 'Tek APK üzerinden firma seçimi için 6 karakter mobil giriş kodu. TA yeniler.';
