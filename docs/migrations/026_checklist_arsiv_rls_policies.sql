-- ─────────────────────────────────────────────────────────────────────────
-- 026: ÇEKLİST TABLOLARI EKSİK RLS POLICY'LERİ + TRIGGER SERTLEŞTİRME
--
-- Sorun (18 Nisan 2026 incident kök sebebi):
--   - checklist_sonuc_basliklari_arsiv → RLS aktif, HİÇ policy YOK
--   - checklist_sonuc_maddeleri_arsiv  → RLS aktif, HİÇ policy YOK
--   - checklist_sonuc_basliklari       → UPDATE policy YOK
--   - checklist_sonuc_maddeleri        → UPDATE + DELETE policy YOK
--
-- postgres rolü BYPASSRLS yetkisine sahip (Supabase varsayılan), yani RPC
-- ve trigger SECURITY DEFINER ile çalışırken bypass yapıyor. Ama:
--   - Audit'siz manuel SQL/istemci, vereceği zaman fail eder (sessiz 0 satır)
--   - Geçmişte rol yetkileri değişmiş olabilir
--   - Güvenlik derinliği (defense in depth) açısından eksiklikler kapatılmalı
--
-- Ek: arsivle_canli_gorev_ceklist trigger firma_id/proje_id doldurmuyordu,
-- ve madde insert başarı kontrolü yoktu. Her ikisi düzeltildi.
-- ─────────────────────────────────────────────────────────────────────────

-- ═══ checklist_sonuc_basliklari_arsiv ═══
CREATE POLICY "SA arşiv başlıkları yönetir"
  ON checklist_sonuc_basliklari_arsiv FOR ALL
  USING (get_my_rol() = ANY (ARRAY['super_admin'::user_rol, 'alt_super_admin'::user_rol]))
  WITH CHECK (get_my_rol() = ANY (ARRAY['super_admin'::user_rol, 'alt_super_admin'::user_rol]));

CREATE POLICY "Tenant arşiv başlıklarını görür"
  ON checklist_sonuc_basliklari_arsiv FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM lokasyonlar l
      WHERE l.id = checklist_sonuc_basliklari_arsiv.lokasyon_id
        AND l.firma_id = get_my_firma_id()
    )
  );

CREATE POLICY "Tenant admin arşiv başlıklarını yönetir"
  ON checklist_sonuc_basliklari_arsiv FOR ALL
  USING (
    get_my_rol() = 'tenant_admin'::user_rol AND EXISTS (
      SELECT 1 FROM lokasyonlar l
      WHERE l.id = checklist_sonuc_basliklari_arsiv.lokasyon_id
        AND l.firma_id = get_my_firma_id()
    )
  )
  WITH CHECK (
    get_my_rol() = 'tenant_admin'::user_rol AND EXISTS (
      SELECT 1 FROM lokasyonlar l
      WHERE l.id = checklist_sonuc_basliklari_arsiv.lokasyon_id
        AND l.firma_id = get_my_firma_id()
    )
  );

-- ═══ checklist_sonuc_maddeleri_arsiv ═══
CREATE POLICY "SA arşiv maddeleri yönetir"
  ON checklist_sonuc_maddeleri_arsiv FOR ALL
  USING (get_my_rol() = ANY (ARRAY['super_admin'::user_rol, 'alt_super_admin'::user_rol]))
  WITH CHECK (get_my_rol() = ANY (ARRAY['super_admin'::user_rol, 'alt_super_admin'::user_rol]));

CREATE POLICY "Tenant arşiv maddelerini görür"
  ON checklist_sonuc_maddeleri_arsiv FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM checklist_sonuc_basliklari_arsiv b
      JOIN lokasyonlar l ON l.id = b.lokasyon_id
      WHERE b.id = checklist_sonuc_maddeleri_arsiv.sonuc_id
        AND l.firma_id = get_my_firma_id()
    )
  );

CREATE POLICY "Tenant admin arşiv maddelerini yönetir"
  ON checklist_sonuc_maddeleri_arsiv FOR ALL
  USING (
    get_my_rol() = 'tenant_admin'::user_rol AND EXISTS (
      SELECT 1 FROM checklist_sonuc_basliklari_arsiv b
      JOIN lokasyonlar l ON l.id = b.lokasyon_id
      WHERE b.id = checklist_sonuc_maddeleri_arsiv.sonuc_id
        AND l.firma_id = get_my_firma_id()
    )
  )
  WITH CHECK (
    get_my_rol() = 'tenant_admin'::user_rol AND EXISTS (
      SELECT 1 FROM checklist_sonuc_basliklari_arsiv b
      JOIN lokasyonlar l ON l.id = b.lokasyon_id
      WHERE b.id = checklist_sonuc_maddeleri_arsiv.sonuc_id
        AND l.firma_id = get_my_firma_id()
    )
  );

