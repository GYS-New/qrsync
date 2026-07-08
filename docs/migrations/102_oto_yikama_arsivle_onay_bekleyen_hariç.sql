-- Migration 102: oto_yikama_arsivle() RPC — onay bekleyen kayıtlar arşive
-- taşınmamalı. Amir onay verinceye veya reddedinceye kadar askıda kalır.
--
-- Kural (kullanıcı 2026-07-08): "Durum onay bekleyen onaylanıncaya kadar arşivlenmez"
--
-- Değişiklik: adaylar CTE'sindeki WHERE koşuluna
--   AND m.onay_durumu <> 'ONAY_BEKLIYOR'
-- eklendi. Diğer kısımlar migration 080 ile aynı.

CREATE OR REPLACE FUNCTION public.oto_yikama_arsivle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_esik   date := ((now() AT TIME ZONE 'Europe/Istanbul')::date - INTERVAL '30 days')::date;
  v_count  int  := 0;
BEGIN
  WITH adaylar AS (
    SELECT g.id AS gorev_id, g.firma_id, g.tanim, g.lokasyon_id, g.durum,
           g.olusturma_tarihi, g.baslatilma_tarihi, g.tamamlanma_tarihi,
           g.tamamlanma_suresi_saniye, g.olusturan_id, g.islemi_yapan_id,
           g.iptal_sebep,
           m.arac_id, m.plaka_snapshot, m.hedef_tarih, m.ekstra,
           m.km, m.foto_oncesi_url, m.foto_sonrasi_url, m.notlar
    FROM gorevler g
    INNER JOIN oto_yikama_gorev_metadata m ON m.gorev_id = g.id
    WHERE m.hedef_tarih < v_esik
      AND m.onay_durumu <> 'ONAY_BEKLIYOR'  -- onay bekleyenler arşivlenmez
  )
  INSERT INTO oto_yikama_arsiv (
    gorev_id, firma_id, tanim, lokasyon_id, durum,
    olusturma_tarihi, baslatilma_tarihi, tamamlanma_tarihi,
    tamamlanma_suresi_saniye, olusturan_id, islemi_yapan_id, iptal_sebep,
    arac_id, plaka_snapshot, hedef_tarih, ekstra,
    km, foto_oncesi_url, foto_sonrasi_url, notlar
  )
  SELECT * FROM adaylar
  ON CONFLICT (gorev_id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Silme kısmına da aynı filter — onay bekleyenler DB'den silinmez
  DELETE FROM gorevler g
  WHERE EXISTS (
    SELECT 1 FROM oto_yikama_gorev_metadata m
    WHERE m.gorev_id = g.id
      AND m.hedef_tarih < v_esik
      AND m.onay_durumu <> 'ONAY_BEKLIYOR'
  );

  RETURN jsonb_build_object('arsivlenen', v_count, 'esik_tarih', v_esik, 'zaman', now());
END;
$$;
