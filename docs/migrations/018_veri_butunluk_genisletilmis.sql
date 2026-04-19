-- ─────────────────────────────────────────────────────────────────────────
-- 018: VERİ BÜTÜNLÜK KONTROLÜ — KAPSAMLI SÜRÜM
--   Tüm kritik tabloları tarar, yetim/tutarsız kayıtları firma bazlı sayar.
--   Eski yetim_ceklist_kayitlari() fonksiyonu geri uyumluluk için kalır.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION veri_butunluk_kontrol_tam()
RETURNS TABLE(
  kategori text,
  firma_id uuid,
  sayi bigint,
  en_eski timestamptz,
  en_yeni timestamptz,
  seviye text,
  aciklama text
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- ─── 1. ÇEKLİST BAŞLIK YETİM (görev 4 tabloda da yok) ────────────────
  RETURN QUERY
  SELECT
    'ceklist_baslik_yetim'::text,
    b.firma_id,
    COUNT(*)::bigint,
    MIN(b.kayit_tarihi),
    MAX(b.kayit_tarihi),
    'yuksek'::text,
    'Çeklist başlığı var ama bağlı olduğu görev 4 tabloda da bulunamıyor (canli_gorevler, canli_gorevler_arsiv, gorevler, gorevler_arsiv)'::text
  FROM checklist_sonuc_basliklari_arsiv b
  LEFT JOIN canli_gorevler cg ON cg.id = b.canli_gorev_id
  LEFT JOIN canli_gorevler_arsiv cga ON cga.id = b.canli_gorev_id
  LEFT JOIN gorevler g ON g.id = b.gorev_id
  LEFT JOIN gorevler_arsiv ga ON ga.id = b.gorev_id
  WHERE (b.canli_gorev_id IS NOT NULL OR b.gorev_id IS NOT NULL)
    AND cg.id IS NULL AND cga.id IS NULL
    AND g.id IS NULL AND ga.id IS NULL
  GROUP BY b.firma_id;

  -- ─── 2. ÇEKLİST MADDE YETİM (başlığı yok) ─────────────────────────────
  RETURN QUERY
  SELECT
    'ceklist_madde_yetim'::text,
    NULL::uuid,
    COUNT(*)::bigint,
    NULL::timestamptz,
    NULL::timestamptz,
    'yuksek'::text,
    'Çeklist maddesi var ama bağlı başlığı canli/arşiv tablolarında bulunamıyor'::text
  FROM checklist_sonuc_maddeleri_arsiv m
  LEFT JOIN checklist_sonuc_basliklari b ON b.id = m.sonuc_id
  LEFT JOIN checklist_sonuc_basliklari_arsiv ba ON ba.id = m.sonuc_id
  WHERE b.id IS NULL AND ba.id IS NULL
  HAVING COUNT(*) > 0;

  -- ─── 3. GÖREV DUPLICATE (aynı ID hem canli hem arşivde — kritik!) ─────
  RETURN QUERY
  SELECT
    'canli_gorev_duplicate'::text,
    cg.firma_id,
    COUNT(*)::bigint,
    MIN(cg.olusturma_tarihi),
    MAX(cg.olusturma_tarihi),
    'kritik'::text,
    'Aynı ID hem canli_gorevler hem canli_gorevler_arsiv tablosunda — veri bozulması riski'::text
  FROM canli_gorevler cg
  JOIN canli_gorevler_arsiv cga ON cga.id = cg.id
  GROUP BY cg.firma_id;

  -- ─── 4. SPESİFİK GÖREV DUPLICATE ──────────────────────────────────────
  RETURN QUERY
  SELECT
    'gorev_duplicate'::text,
    g.firma_id,
    COUNT(*)::bigint,
    MIN(g.olusturma_tarihi),
    MAX(g.olusturma_tarihi),
    'kritik'::text,
    'Aynı ID hem gorevler hem gorevler_arsiv tablosunda'::text
  FROM gorevler g
  JOIN gorevler_arsiv ga ON ga.id = g.id
  GROUP BY g.firma_id;

  -- ─── 5. CANLI GÖREV KURAL YETİM (kural silindikten sonra görev kaldı) ─
  RETURN QUERY
  SELECT
    'canli_gorev_kural_yetim'::text,
    cg.firma_id,
    COUNT(*)::bigint,
    MIN(cg.olusturma_tarihi),
    MAX(cg.olusturma_tarihi),
    'orta'::text,
    'Canli görevin kural_id bilgisi dolu ama ilgili kural gorev_kurallari tablosunda yok'::text
  FROM canli_gorevler cg
  LEFT JOIN gorev_kurallari gk ON gk.id = cg.kural_id
  WHERE cg.kural_id IS NOT NULL AND gk.id IS NULL
  GROUP BY cg.firma_id;

  -- ─── 6. GÖREV LOKASYON YETİM (lokasyon silinmiş ama görev duruyor) ────
  RETURN QUERY
  SELECT
    'canli_gorev_lokasyon_yetim'::text,
    cg.firma_id,
    COUNT(*)::bigint,
    MIN(cg.olusturma_tarihi),
    MAX(cg.olusturma_tarihi),
    'yuksek'::text,
    'Canli görevin lokasyon_id değeri lokasyonlar tablosunda bulunmuyor'::text
  FROM canli_gorevler cg
  LEFT JOIN lokasyonlar l ON l.id = cg.lokasyon_id
  WHERE cg.lokasyon_id IS NOT NULL AND l.id IS NULL
  GROUP BY cg.firma_id;

  -- ─── 7. SPESİFİK GÖREV LOKASYON YETİM ─────────────────────────────────
  RETURN QUERY
  SELECT
    'gorev_lokasyon_yetim'::text,
    g.firma_id,
    COUNT(*)::bigint,
    MIN(g.olusturma_tarihi),
    MAX(g.olusturma_tarihi),
    'yuksek'::text,
    'Spesifik görevin lokasyon_id değeri lokasyonlar tablosunda bulunmuyor'::text
  FROM gorevler g
  LEFT JOIN lokasyonlar l ON l.id = g.lokasyon_id
  WHERE g.lokasyon_id IS NOT NULL AND l.id IS NULL
  GROUP BY g.firma_id;

  -- ─── 8. MESAİ KAYDI KULLANICI YETİM ───────────────────────────────────
  RETURN QUERY
  SELECT
    'mesai_kayit_user_yetim'::text,
    m.firma_id,
    COUNT(*)::bigint,
    MIN(m.olusturma_tarihi),
    MAX(m.olusturma_tarihi),
    'orta'::text,
    'Mesai kaydı var ama bağlı kullanıcı users tablosunda yok'::text
  FROM personel_mesai_kayitlari m
  LEFT JOIN users u ON u.id = m.personel_id
  WHERE m.personel_id IS NOT NULL AND u.id IS NULL
  GROUP BY m.firma_id;

  -- ─── 9. MÜŞTERİ DEĞERLENDİRMESİ LOKASYON YETİM ────────────────────────
  RETURN QUERY
  SELECT
    'musteri_deger_lokasyon_yetim'::text,
    md.firma_id,
    COUNT(*)::bigint,
    MIN(md.olusturma_tarihi),
    MAX(md.olusturma_tarihi),
    'orta'::text,
    'Müşteri değerlendirmesinin lokasyon_id bilgisi lokasyonlar tablosunda yok'::text
  FROM musteri_degerlendirmeleri md
  LEFT JOIN lokasyonlar l ON l.id = md.lokasyon_id
  WHERE md.lokasyon_id IS NOT NULL AND l.id IS NULL
  GROUP BY md.firma_id;

  -- ─── 10. DEVICE TOKEN KULLANICI YETİM ─────────────────────────────────
  RETURN QUERY
  SELECT
    'device_token_user_yetim'::text,
    dt.firma_id,
    COUNT(*)::bigint,
    NULL::timestamptz,
    NULL::timestamptz,
    'dusuk'::text,
    'device_tokens.user_id değeri users tablosunda bulunmuyor'::text
  FROM device_tokens dt
  LEFT JOIN users u ON u.id = dt.user_id
  WHERE dt.user_id IS NOT NULL AND u.id IS NULL
  GROUP BY dt.firma_id;

  -- ─── 11. USERS FİRMA YETİM ────────────────────────────────────────────
  RETURN QUERY
  SELECT
    'user_firma_yetim'::text,
    u.firma_id,
    COUNT(*)::bigint,
    NULL::timestamptz,
    NULL::timestamptz,
    'yuksek'::text,
    'Kullanıcının firma_id bilgisi firmalar tablosunda bulunmuyor'::text
  FROM users u
  LEFT JOIN firmalar f ON f.id = u.firma_id
  WHERE u.firma_id IS NOT NULL AND f.id IS NULL
  GROUP BY u.firma_id;

  -- ─── 12. LOKASYON FİRMA YETİM ─────────────────────────────────────────
  RETURN QUERY
  SELECT
    'lokasyon_firma_yetim'::text,
    l.firma_id,
    COUNT(*)::bigint,
    NULL::timestamptz,
    NULL::timestamptz,
    'yuksek'::text,
    'Lokasyonun firma_id bilgisi firmalar tablosunda bulunmuyor'::text
  FROM lokasyonlar l
  LEFT JOIN firmalar f ON f.id = l.firma_id
  WHERE l.firma_id IS NOT NULL AND f.id IS NULL
  GROUP BY l.firma_id;

END;
$$;

COMMENT ON FUNCTION veri_butunluk_kontrol_tam IS
  'Tüm kritik tablolarda yetim/tutarsız kayıtları firma bazlı sayar. Her satır bir kategori + firma kombinasyonu.';
