-- Migration 044: Yedekleme sistemi için Supabase Storage bucket'ı
--
-- Bu bucket private — sadece service_role erişebilir. Authenticated kullanıcılar
-- doğrudan erişemez; SA paneli admin client üzerinden okur/restore eder.
--
-- Yapı: backups/{YYYY-MM-DD}/{tablo_adi}.json.gz
-- Retention: 90 gün (cron her gece eski klasörleri siler)
-- Boyut limiti: 500 MB / dosya (tablo başına yeterli)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('backups', 'backups', false, 524288000, ARRAY['application/gzip', 'application/octet-stream'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY['application/gzip', 'application/octet-stream'];

-- Storage RLS: sadece service_role erişebilir.
-- Authenticated kullanıcılar HİÇ erişemez — yedek verisi hassas, SA UI'si admin
-- client (service_role) ile fetch eder.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='backups_service_role_all') THEN
    CREATE POLICY backups_service_role_all ON storage.objects
      FOR ALL TO service_role
      USING (bucket_id = 'backups')
      WITH CHECK (bucket_id = 'backups');
  END IF;
END $$;
