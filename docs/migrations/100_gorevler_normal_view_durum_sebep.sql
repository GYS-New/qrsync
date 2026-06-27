-- 100_gorevler_normal_view_durum_sebep.sql
-- ============================================================================
-- gorevler_normal view'i Mig 099'da eklenen durum_sebep kolonunu içermiyordu.
-- Spesifik Görevler Raporu API'si bu kolonu select'lemeye çalışınca tüm query
-- fail oluyor ve sayfa "0 görev" gösteriyor.
--
-- NOT: CREATE OR REPLACE VIEW kolon sırasını değiştirmeye izin vermediği için
-- durum_sebep mevcut kolonların SONUNA ekleniyor.
-- ============================================================================

CREATE OR REPLACE VIEW public.gorevler_normal AS
SELECT id,
    firma_id,
    tanim,
    lokasyon_id,
    atanan_kullanici_id,
    durum,
    olusturan_id,
    olusturma_tarihi,
    durum_degisim_tarihi,
    islemi_yapan_id,
    baslatilma_tarihi,
    baslatan_kullanici_id,
    tamamlanma_tarihi,
    tamamlanma_suresi_saniye,
    proje_id,
    son_tamamlama_kanali,
    iptal_sebep,
    mobil_kayit_id,
    durum_sebep
   FROM gorevler g
  WHERE NOT (EXISTS ( SELECT 1
           FROM oto_yikama_gorev_metadata m
          WHERE m.gorev_id = g.id));

-- GRANT'lar (30 Ekim 2026 sonrası standart — _template.sql)
GRANT SELECT ON public.gorevler_normal TO anon;
GRANT SELECT ON public.gorevler_normal TO authenticated;
GRANT SELECT ON public.gorevler_normal TO service_role;
