-- Migration 074: canli_gorevler + canli_gorevler_arsiv 'aciklama' kolonu
--
-- BAĞLAM: Mobil ekibinin "Ekstra Görev — Audit + Süre Takibi" spec'i
-- (02 Haz 2026). Personel ekstra (frekans dışı) görev kaydederken neden
-- yaptığını yazsın, gerekçesi raporlarda görünsün. OYAK RENAULT talebi.
--
-- - Normal frekansiyel kural görevlerinde NULL kalır (zorunlu değil).
-- - Ekstra görevlerde (kural_id IS NULL) min 10 / max 1000 karakter,
--   API tarafında zorunlu. Şemada NULL bırakıyoruz ki eski kayıtlar bozulmasın
--   ve oto yıkama ekstrası da etkilenmesin.
-- - Arşive de eklendi — gün sonu arşiv prosedürü tüm kolonları kopyalıyor
--   (072 migration ile garantili). Raporlama arşivden okuduğu için kritik.
-- - gun_sonu_arsivle() fonksiyonu da güncellendi: aciklama kolonu da kopyalanıyor.

ALTER TABLE public.canli_gorevler
  ADD COLUMN IF NOT EXISTS aciklama text;

ALTER TABLE public.canli_gorevler_arsiv
  ADD COLUMN IF NOT EXISTS aciklama text;

COMMENT ON COLUMN public.canli_gorevler.aciklama IS
  'Ekstra (frekans dışı) görevlerde personelin yazdığı gerekçe. Normal kural görevlerinde NULL. min 10 / max 1000 karakter (API tarafı validasyon).';

COMMENT ON COLUMN public.canli_gorevler_arsiv.aciklama IS
  'canli_gorevler.aciklama kolonunun arşiv kopyası — raporlama bu kolondan okur.';

-- gun_sonu_arsivle: aciklama kolonu da arşive taşınsın (072 pattern'iyle aynı)
CREATE OR REPLACE FUNCTION public.gun_sonu_arsivle()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_arsivlenen int := 0;
  v_hata       text;
BEGIN
  WITH arsive_tasinanlar AS (
    INSERT INTO canli_gorevler_arsiv (
      id, firma_id, proje_id, tanim, lokasyon_id, atanan_kullanici_id, durum,
      aktif_olma_tarihi, olusturma_tarihi, olusturan_id,
      baslatilma_tarihi, baslatan_kullanici_id,
      tamamlanma_tarihi, tamamlayan_kullanici_id,
      islemi_yapan_id, tamamlanma_suresi_saniye,
      iptal_eden_id, iptal_tarihi, iptal_sebep, durum_degisim_tarihi,
      gunluk_frekans_sayisi, kural_id,
      frekans_tipi, vardiya_gunu,
      acik_bekleme_saat, bekleme_gecmis_saat,
      son_tamamlama_kanali, simule_tamamlandi, lisans_beklemeye_alindi,
      mobil_kayit_id, aciklama,
      arsiv_tarihi, arsiv_nedeni
    )
    SELECT
      id, firma_id, proje_id, tanim, lokasyon_id, atanan_kullanici_id, durum,
      aktif_olma_tarihi, olusturma_tarihi, olusturan_id,
      baslatilma_tarihi, baslatan_kullanici_id,
      tamamlanma_tarihi, tamamlayan_kullanici_id,
      islemi_yapan_id, tamamlanma_suresi_saniye,
      iptal_eden_id, iptal_tarihi, iptal_sebep, durum_degisim_tarihi,
      COALESCE(gunluk_frekans_sayisi, 0), kural_id,
      frekans_tipi, vardiya_gunu,
      acik_bekleme_saat, bekleme_gecmis_saat,
      son_tamamlama_kanali, simule_tamamlandi, lisans_beklemeye_alindi,
      mobil_kayit_id, aciklama,
      now(), 'gun_sonu'
    FROM canli_gorevler
    WHERE durum IN ('TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS', 'IPTAL', 'SILINDI')
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  ),
  silme AS (
    DELETE FROM canli_gorevler
    WHERE id IN (SELECT id FROM arsive_tasinanlar)
    RETURNING id
  )
  SELECT count(*) INTO v_arsivlenen FROM silme;

  RETURN jsonb_build_object(
    'ok',         true,
    'arsivlenen', v_arsivlenen,
    'zaman',      now()
  );

EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_hata = MESSAGE_TEXT;
  RETURN jsonb_build_object('ok', false, 'hata', v_hata);
END;
$function$;
