-- Migration 053: U rolü (tenant_user) için gorevler tablosuna INSERT policy
--
-- Mevcut RLS politikaları U rolüne yalnız SELECT (firma_id eşleşmeli) ve
-- UPDATE (atanan_kullanici_id = auth.uid()) izni veriyordu — INSERT yok.
-- Web sayfa yetki sistemi (kullanici_grubu_yetkileri) U rolüne
-- "ekleyebilir=true" diyebiliyor, ama DB RLS bu INSERT'i engelliyor →
-- "İşlem başarısız" hatası.
--
-- Bu policy U rolüne kendi firmasında görev oluşturma izni verir.
-- Sayfa seviyesinde yetki kontrolü zaten uygulama katmanında (UI/API)
-- yapılıyor; DB RLS sadece firma izolasyonunu garantiler.

DROP POLICY IF EXISTS "Tenant user kendi firmasinda gorev olusturur" ON public.gorevler;

CREATE POLICY "Tenant user kendi firmasinda gorev olusturur" ON public.gorevler
  FOR INSERT TO authenticated
  WITH CHECK (
    firma_id = get_my_firma_id()
    AND get_my_rol() = 'tenant_user'::user_rol
  );

COMMENT ON POLICY "Tenant user kendi firmasinda gorev olusturur" ON public.gorevler IS
  'U rolü kendi firmasında spesifik görev INSERT edebilir. Sayfa yetkisi (ekleyebilir) UI/API katmanında kontrol edilir.';
