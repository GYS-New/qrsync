-- Migration 054: U rolü (tenant_user) için spesifik görev tam yönetim
--
-- Tasarım kararı (kullanıcı talebi):
--   Rol yetki sisteminde (kullanici_grubu_yetkileri) U rolüne
--   ekleyebilir/düzenleyebilir/silebilir verildiğinde, U rolü o işlemleri
--   yapabilmeli. Sayfa yetkisi UI/API katmanında zaten kontrol ediliyor;
--   DB RLS sadece firma izolasyonunu sağlamalı.
--
-- Önceki durum:
--   - Migration 053: INSERT policy eklendi (sadece insert)
--   - Eski "User atanan görevi günceller" policy: UPDATE'i sadece kendisine
--     atanmış göreve sınırlandırıyordu. Bu kısıtlama kalktı.
--   - DELETE policy hiç yoktu → U silemiyordu.
--
-- Yeni durum: Tek "FOR ALL" policy U rolüne kendi firmasındaki TÜM
-- görevler için INSERT/UPDATE/DELETE/SELECT izni verir.
-- Sayfa yetkisi (sayfaYetkileri('gorevler', firma_id).ekleyebilir/
-- duzenleyebilir/silebilir) uygulama katmanında kontrol edilir.

-- Eski kısıtlı policy'leri kaldır
DROP POLICY IF EXISTS "User atanan görevi günceller" ON public.gorevler;
DROP POLICY IF EXISTS "Tenant user kendi firmasinda gorev olusturur" ON public.gorevler;

-- Yeni: U rolü kendi firmasında tam yönetim
CREATE POLICY "Tenant user kendi firmasinda gorev yonetir" ON public.gorevler
  FOR ALL TO authenticated
  USING (
    firma_id = get_my_firma_id()
    AND get_my_rol() = 'tenant_user'::user_rol
  )
  WITH CHECK (
    firma_id = get_my_firma_id()
    AND get_my_rol() = 'tenant_user'::user_rol
  );

COMMENT ON POLICY "Tenant user kendi firmasinda gorev yonetir" ON public.gorevler IS
  'U rolü kendi firmasında spesifik görev INSERT/UPDATE/DELETE yapabilir. Sayfa yetkisi (ekleyebilir/duzenleyebilir/silebilir) UI/API katmanında kontrol edilir; DB RLS sadece firma izolasyonunu garantiler.';
