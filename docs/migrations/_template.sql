-- ====================================================================
-- Migration Template — yeni tablo/view eklerken bu pattern'i kullan.
-- ====================================================================
--
-- ÖNEMLI: 30 Ekim 2026'dan itibaren Supabase, public şemasında yeni
-- oluşturulan tablolara Data API erişimini otomatik vermeyecek.
-- Bu tarihten sonra yeni tablo eklersen GRANT'ler ZORUNLU olacak.
-- O tarihten önce de ekleyebiliriz (zarar vermez), proaktif iyi pratik.
--
-- Bu projede @supabase/supabase-js kullanılıyor → Data API'ye dayanıyor.
--
-- Roller:
--   • anon          : authenticated olmayan trafik (login öncesi). Çoğunlukla GRANT VERME.
--   • authenticated : giriş yapmış kullanıcı. Genelde tüm CRUD GRANT verilir; RLS policy'leri görünürlüğü sınırlar.
--   • service_role  : admin client (RLS bypass). Tüm CRUD GRANT zorunlu.
-- ====================================================================

-- Migration NNN: kısa açıklama (1-2 satır, neden bu değişiklik?)

-- 1) Tablo oluştur
CREATE TABLE IF NOT EXISTS public.yeni_tablom (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id uuid NOT NULL REFERENCES firmalar(id) ON DELETE CASCADE,
  -- ... diğer kolonlar
  olusturma_tarihi timestamptz NOT NULL DEFAULT now()
);

-- 2) İndexler (sorgu pattern'lerine göre)
CREATE INDEX IF NOT EXISTS yeni_tablom_firma_idx ON public.yeni_tablom(firma_id);

-- 3) RLS aç + politikalar
-- (Bu projede admin client kullanıldığı için RLS sadece authenticated için kritik.
--  Service_role her halükarda RLS'i bypass eder.)
ALTER TABLE public.yeni_tablom ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS yeni_tablom_sa_select ON public.yeni_tablom;
CREATE POLICY yeni_tablom_sa_select ON public.yeni_tablom
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.rol IN ('super_admin', 'alt_super_admin')
    )
  );

-- 4) GRANT'ler — 30 Ekim 2026 sonrası ZORUNLU.
--    Bu projede admin client (service_role) çoğu işi yapar; authenticated
--    rolüne CRUD GRANT verilir ama RLS policy'leri görünürlüğü sınırlar.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yeni_tablom TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.yeni_tablom TO service_role;
-- GRANT SELECT ON public.yeni_tablom TO anon;  -- sadece public-readable veriler için (login öncesi)

-- ====================================================================
-- View için pattern (yikama_gorevleri için kullandığımız gorevler_normal gibi)
-- ====================================================================
--
-- CREATE OR REPLACE VIEW public.yeni_view AS SELECT ... FROM ...;
-- GRANT SELECT ON public.yeni_view TO authenticated;
-- GRANT SELECT ON public.yeni_view TO service_role;
--
-- NOT: View'ler underlying tablonun RLS politikalarını miras alır (SECURITY DEFINER yok).
-- ====================================================================

-- 5) COMMENT (opsiyonel ama güzel pratik)
COMMENT ON TABLE public.yeni_tablom IS 'Kısa açıklama: bu tablo neden var, ne tutar.';
