-- Migration 105: Oto Yıkama "Yıkama Aktivitesi" grafiği için tek-shot RPC
--
-- Sorun: Dashboard'daki AktiviteBlock N+1 pattern ile (araclar → metadata
-- chunks → gorevler chunks) 20-30 seri Supabase isteği yapıyordu. 14+
-- gorevler chunk query'sinden biri sık sık 'canceling statement due to
-- statement timeout' (Postgres 8s) veriyor, başardığında toplam 40sn
-- sürüyordu (kullanıcı raporu 2026-07-13 17:54).
--
-- Çözüm: Server-side INNER JOIN + tek query. Firma'nın son 30 gün
-- TAMAMLANDI oto yıkama görevlerinin tamamlanma_tarihi listesini döner.
-- oto_yikama_metadata_arac_tarih_idx (arac_id, hedef_tarih) + gorevler PK
-- ile efficient plan çıkar. Client tarafında bucket'lama (saatlik/günlük/
-- haftalık) devam eder — sadece veri çekimi tek-shot'a düşer.
--
-- SECURITY DEFINER: RLS bypass — RPC'nin kendisi auth kontrolü yapar.
-- Yetki: super_admin/alt_super_admin herhangi bir firma sorgulayabilir;
-- diğer roller sadece kendi firma_id'lerini.

CREATE OR REPLACE FUNCTION public.oto_yikama_aktivite_verisi(
  p_firma_id uuid
)
RETURNS TABLE(tamamlanma_tarihi timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
BEGIN
  -- Yetki kontrolü
  IF NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND (u.rol IN ('super_admin', 'alt_super_admin')
           OR u.firma_id = p_firma_id)
  ) THEN
    RAISE EXCEPTION 'yetki yok: oto_yikama_aktivite_verisi';
  END IF;

  RETURN QUERY
  SELECT g.tamamlanma_tarihi
  FROM public.gorevler g
  INNER JOIN public.oto_yikama_gorev_metadata m ON m.gorev_id = g.id
  WHERE g.firma_id = p_firma_id
    AND g.durum = 'TAMAMLANDI'
    AND g.tamamlanma_tarihi IS NOT NULL
    AND m.hedef_tarih >= (CURRENT_DATE - INTERVAL '30 days');
END;
$$;

GRANT EXECUTE ON FUNCTION public.oto_yikama_aktivite_verisi(uuid) TO authenticated;

COMMENT ON FUNCTION public.oto_yikama_aktivite_verisi(uuid) IS
  'Firma icin son 30 gun oto yikama TAMAMLANDI gorevlerinin tamamlanma_tarihi listesi. AktiviteBlock N+1 fix (migration 105).';
