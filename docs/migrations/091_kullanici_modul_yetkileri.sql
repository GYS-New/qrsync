-- ─────────────────────────────────────────────────────────────────────────
-- 091: KULLANICI BAZLI MODÜL YETKİLERİ
--
-- Kullanıcı × modül eşlemesi. Rol-bazlı eski sistemin yerini alır.
-- Sadece GYS ve FMS yönetilir (Oto Yıkama lokasyon ataması bazlı kalır,
-- bkz. lib/modul/yetkiliModuller.ts).
--
-- Backfill: ATALIAN + (proje_id IS NULL VEYA OYAK RENAULT) aktif
-- kullanıcılara mevcut rol-bazlı default yetkiler (GYS açık, FMS kapalı)
-- yazılır. Mevcut kullanici_grubu_yetkileri'ndeki '_modul_giris' satırları
-- varsa onların değerleri kullanılır.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kullanici_modul_yetkileri (
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  modul_kodu  text NOT NULL CHECK (modul_kodu IN ('gys','oto_yikama','fms')),
  gorebilir   boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES public.users(id),
  PRIMARY KEY (user_id, modul_kodu)
);

CREATE INDEX IF NOT EXISTS idx_kullanici_modul_yetki_user
  ON public.kullanici_modul_yetkileri(user_id);

COMMENT ON TABLE public.kullanici_modul_yetkileri IS
  'Kullanıcı × modül erişim yetkileri (gys, fms). Rol-bazlı eski sistemin (kullanici_grubu_yetkileri sayfa_kodu=_modul_giris) yerini alır. Kayıt yoksa default: gys=true, fms=false.';

-- GRANT: web app role'leri
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kullanici_modul_yetkileri TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kullanici_modul_yetkileri TO service_role;

-- ── Backfill: ATALIAN OYAK Renault aktif kullanıcılar ────────────────────
INSERT INTO public.kullanici_modul_yetkileri (user_id, modul_kodu, gorebilir)
SELECT
  u.id,
  m.kod,
  COALESCE(
    (SELECT kgy.gorebilir FROM public.kullanici_grubu_yetkileri kgy
     WHERE kgy.firma_id = u.firma_id
       AND kgy.rol = u.rol::text
       AND kgy.sayfa_kodu = '_modul_giris'
       AND kgy.modul_kodu = m.kod
     LIMIT 1),
    CASE WHEN m.kod = 'gys' THEN true ELSE false END
  )
FROM public.users u
CROSS JOIN (VALUES ('gys'), ('fms')) AS m(kod)
WHERE u.firma_id = (SELECT id FROM public.firmalar WHERE firma_adi = 'ATALIAN' LIMIT 1)
  AND (u.proje_id IS NULL OR u.proje_id = (
    SELECT id FROM public.projeler
    WHERE ad = 'OYAK RENAULT'
      AND firma_id = (SELECT id FROM public.firmalar WHERE firma_adi = 'ATALIAN' LIMIT 1)
    LIMIT 1
  ))
  AND u.aktif IS NOT FALSE
  AND u.rol::text IN ('tenant_admin','tenant_user','musteri')
ON CONFLICT (user_id, modul_kodu) DO NOTHING;
