-- ══════════════════════════════════════════════════════════════════════════
-- QRSync — Müşteri Rolü ve Kullanıcı Grubu Yetkileri Migration
-- Supabase SQL Editor'da çalıştırın
-- ══════════════════════════════════════════════════════════════════════════

-- 1. users.rol enum'una 'musteri' ekle (Supabase'de text ise direkt güncelleme yeter)
-- Eğer enum kullanıyorsanız:
-- ALTER TYPE user_rol ADD VALUE IF NOT EXISTS 'musteri';

-- 2. Kullanıcı grubu yetkileri tablosu
CREATE TABLE IF NOT EXISTS kullanici_grubu_yetkileri (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  firma_id      uuid REFERENCES firmalar(id) ON DELETE CASCADE,  -- NULL = global (SA tarafından)
  rol           text NOT NULL,  -- 'alt_super_admin' | 'tenant_admin' | 'musteri' | 'tenant_user'
  sayfa_kodu    text NOT NULL,  -- örn: 'lokasyonlar', 'gorevler', 'canli-islemler'
  gorebilir     boolean NOT NULL DEFAULT true,
  ekleyebilir   boolean NOT NULL DEFAULT false,
  duzenleyebilir boolean NOT NULL DEFAULT false,
  silebilir     boolean NOT NULL DEFAULT false,
  kayit_tarihi  timestamptz DEFAULT now(),
  UNIQUE (firma_id, rol, sayfa_kodu)
);

CREATE INDEX IF NOT EXISTS idx_grup_yetki_rol ON kullanici_grubu_yetkileri(rol);
CREATE INDEX IF NOT EXISTS idx_grup_yetki_firma ON kullanici_grubu_yetkileri(firma_id);

-- 3. Varsayılan yetki satırları — SA global (firma_id NULL)
INSERT INTO kullanici_grubu_yetkileri (firma_id, rol, sayfa_kodu, gorebilir, ekleyebilir, duzenleyebilir, silebilir)
VALUES
  -- alt_super_admin (2.SA) - SA ile aynı yetkiler
  (NULL,'alt_super_admin','lokasyonlar',true,true,true,true),
  (NULL,'alt_super_admin','lokasyon-gruplari',true,true,true,true),
  (NULL,'alt_super_admin','gorevler',true,true,true,true),
  (NULL,'alt_super_admin','checklist-sablonlari',true,true,true,true),
  (NULL,'alt_super_admin','canli-islemler',true,true,true,true),
  (NULL,'alt_super_admin','arsiv',true,false,false,true),
  (NULL,'alt_super_admin','personel-takibi',true,false,false,false),
  (NULL,'alt_super_admin','raporlar',true,false,false,false),
  (NULL,'alt_super_admin','kullanicilar',true,true,true,true),
  -- musteri - sadece görüntüleme
  (NULL,'musteri','lokasyonlar',true,false,false,false),
  (NULL,'musteri','gorevler',true,false,false,false),
  (NULL,'musteri','canli-islemler',true,false,false,false),
  (NULL,'musteri','personel-takibi',true,false,false,false),
  (NULL,'musteri','raporlar',true,false,false,false),
  -- tenant_user - mevcut
  (NULL,'tenant_user','lokasyonlar',true,false,false,false),
  (NULL,'tenant_user','gorevler',true,false,false,false),
  (NULL,'tenant_user','canli-islemler',true,false,false,false),
  (NULL,'tenant_user','kullanicilar',true,false,false,false),
  (NULL,'tenant_user','personel-takibi',true,false,false,false)
ON CONFLICT (firma_id, rol, sayfa_kodu) DO NOTHING;

-- Ek sayfalar: firmalar, projeler, tum-gorevler
INSERT INTO kullanici_grubu_yetkileri (firma_id, rol, sayfa_kodu, gorebilir, ekleyebilir, duzenleyebilir, silebilir)
VALUES
  (NULL,'alt_super_admin','firmalar',true,true,true,true),
  (NULL,'alt_super_admin','projeler',true,true,true,true),
  (NULL,'alt_super_admin','tum-gorevler',true,true,true,true),
  (NULL,'musteri','firmalar',false,false,false,false),
  (NULL,'musteri','projeler',false,false,false,false),
  (NULL,'musteri','tum-gorevler',true,false,false,false),
  (NULL,'tenant_user','firmalar',false,false,false,false),
  (NULL,'tenant_user','projeler',false,false,false,false),
  (NULL,'tenant_user','tum-gorevler',true,false,false,false)
ON CONFLICT (firma_id, rol, sayfa_kodu) DO NOTHING;
