-- Migration 056: Spesifik görevleri lokasyon bağımlılığından ayır
--
-- Tasarım: Spesifik görevler (gorevler tablosu) artık opsiyonel lokasyona
-- sahip. Hibrit mod:
--   - Lokasyon DOLU → eski akış (QR/NFC tamamlama, çeklist, lokasyon scope)
--   - Lokasyon NULL → kişisel görev (mobilde "Benim Görevlerim"den direkt
--     tamamla, QR yok, çeklist yok)
--
-- Mevcut görevler etkilenmez (geriye uyumlu) — sadece NULL'a izin veriyoruz.
-- Backend null-safe (Supabase JSON embed pattern, optional chaining her yerde).
--
-- Karar gerekçesi:
--   - Prod'da 6 canlı + 0 arşiv kayıt — düşük risk
--   - Tüm JOIN'ler LEFT EMBED (INNER yok) → satır kaybı yok
--   - QR/NFC kontrol: gorev-tamamla satır 100'de "if (gorev.lokasyon_id)"
--     null-safe — NULL ise kontrol skip
--   - Çeklist: lokasyonlar?.checklist_sablon_id null-safe chain
--   - Bildirim: lokasyonTanim ?? '—' fallback
--   - RLS: firma izolasyonu, lokasyon bazlı değil
--
-- gorevler_arsiv tablosunda lokasyon_id kolonu zaten var; arşivleme
-- SELECT*→INSERT* kopyalama mantığında NULL değerleri otomatik kopyalar.

ALTER TABLE gorevler ALTER COLUMN lokasyon_id DROP NOT NULL;

COMMENT ON COLUMN gorevler.lokasyon_id IS
  'Spesifik görevin yapılacağı lokasyon. NULL ise kişisel görev — mobilde "Benim Görevlerim"den direkt tamamlanır, QR/çeklist yok.';