-- ═══ AKTİF checklist_sonuc_basliklari — UPDATE policy ═══
CREATE POLICY "SA çeklist başlıkları günceller"
  ON checklist_sonuc_basliklari FOR UPDATE
  USING (get_my_rol() = ANY (ARRAY['super_admin'::user_rol, 'alt_super_admin'::user_rol]))
  WITH CHECK (get_my_rol() = ANY (ARRAY['super_admin'::user_rol, 'alt_super_admin'::user_rol]));

CREATE POLICY "Tenant çeklist başlıkları günceller"
  ON checklist_sonuc_basliklari FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM lokasyonlar l
            WHERE l.id = checklist_sonuc_basliklari.lokasyon_id
              AND l.firma_id = get_my_firma_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM lokasyonlar l
            WHERE l.id = checklist_sonuc_basliklari.lokasyon_id
              AND l.firma_id = get_my_firma_id())
  );

-- ═══ AKTİF checklist_sonuc_maddeleri — UPDATE + DELETE policy ═══
CREATE POLICY "SA çeklist maddeleri yönetir"
  ON checklist_sonuc_maddeleri FOR ALL
  USING (get_my_rol() = ANY (ARRAY['super_admin'::user_rol, 'alt_super_admin'::user_rol]))
  WITH CHECK (get_my_rol() = ANY (ARRAY['super_admin'::user_rol, 'alt_super_admin'::user_rol]));

CREATE POLICY "Tenant çeklist maddeleri yönetir"
  ON checklist_sonuc_maddeleri FOR ALL
  USING (
    EXISTS (SELECT 1 FROM checklist_sonuc_basliklari b
            JOIN lokasyonlar l ON l.id = b.lokasyon_id
            WHERE b.id = checklist_sonuc_maddeleri.sonuc_id
              AND l.firma_id = get_my_firma_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM checklist_sonuc_basliklari b
            JOIN lokasyonlar l ON l.id = b.lokasyon_id
            WHERE b.id = checklist_sonuc_maddeleri.sonuc_id
              AND l.firma_id = get_my_firma_id())
  );

-- ═══ TRIGGER FIX: arsivle_canli_gorev_ceklist ═══
-- Başlıklara firma_id/proje_id yazılmıyor + madde insert doğrulaması yok.
-- İki sorun da düzeltiliyor (RPC'deki doğrulamayla aynı mantık).
CREATE OR REPLACE FUNCTION public.arsivle_canli_gorev_ceklist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_baslik_ids uuid[];
  v_madde_beklenen int := 0;
  v_madde_arsivde int := 0;
BEGIN
  SELECT ARRAY_AGG(id) INTO v_baslik_ids
  FROM checklist_sonuc_basliklari
  WHERE canli_gorev_id = NEW.id;

  IF v_baslik_ids IS NULL OR array_length(v_baslik_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_madde_beklenen
  FROM checklist_sonuc_maddeleri
  WHERE sonuc_id = ANY(v_baslik_ids);

  INSERT INTO checklist_sonuc_maddeleri_arsiv (id, sonuc_id, madde_id, secenek_degeri, aciklama, gorsel_url, arsiv_tarihi)
  SELECT id, sonuc_id, madde_id, secenek_degeri, aciklama, gorsel_url, NOW()
  FROM checklist_sonuc_maddeleri
  WHERE sonuc_id = ANY(v_baslik_ids)
  ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO v_madde_arsivde
  FROM checklist_sonuc_maddeleri_arsiv
  WHERE sonuc_id = ANY(v_baslik_ids);

  -- DOĞRULAMA: arşivde madde eksikse abort (rollback tüm trigger işlemini)
  IF v_madde_arsivde < v_madde_beklenen THEN
    RAISE EXCEPTION 'Ceklist madde arsivleme eksik (trigger): beklenen %, arsivde %',
      v_madde_beklenen, v_madde_arsivde;
  END IF;

  DELETE FROM checklist_sonuc_maddeleri WHERE sonuc_id = ANY(v_baslik_ids);

  INSERT INTO checklist_sonuc_basliklari_arsiv (
    id, gorev_id, canli_gorev_id, lokasyon_id, sablon_id,
    template_version, kanal, kullanici_id, kayit_tarihi, arsiv_tarihi,
    firma_id, proje_id
  )
  SELECT
    id, gorev_id, canli_gorev_id, lokasyon_id, sablon_id,
    template_version, kanal, kullanici_id, kayit_tarihi, NOW(),
    NEW.firma_id, NEW.proje_id
  FROM checklist_sonuc_basliklari
  WHERE id = ANY(v_baslik_ids)
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM checklist_sonuc_basliklari WHERE id = ANY(v_baslik_ids);

  RETURN NEW;
END;
$function$;
