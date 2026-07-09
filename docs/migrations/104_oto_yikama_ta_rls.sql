-- Migration 104: TA (tenant_admin) da Oto Yikama araclar + metadata'yi
-- client-side sorgulayabilsin.
--
-- Onceki durum: araclar_sa_select ve oto_yikama_metadata_sa_select policy'leri
-- sadece SA/alt_SA'ya SELECT izni veriyordu. Ancak Oto Yikama modulu artik
-- TA'lara da acik (dashboard, gorev kayitlari, canli islemler vs). Server-side
-- bloklar admin client kullandigi icin RLS bypass ediliyor ve calisiyor.
-- Ancak client-component bloklar (AktiviteBlock, YikamaTakvimiChart) kullanici
-- Supabase client kullaniyor - TA icin RLS bloklaniyor, veri 0 doner.
--
-- Bu migration TA'ya kendi firma_id'sindeki araclar/metadata'yi gorme izni
-- ekler. Yazma yetkisi hala mevcut policy'lerdedir (SA/TA distinction).

-- ============================================================
-- 1) araclar — TA/TU kendi firmasinin araclarini gorsun
-- ============================================================
DROP POLICY IF EXISTS araclar_ta_tu_select ON public.araclar;
CREATE POLICY araclar_ta_tu_select ON public.araclar
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.rol IN ('tenant_admin', 'tenant_user')
        AND u.firma_id = araclar.firma_id
    )
  );

-- ============================================================
-- 2) oto_yikama_gorev_metadata — TA/TU kendi firmasindaki metadata'yi gorsun.
-- metadata.arac_id -> araclar.firma_id uzerinden firma kontrolu.
-- arac_id NULL olan (tanimsiz plaka) kayitlar bu policy ile gorunmez —
-- amir server-side (admin client) ile gorur, zaten TA client'ta bu kayda
-- ihtiyac duyulmuyor (aktivite/chart tamamlanmis planli+plansiz yikamalari sayiyor).
-- ============================================================
DROP POLICY IF EXISTS oto_yikama_metadata_ta_tu_select ON public.oto_yikama_gorev_metadata;
CREATE POLICY oto_yikama_metadata_ta_tu_select ON public.oto_yikama_gorev_metadata
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users u
      JOIN public.araclar a ON a.id = oto_yikama_gorev_metadata.arac_id
      WHERE u.id = auth.uid()
        AND u.rol IN ('tenant_admin', 'tenant_user')
        AND a.firma_id = u.firma_id
    )
  );
