-- ARŞİV TABLOLARI OLUŞTUR (Pure Data, No FK Relationships)

-- 1. PERSONEL MESAI KAYITLARI ARŞİV
CREATE TABLE IF NOT EXISTS public.personel_mesai_kayitlari_arsiv (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id uuid,
  proje_id uuid,
  kullanici_id uuid,
  giris_saati timestamp with time zone,
  cikis_saati timestamp with time zone,
  aciklama text,
  tarih date,
  arsiv_tarihi timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_personel_arsiv_firma ON personel_mesai_kayitlari_arsiv(firma_id);
CREATE INDEX IF NOT EXISTS idx_personel_arsiv_tarih ON personel_mesai_kayitlari_arsiv(arsiv_tarihi);

-- 2. MÜŞTERI DEĞERLENDİRMELERİ ARŞİV (lokasyon_id yerine gorev_id)
CREATE TABLE IF NOT EXISTS public.musteri_degerlendirmeleri_arsiv (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id uuid,
  proje_id uuid,
  gorev_id uuid,
  kullanici_id uuid,
  yildiz_sayisi integer,
  yorum text,
  degerlendirme_tarihi timestamp with time zone,
  arsivlendi boolean DEFAULT false,
  arsiv_tarihi timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_musteri_arsiv_firma ON musteri_degerlendirmeleri_arsiv(firma_id);
CREATE INDEX IF NOT EXISTS idx_musteri_arsiv_tarih ON musteri_degerlendirmeleri_arsiv(arsiv_tarihi);

-- 3. GÖREVLER ARŞİV
CREATE TABLE IF NOT EXISTS public.gorevler_arsiv (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id uuid,
  proje_id uuid,
  tanim text,
  durum text,
  lokasyon_id uuid,
  atanan_kullanici_id uuid,
  olusturan_id uuid,
  tamamlayan_kullanici_id uuid,
  olusturma_tarihi timestamp with time zone,
  tamamlanma_tarihi timestamp with time zone,
  durum_degisim_tarihi timestamp with time zone,
  arsiv_tarihi timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gorevler_arsiv_firma ON gorevler_arsiv(firma_id);
CREATE INDEX IF NOT EXISTS idx_gorevler_arsiv_tarih ON gorevler_arsiv(arsiv_tarihi);

-- 4. ÇEKLİST BAŞLIKLARI ARŞİV
CREATE TABLE IF NOT EXISTS public.checklist_sonuc_basliklari_arsiv (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id uuid,
  sablon_id uuid,
  template_version integer,
  kanal text,
  kullanici_id uuid,
  kayit_tarihi timestamp with time zone,
  gorev_id uuid,
  canli_gorev_id uuid,
  lokasyon_id uuid,
  arsiv_tarihi timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ceklist_basliklari_arsiv_firma ON checklist_sonuc_basliklari_arsiv(firma_id);
CREATE INDEX IF NOT EXISTS idx_ceklist_basliklari_arsiv_tarih ON checklist_sonuc_basliklari_arsiv(arsiv_tarihi);

-- 5. ÇEKLİST MADDELERİ ARŞİV
CREATE TABLE IF NOT EXISTS public.checklist_sonuc_maddeleri_arsiv (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sonuc_id uuid,
  madde_id uuid,
  secenek_degeri text,
  aciklama text,
  gorsel_url text,
  arsiv_tarihi timestamp with time zone DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ceklist_maddeleri_arsiv_sonuc ON checklist_sonuc_maddeleri_arsiv(sonuc_id);
CREATE INDEX IF NOT EXISTS idx_ceklist_maddeleri_arsiv_tarih ON checklist_sonuc_maddeleri_arsiv(arsiv_tarihi);

-- TAMAMLANDI
SELECT 'Tüm arşiv tabloları oluşturuldu' as basarili;
