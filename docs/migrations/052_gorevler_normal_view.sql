-- Migration 052: gorevler_normal view — yıkama görevleri hariç spesifik görevler
--
-- Oto Yıkama görevleri gorevler tablosuna spesifik görev olarak yazılıyor
-- (mobil mevcut akışla okusun diye), ama web yönetim sayfaları onları
-- görmemeli (kullanıcı isteği: yıkama için ayrı raporlar/günlük tablo).
--
-- Bu view, oto_yikama_gorev_metadata'da kaydı OLMAYAN görevleri döner.
-- Yönetim sayfaları (Spesifik Görevler, raporlar, arşiv vb.) bu view'ı
-- kullanır; INSERT/UPDATE/DELETE'ler doğrudan gorevler tablosuna yapılır.
--
-- RLS: View underlying gorevler tablosunun RLS politikalarını miras alır.

CREATE OR REPLACE VIEW public.gorevler_normal AS
SELECT g.*
FROM gorevler g
WHERE NOT EXISTS (
  SELECT 1
  FROM oto_yikama_gorev_metadata m
  WHERE m.gorev_id = g.id
);

COMMENT ON VIEW public.gorevler_normal IS
  'gorevler tablosunun "yıkama-hariç" görünümü. Spesifik görev yönetim sayfaları bu view''ı kullanır; yıkama görevleri ayrı raporlanır.';
