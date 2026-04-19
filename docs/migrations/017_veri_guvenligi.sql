-- ─────────────────────────────────────────────────────────────────────────
-- 017: VERİ GÜVENLİĞİ VE KURTARMA SİSTEMİ
--   1) Atomik arşivleme PG fonksiyonu (INSERT+DELETE aynı transaction)
--   2) audit_log tablosu (kritik işlemler için)
--   3) sistem_alerts tablosu (SA paneli için)
--   4) yetim kayıt tespiti için view
-- ─────────────────────────────────────────────────────────────────────────

-- ─── AUDIT LOG ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id             bigserial PRIMARY KEY,
  tarih          timestamptz NOT NULL DEFAULT now(),
  tip            text NOT NULL,           -- 'arsivle', 'delete', 'bulk_durum', etc.
  tablo          text NOT NULL,
  satir_sayisi   int NOT NULL DEFAULT 0,
  basarili       boolean NOT NULL DEFAULT true,
  hata_mesaji    text,
  firma_id       uuid,
  proje_id       uuid,
  kullanici_id   uuid,                    -- işlemi tetikleyen (cron için NULL)
  detay          jsonb                    -- ek bilgi (batch_ids, sebep, vs.)
);

CREATE INDEX IF NOT EXISTS idx_audit_tarih   ON audit_log(tarih DESC);
CREATE INDEX IF NOT EXISTS idx_audit_tip     ON audit_log(tip);
CREATE INDEX IF NOT EXISTS idx_audit_firma   ON audit_log(firma_id);
CREATE INDEX IF NOT EXISTS idx_audit_basarili ON audit_log(basarili) WHERE basarili = false;

COMMENT ON TABLE audit_log IS
  'Kritik DB işlemlerinin audit kaydı. Arşivleme, toplu silme, veri taşıma, vs. Başarısız kayıtlar alert için kullanılır.';


-- ─── SİSTEM ALERTS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sistem_alerts (
  id             bigserial PRIMARY KEY,
  tarih          timestamptz NOT NULL DEFAULT now(),
  seviye         text NOT NULL CHECK (seviye IN ('kritik', 'yuksek', 'orta', 'dusuk')),
  baslik         text NOT NULL,
  mesaj          text NOT NULL,
  firma_id       uuid,                    -- alert bir firmayı ilgilendiriyorsa
  kaynak         text,                    -- 'arsivle_cron', 'veri_butunluk', vs.
  cozuldu        boolean NOT NULL DEFAULT false,
  cozen_id       uuid,
  cozum_tarihi   timestamptz,
  detay          jsonb
);

