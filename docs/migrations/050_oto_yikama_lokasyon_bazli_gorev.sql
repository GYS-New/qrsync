-- Migration 050: "İstasyon" kavramını kaldır, direkt alt lokasyona görev aç.
--
-- Tasarım değişikliği: Yıkama istasyonu ayrı bir tablo (yikama_istasyonlari)
-- değil; mevcut "lokasyonlar" tablosundaki bir alt lokasyon. Yönetici lokasyon
-- listesinden (örn. "OTO YIKAMA > İSTASYON-1") seçer ve plakalara o alt
-- lokasyona görev oluşturur. Personel o lokasyonun QR'ını okutunca tüm açık
-- yıkama görevlerini görür ve yapar (açık erişim, atama yok).
--
-- Veri durumu: Her iki tablo da boş (henüz görev oluşturulmadı). Temiz drop +
-- recreate. Eğer veri olsaydı UPDATE ile lokasyon_id'ye taşımak gerekirdi.

-- 1) Eski şema
DROP TABLE IF EXISTS yikama_gorevleri;
DROP TABLE IF EXISTS yikama_istasyonlari;
DROP FUNCTION IF EXISTS yikama_istasyonlari_update_timestamp() CASCADE;

-- 2) Yeni yikama_gorevleri — lokasyon FK direkt
CREATE TABLE public.yikama_gorevleri (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id uuid NOT NULL REFERENCES firmalar(id) ON DELETE CASCADE,
  arac_id uuid NOT NULL REFERENCES araclar(id) ON DELETE CASCADE,
  lokasyon_id uuid NOT NULL REFERENCES lokasyonlar(id) ON DELETE CASCADE,

  -- Snapshot: araç silinse / plaka değişse de görev geçmişi okunur kalır
  plaka_snapshot text NOT NULL,
  hedef_tarih date NOT NULL,
  durum yikama_gorev_durum NOT NULL DEFAULT 'ACIK',

  -- Operasyon audit
  olusturan_id uuid REFERENCES users(id) ON DELETE SET NULL,
  olusturma_tarihi timestamptz NOT NULL DEFAULT now(),
  baslatan_id uuid REFERENCES users(id) ON DELETE SET NULL,
  baslatilma_tarihi timestamptz,
  tamamlayan_id uuid REFERENCES users(id) ON DELETE SET NULL,
  tamamlanma_tarihi timestamptz,
  iptal_sebep text,
  notlar text,

  UNIQUE (firma_id, arac_id, lokasyon_id, hedef_tarih)
);

CREATE INDEX yikama_gorevleri_firma_tarih_durum_idx
  ON yikama_gorevleri(firma_id, hedef_tarih, durum);
CREATE INDEX yikama_gorevleri_lokasyon_tarih_idx
  ON yikama_gorevleri(lokasyon_id, hedef_tarih);
CREATE INDEX yikama_gorevleri_arac_idx
  ON yikama_gorevleri(arac_id);
CREATE INDEX yikama_gorevleri_durum_idx
  ON yikama_gorevleri(durum) WHERE durum IN ('ACIK', 'ISLEMDE');

-- 3) RLS
ALTER TABLE yikama_gorevleri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS yikama_gorevleri_sa_select ON yikama_gorevleri;
CREATE POLICY yikama_gorevleri_sa_select ON yikama_gorevleri
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users
                 WHERE users.id = auth.uid()
                   AND users.rol IN ('super_admin', 'alt_super_admin')));

COMMENT ON TABLE yikama_gorevleri IS 'Oto Yıkama: plaka × lokasyon (alt lokasyon = istasyon) × hedef tarih bazlı görev. Mevcut gorevler tablosundan tamamen bağımsız.';
