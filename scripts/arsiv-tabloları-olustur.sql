-- ====================================================================
-- ARŞIV TABLOLARI OLUŞTUR - Gerçek Arşivleme Sistemi
-- ====================================================================

-- 1. PERSONEL MESAI ARŞIV
CREATE TABLE IF NOT EXISTS personel_mesai_kayitlari_arsiv (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  firma_id UUID NOT NULL,
  proje_id UUID,
  kayit_tarihi TIMESTAMPTZ NOT NULL,
  giris_saati TIMESTAMPTZ,
  cikis_saati TIMESTAMPTZ,
  giris_tipi TEXT,
  cikis_tipi TEXT,
  arsivleme_tarihi TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  FOREIGN KEY (firma_id) REFERENCES public.firmalar(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_personel_mesai_arsiv_firma ON personel_mesai_kayitlari_arsiv(firma_id);
CREATE INDEX IF NOT EXISTS idx_personel_mesai_arsiv_tarihi ON personel_mesai_kayitlari_arsiv(arsivleme_tarihi);

-- 2. MÜŞTERI DEĞERLENDİRMELERİ ARŞIV
CREATE TABLE IF NOT EXISTS musteri_degerlendirmeleri_arsiv (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id UUID NOT NULL,
  proje_id UUID,
  lokasyon_id UUID,
  kanal TEXT,
  yildiz INTEGER,
  yorum TEXT,
  ad_soyad TEXT,
  gorsel_url TEXT,
  olusturma_tarihi TIMESTAMPTZ NOT NULL,
  arsivleme_tarihi TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (firma_id) REFERENCES public.firmalar(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_musteri_deg_arsiv_firma ON musteri_degerlendirmeleri_arsiv(firma_id);
CREATE INDEX IF NOT EXISTS idx_musteri_deg_arsiv_tarihi ON musteri_degerlendirmeleri_arsiv(arsivleme_tarihi);

-- 3. SPESİFİK GÖREVLER ARŞIV
CREATE TABLE IF NOT EXISTS gorevler_arsiv (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id UUID NOT NULL,
  proje_id UUID NOT NULL,
  tanim TEXT,
  durum TEXT,
  lokasyon_id UUID,
  olusturma_tarihi TIMESTAMPTZ NOT NULL,
  tamamlanma_tarihi TIMESTAMPTZ,
  durum_degisim_tarihi TIMESTAMPTZ,
  atanan_kullanici_id UUID,
  olusturan_id UUID,
  arsivleme_tarihi TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (firma_id) REFERENCES public.firmalar(id) ON DELETE CASCADE,
  FOREIGN KEY (proje_id) REFERENCES public.projeler(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gorevler_arsiv_firma ON gorevler_arsiv(firma_id);
CREATE INDEX IF NOT EXISTS idx_gorevler_arsiv_tarihi ON gorevler_arsiv(arsivleme_tarihi);

-- 4. ÇEKLIST SONUÇ BAŞLIKLARI ARŞIV
CREATE TABLE IF NOT EXISTS checklist_sonuc_basliklari_arsiv (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canli_gorev_id UUID,
  gorev_id UUID,
  lokasyon_id UUID NOT NULL,
  sablon_id UUID,
  template_version INTEGER DEFAULT 1,
  kanal TEXT NOT NULL DEFAULT 'MOBİL',
  kullanici_id UUID,
  kayit_tarihi TIMESTAMPTZ NOT NULL,
  arsivleme_tarihi TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (lokasyon_id) REFERENCES public.lokasyonlar(id) ON DELETE CASCADE,
  FOREIGN KEY (sablon_id) REFERENCES public.checklist_sablonlari(id)
);

CREATE INDEX IF NOT EXISTS idx_ck_sonuc_bas_arsiv_lokasyon ON checklist_sonuc_basliklari_arsiv(lokasyon_id);
CREATE INDEX IF NOT EXISTS idx_ck_sonuc_bas_arsiv_kayit ON checklist_sonuc_basliklari_arsiv(kayit_tarihi);
CREATE INDEX IF NOT EXISTS idx_ck_sonuc_bas_arsiv_arsivleme ON checklist_sonuc_basliklari_arsiv(arsivleme_tarihi);

-- 5. ÇEKLIST SONUÇ MADDELERİ ARŞIV
CREATE TABLE IF NOT EXISTS checklist_sonuc_maddeleri_arsiv (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sonuc_id UUID NOT NULL,
  madde_id UUID NOT NULL,
  secenek_degeri TEXT,
  aciklama TEXT,
  gorsel_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (sonuc_id) REFERENCES public.checklist_sonuc_basliklari_arsiv(id) ON DELETE CASCADE,
  FOREIGN KEY (madde_id) REFERENCES public.checklist_sablon_maddeleri(id)
);

CREATE INDEX IF NOT EXISTS idx_ck_sonuc_madde_arsiv_sonuc ON checklist_sonuc_maddeleri_arsiv(sonuc_id);

-- ====================================================================
-- İZİN VERİLER
-- ====================================================================

ALTER TABLE personel_mesai_kayitlari_arsiv ENABLE ROW LEVEL SECURITY;
ALTER TABLE musteri_degerlendirmeleri_arsiv ENABLE ROW LEVEL SECURITY;
ALTER TABLE gorevler_arsiv ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_sonuc_basliklari_arsiv ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_sonuc_maddeleri_arsiv ENABLE ROW LEVEL SECURITY;

-- Tüm tablolar için admin erişim
CREATE POLICY admin_all ON personel_mesai_kayitlari_arsiv FOR ALL USING (true);
CREATE POLICY admin_all ON musteri_degerlendirmeleri_arsiv FOR ALL USING (true);
CREATE POLICY admin_all ON gorevler_arsiv FOR ALL USING (true);
CREATE POLICY admin_all ON checklist_sonuc_basliklari_arsiv FOR ALL USING (true);
CREATE POLICY admin_all ON checklist_sonuc_maddeleri_arsiv FOR ALL USING (true);