CREATE INDEX IF NOT EXISTS idx_alerts_tarih    ON sistem_alerts(tarih DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_cozuldu  ON sistem_alerts(cozuldu) WHERE cozuldu = false;
CREATE INDEX IF NOT EXISTS idx_alerts_seviye   ON sistem_alerts(seviye);

COMMENT ON TABLE sistem_alerts IS
  'Sistem tarafından otomatik oluşturulan uyarılar. SA paneli bu tablodan çözülmemiş kayıtları gösterir.';


-- ─── ATOMİK ARŞİVLEME FONKSİYONU ─────────────────────────────────────────
-- Görev ID listesini TEK transaction içinde arşive taşır.
-- Hata olursa tümü rollback — veri kaybı imkansız.
CREATE OR REPLACE FUNCTION arsivle_canli_gorevler_atomik(
  p_ids uuid[],
  p_arsiv_nedeni text DEFAULT 'cron_saat'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tasinan int := 0;
  v_baslik_tasinan int := 0;
  v_madde_tasinan int := 0;
  v_hata text;
BEGIN
  -- ADIM 1: Çeklist maddelerini arşive taşı
  WITH maddeler_to_move AS (
    SELECT m.*
    FROM checklist_sonuc_maddeleri m
    JOIN checklist_sonuc_basliklari b ON b.id = m.sonuc_id
    WHERE b.canli_gorev_id = ANY(p_ids)
  ),
  inserted_maddeler AS (
    INSERT INTO checklist_sonuc_maddeleri_arsiv
    SELECT * FROM maddeler_to_move
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_madde_tasinan FROM inserted_maddeler;

  DELETE FROM checklist_sonuc_maddeleri
  WHERE sonuc_id IN (
    SELECT id FROM checklist_sonuc_basliklari WHERE canli_gorev_id = ANY(p_ids)
  );

  -- ADIM 2: Çeklist başlıklarını arşive taşı (firma_id görevden alınır)
  WITH basliklar_to_move AS (
    SELECT
      b.*,
      now() AS arsiv_tarihi_yeni,
      cg.firma_id AS firma_id_yeni
    FROM checklist_sonuc_basliklari b
    JOIN canli_gorevler cg ON cg.id = b.canli_gorev_id
    WHERE b.canli_gorev_id = ANY(p_ids)
  ),
  inserted_basliklar AS (
    INSERT INTO checklist_sonuc_basliklari_arsiv (
      id, canli_gorev_id, gorev_id, lokasyon_id, sablon_id, kullanici_id,
      kanal, kayit_tarihi, arsiv_tarihi, firma_id, proje_id
    )
    SELECT
      id, canli_gorev_id, gorev_id, lokasyon_id, sablon_id, kullanici_id,
      kanal, kayit_tarihi, arsiv_tarihi_yeni, firma_id_yeni,
      (SELECT proje_id FROM canli_gorevler WHERE id = basliklar_to_move.canli_gorev_id)
    FROM basliklar_to_move
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_baslik_tasinan FROM inserted_basliklar;

  DELETE FROM checklist_sonuc_basliklari
  WHERE canli_gorev_id = ANY(p_ids);

  -- ADIM 3: Görevleri arşive taşı (KRİTİK — burada fail olursa her şey rollback)
  WITH gorevler_to_move AS (
    SELECT * FROM canli_gorevler WHERE id = ANY(p_ids)
  ),
  inserted_gorevler AS (
    INSERT INTO canli_gorevler_arsiv
    SELECT
      cg.*,
      now() AS arsiv_tarihi,
      p_arsiv_nedeni AS arsiv_nedeni
    FROM gorevler_to_move cg
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*) INTO v_tasinan FROM inserted_gorevler;

  -- Doğrulama: arşivde gerçekten var mı?
  IF v_tasinan < (SELECT COUNT(*) FROM canli_gorevler WHERE id = ANY(p_ids)) THEN
    -- Transaction otomatik rollback olur
    RAISE EXCEPTION 'Arşive yazılan satır sayısı eksik: beklenen %, yazılan %',
      array_length(p_ids, 1), v_tasinan;
  END IF;

  -- ADIM 4: Orijinal tablodan sil (atomik — ancak arşive yazıldıktan sonra)
  DELETE FROM canli_gorevler WHERE id = ANY(p_ids);

  RETURN jsonb_build_object(
    'ok', true,
    'gorev_tasinan', v_tasinan,
    'baslik_tasinan', v_baslik_tasinan,
    'madde_tasinan', v_madde_tasinan
  );
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_hata = MESSAGE_TEXT;
  -- Transaction otomatik rollback olur
  RETURN jsonb_build_object('ok', false, 'hata', v_hata);
END;
$$;

COMMENT ON FUNCTION arsivle_canli_gorevler_atomik IS
  'Canli görev listesini tek transaction içinde arşive taşır. Hata olursa tüm değişiklikler geri alınır — veri kaybı imkansız.';


-- ─── YETİM KAYIT KONTROL FONKSİYONU ──────────────────────────────────────
-- Çeklist başlıklarında canli_gorev_id referansı olup görevi bulunamayanları sayar
CREATE OR REPLACE FUNCTION yetim_ceklist_kayitlari()
RETURNS TABLE(
  firma_id uuid,
  yetim_sayi bigint,
  en_eski timestamptz,
  en_yeni timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    b.firma_id,
    COUNT(*)::bigint AS yetim_sayi,
    MIN(b.kayit_tarihi) AS en_eski,
    MAX(b.kayit_tarihi) AS en_yeni
  FROM checklist_sonuc_basliklari_arsiv b
  LEFT JOIN canli_gorevler cg ON cg.id = b.canli_gorev_id
  LEFT JOIN canli_gorevler_arsiv cga ON cga.id = b.canli_gorev_id
  LEFT JOIN gorevler g ON g.id = b.gorev_id
  LEFT JOIN gorevler_arsiv ga ON ga.id = b.gorev_id
  WHERE (b.canli_gorev_id IS NOT NULL OR b.gorev_id IS NOT NULL)
    AND cg.id IS NULL AND cga.id IS NULL
    AND g.id IS NULL AND ga.id IS NULL
  GROUP BY b.firma_id
$$;
