-- ============================================
-- QR-SYNC ARŞİV TABLOLARI OLUŞTUR (DDL)
-- Çalıştır: Supabase SQL Editor
-- ============================================

-- 1. PERSONEL MESAI KAYITLARI ARŞİV
CREATE TABLE IF NOT EXISTS public.personel_mesai_kayitlari_arsiv AS
SELECT * FROM public.personel_mesai_kayitlari WHERE FALSE;

ALTER TABLE public.personel_mesai_kayitlari_arsiv
ADD COLUMN IF NOT EXISTS arsiv_tarihi TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_personel_arsiv_firma ON personel_mesai_kayitlari_arsiv(firma_id);
CREATE INDEX IF NOT EXISTS idx_personel_arsiv_proje ON personel_mesai_kayitlari_arsiv(proje_id);
CREATE INDEX IF NOT EXISTS idx_personel_arsiv_tarih ON personel_mesai_kayitlari_arsiv(arsiv_tarihi);

---

-- 2. MÜŞTERI DEĞERLENDİRMELERİ ARŞİV
CREATE TABLE IF NOT EXISTS public.musteri_degerlendirmeleri_arsiv AS
SELECT * FROM public.musteri_degerlendirmeleri WHERE FALSE;

ALTER TABLE public.musteri_degerlendirmeleri_arsiv
ADD COLUMN IF NOT EXISTS arsiv_tarihi TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_musteri_arsiv_firma ON musteri_degerlendirmeleri_arsiv(firma_id);
CREATE INDEX IF NOT EXISTS idx_musteri_arsiv_proje ON musteri_degerlendirmeleri_arsiv(proje_id);
CREATE INDEX IF NOT EXISTS idx_musteri_arsiv_tarih ON musteri_degerlendirmeleri_arsiv(arsiv_tarihi);

---

-- 3. GÖREVLER ARŞİV (Spesifik görevler)
CREATE TABLE IF NOT EXISTS public.gorevler_arsiv AS
SELECT * FROM public.gorevler WHERE FALSE;

ALTER TABLE public.gorevler_arsiv
ADD COLUMN IF NOT EXISTS arsiv_tarihi TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS arsiv_nedeni VARCHAR(50) DEFAULT 'otomatik';

CREATE INDEX IF NOT EXISTS idx_gorevler_arsiv_firma ON gorevler_arsiv(firma_id);
CREATE INDEX IF NOT EXISTS idx_gorevler_arsiv_proje ON gorevler_arsiv(proje_id);
CREATE INDEX IF NOT EXISTS idx_gorevler_arsiv_tarih ON gorevler_arsiv(arsiv_tarihi);

---

-- 4. ÇEKLIST SONUÇ BAŞLIKLARI ARŞİV
CREATE TABLE IF NOT EXISTS public.checklist_sonuc_basliklari_arsiv AS
SELECT * FROM public.checklist_sonuc_basliklari WHERE FALSE;

ALTER TABLE public.checklist_sonuc_basliklari_arsiv
ADD COLUMN IF NOT EXISTS arsiv_tarihi TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ceklist_basliklari_arsiv_firma ON checklist_sonuc_basliklari_arsiv(firma_id);
CREATE INDEX IF NOT EXISTS idx_ceklist_basliklari_arsiv_sablon ON checklist_sonuc_basliklari_arsiv(sablon_id);
CREATE INDEX IF NOT EXISTS idx_ceklist_basliklari_arsiv_tarih ON checklist_sonuc_basliklari_arsiv(arsiv_tarihi);

---

-- 5. ÇEKLIST SONUÇ MADDELERİ ARŞİV
CREATE TABLE IF NOT EXISTS public.checklist_sonuc_maddeleri_arsiv AS
SELECT * FROM public.checklist_sonuc_maddeleri WHERE FALSE;

ALTER TABLE public.checklist_sonuc_maddeleri_arsiv
ADD COLUMN IF NOT EXISTS arsiv_tarihi TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ceklist_maddeleri_arsiv_sonuc ON checklist_sonuc_maddeleri_arsiv(sonuc_id);
CREATE INDEX IF NOT EXISTS idx_ceklist_maddeleri_arsiv_tarih ON checklist_sonuc_maddeleri_arsiv(arsiv_tarihi);

---

-- TAMAMLANDI
SELECT 'ARŞİV TABLOLARI OLUŞTURULDU' as status;
