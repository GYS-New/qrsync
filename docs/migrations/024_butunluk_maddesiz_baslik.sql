-- ─────────────────────────────────────────────────────────────────────────
-- 024: VERİ BÜTÜNLÜK KONTROLÜ — MADDESİZ BAŞLIK KATEGORİSİ EKLENDİ
--   18 Nisan 2026 incident'ının tekrarını tespit etmek için:
--   - ceklist_baslik_maddesiz_arsiv: arşiv başlık + hiç bağlı madde yok
--   - ceklist_baslik_maddesiz_aktif: aktif başlık + hiç bağlı madde yok
--   Her iki kategori de 'yuksek' seviyede raporlanır.
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
  RETURN QUERY
  SELECT
    'ceklist_baslik_yetim'::text,
    b.firma_id,
    COUNT(*)::bigint,
    MIN(b.kayit_tarihi),
    MAX(b.kayit_tarihi),
    'yuksek'::text,
    'Çeklist başlığı var ama bağlı olduğu görev 4 tabloda da bulunamıyor'::text
  FROM checklist_sonuc_basliklari_arsiv b
  LEFT JOIN canli_gorevler cg ON cg.id = b.canli_gorev_id
  LEFT JOIN canli_gorevler_arsiv cga ON cga.id = b.canli_gorev_id
  LEFT JOIN gorevler g ON g.id = b.gorev_id
  LEFT JOIN gorevler_arsiv ga ON ga.id = b.gorev_id
  WHERE (b.canli_gorev_id IS NOT NULL OR b.gorev_id IS NOT NULL)
    AND cg.id IS NULL AND cga.id IS NULL
    AND g.id IS NULL AND ga.id IS NULL
  GROUP BY b.firma_id;

  RETURN QUERY
  SELECT
    'ceklist_madde_yetim'::text,
    NULL::uuid,
    COUNT(*)::bigint,
    NULL::timestamptz,
    NULL::timestamptz,
    'yuksek'::text,
    'Çeklist maddesi var ama bağlı başlığı bulunamıyor'::text
  FROM checklist_sonuc_maddeleri_arsiv m
  LEFT JOIN checklist_sonuc_basliklari b ON b.id = m.sonuc_id
  LEFT JOIN checklist_sonuc_basliklari_arsiv ba ON ba.id = m.sonuc_id
  WHERE b.id IS NULL AND ba.id IS NULL
  HAVING COUNT(*) > 0;

  -- 2b. YENİ: ARŞİV MADDESİZ BAŞLIK (firma bazlı özet)
  RETURN QUERY
  WITH maddesizler AS (
    SELECT b.id AS baslik_id, b.firma_id AS fid, b.kayit_tarihi AS kt
    FROM checklist_sonuc_basliklari_arsiv b
    LEFT JOIN checklist_sonuc_maddeleri_arsiv m ON m.sonuc_id = b.id
    GROUP BY b.id, b.firma_id, b.kayit_tarihi
    HAVING COUNT(m.id) = 0
  )
  SELECT
    'ceklist_baslik_maddesiz_arsiv'::text,
    mx.fid,
    COUNT(*)::bigint,
    MIN(mx.kt),
    MAX(mx.kt),
    'yuksek'::text,
    'Arşivdeki çeklist başlığının hiç maddesi yok — veri kaybı riski'::text
  FROM maddesizler mx
  GROUP BY mx.fid
  HAVING COUNT(*) > 0;

  -- 2c. YENİ: AKTİF MADDESİZ BAŞLIK
  RETURN QUERY
  WITH maddesizler_aktif AS (
    SELECT b.id AS baslik_id, b.kayit_tarihi AS kt
    FROM checklist_sonuc_basliklari b
    LEFT JOIN checklist_sonuc_maddeleri m ON m.sonuc_id = b.id
    GROUP BY b.id, b.kayit_tarihi
    HAVING COUNT(m.id) = 0
  )
  SELECT
    'ceklist_baslik_maddesiz_aktif'::text,
    NULL::uuid,
    COUNT(*)::bigint,
    MIN(mx.kt),
    MAX(mx.kt),
    'yuksek'::text,
    'Aktif tablodaki çeklist başlığının maddesi yok — insert başarısız olmuş olabilir'::text
  FROM maddesizler_aktif mx
  HAVING COUNT(*) > 0;

  RETURN QUERY
  SELECT
    'canli_gorev_duplicate'::text,
    cg.firma_id,
    COUNT(*)::bigint,
    MIN(cg.olusturma_tarihi),
    MAX(cg.olusturma_tarihi),
    'kritik'::text,
    'Aynı ID hem canli_gorevler hem canli_gorevler_arsiv tablosunda'::text
  FROM canli_gorevler cg
  JOIN canli_gorevler_arsiv cga ON cga.id = cg.id
  GROUP BY cg.firma_id;

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

  RETURN QUERY
  SELECT
    'canli_gorev_kural_yetim'::text,
    cg.firma_id,
    COUNT(*)::bigint,
    MIN(cg.olusturma_tarihi),
    MAX(cg.olusturma_tarihi),
    'orta'::text,
    'Canli görevin kural_id dolu ama gorev_kurallari tablosunda yok'::text
  FROM canli_gorevler cg
  LEFT JOIN gorev_kurallari gk ON gk.id = cg.kural_id
  WHERE cg.kural_id IS NOT NULL AND gk.id IS NULL
  GROUP BY cg.firma_id;

  RETURN QUERY
  SELECT
    'canli_gorev_lokasyon_yetim'::text,
    cg.firma_id,
    COUNT(*)::bigint,
    MIN(cg.olusturma_tarihi),
    MAX(cg.olusturma_tarihi),
    'yuksek'::text,
    'Canli görevin lokasyon_id lokasyonlar tablosunda yok'::text
  FROM canli_gorevler cg
  LEFT JOIN lokasyonlar l ON l.id = cg.lokasyon_id
  WHERE cg.lokasyon_id IS NOT NULL AND l.id IS NULL
  GROUP BY cg.firma_id;

  RETURN QUERY
  SELECT
    'gorev_lokasyon_yetim'::text,
    g.firma_id,
    COUNT(*)::bigint,
    MIN(g.olusturma_tarihi),
    MAX(g.olusturma_tarihi),
    'yuksek'::text,
    'Spesifik görevin lokasyon_id lokasyonlar tablosunda yok'::text
  FROM gorevler g
  LEFT JOIN lokasyonlar l ON l.id = g.lokasyon_id
  WHERE g.lokasyon_id IS NOT NULL AND l.id IS NULL
  GROUP BY g.firma_id;
END;
$$;
