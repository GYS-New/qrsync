-- Migration 075: Modüler platform mimarisi için DB hazırlığı.
--
-- Üç UI modülü destekleyen platforma geçiş: GYS (mevcut), Oto Yıkama
-- (mevcut, ayrı route'a taşınacak), FMS (gelecek).
--
-- Bu migration:
--   1) kullanici_grubu_yetkileri.modul_kodu — yetki kaydının hangi modüle
--      ait olduğunu belirtir. Mevcut tüm kayıtlar otomatik 'gys' olur.
--   2) firmalar.fms_aktif — FMS modülünün firma için aktivasyon flag'i
--      (oto_yikama_aktif zaten var, fms için karşılığı eklenir).
--   3) UNIQUE constraint güncellemesi — (firma_id, rol, sayfa_kodu, modul_kodu)
--      bazlı tekillik. Aynı sayfa kodunu birden çok modülde tutabilmek için.
--
-- CANLIYA ETKİ: Sıfır.
--   - ADD COLUMN ... DEFAULT (PG 11+ instant metadata-only, ms seviyesinde lock)
--   - Mevcut sorgular modul_kodu kullanmıyor → geriye uyumlu
--   - Helper opsiyonel parametre alır (default 'gys'), mevcut çağrılar etkilenmez

-- 1) modul_kodu kolonu
ALTER TABLE public.kullanici_grubu_yetkileri
  ADD COLUMN IF NOT EXISTS modul_kodu text NOT NULL DEFAULT 'gys';

COMMENT ON COLUMN public.kullanici_grubu_yetkileri.modul_kodu IS
  'Modül kodu: gys (default, mevcut tüm kayıtlar), oto_yikama, fms. '
  'Aynı sayfa_kodu farklı modüllerde ayrı yetkilere sahip olabilir.';

-- 2) firmalar.fms_aktif
ALTER TABLE public.firmalar
  ADD COLUMN IF NOT EXISTS fms_aktif boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.firmalar.fms_aktif IS
  'FMS (Facility Management System) modülünün firma için aktif olup olmadığı.';

-- 3) UNIQUE constraint genişletme: (firma_id, rol, sayfa_kodu) → (firma_id, rol, sayfa_kodu, modul_kodu)
--
-- Önce eski constraint'i kaldır (varsa), yeni constraint'i ekle.
-- DO bloğu idempotent: tekrar çalışırsa hata vermez.

DO $migration$
BEGIN
  -- Eski constraint kalkar
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.kullanici_grubu_yetkileri'::regclass
      AND conname = 'kullanici_grubu_yetkileri_firma_id_rol_sayfa_kodu_key'
  ) THEN
    ALTER TABLE public.kullanici_grubu_yetkileri
      DROP CONSTRAINT kullanici_grubu_yetkileri_firma_id_rol_sayfa_kodu_key;
  END IF;

  -- Yeni constraint eklenir (modul_kodu dahil)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.kullanici_grubu_yetkileri'::regclass
      AND conname = 'kullanici_grubu_yetkileri_uniq'
  ) THEN
    ALTER TABLE public.kullanici_grubu_yetkileri
      ADD CONSTRAINT kullanici_grubu_yetkileri_uniq
      UNIQUE (firma_id, rol, sayfa_kodu, modul_kodu);
  END IF;
END
$migration$;

-- 4) İndex: modul_kodu üzerinde sık filtreleme (yetkili modülleri çekme sorgusu)
CREATE INDEX IF NOT EXISTS kullanici_grubu_yetkileri_modul_idx
  ON public.kullanici_grubu_yetkileri(modul_kodu, rol)
  WHERE modul_kodu <> 'gys';
-- Partial index: çoğunluk gys, sadece oto_yikama/fms satırlarını hızlandırır.

-- 5) GRANT'ler — mevcut tabloya kolon eklediğimiz için zaten verilmiş.
--    Yine de _template.sql notunda olduğu gibi proaktif yenileme.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kullanici_grubu_yetkileri TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kullanici_grubu_yetkileri TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firmalar TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firmalar TO service_role;
