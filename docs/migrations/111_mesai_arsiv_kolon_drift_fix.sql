-- Migration 111: personel_mesai_kayitlari_arsiv tablosuna eksik 5 kolonu ekle
--
-- SORUN:
--   `personel_mesai_kayitlari` (canlı) tablosu zamanla 5 yeni kolon kazandı:
--     bildirim_sayaci, son_bildirim_tarihi, cikis_onay_token,
--     cikis_bildirim_gonderildi, cikis_devam_flag
--   Ama `personel_mesai_kayitlari_arsiv` bu kolonları almadı.
--
--   Cron `/api/tasks/arsivle` şunu yapıyor:
--     admin.from('...arsiv').insert(rows.map(x => ({ ...x, arsivleme_tarihi })))
--   Yani canlı satırın TÜM kolonlarını spread ediyor.
--
--   Arşiv tablosunda bu 5 kolon olmadığı için insert PGRST204 hatası atıyor.
--   Cron kodu insert() dönüşünü kontrol etmiyor → hata sessizce yutulur →
--   hemen ardından `.delete()` çalışır → kayıtlar KALICI OLARAK KAYBOLUR.
--
-- SEMPTOM:
--   `personel_mesai_kayitlari_arsiv` tablosu boş (veya çok eski Mart kayıtları),
--   canlı tabloda sadece son 24-48 saatlik kayıtlar var, aradaki günler
--   HİÇBİR YERDE YOK.
--
-- ÇÖZÜM:
--   Bu 5 kolonu arşive de ekleyerek insert'in başarılı olmasını sağla.
--   Cron kodunun kendisi de ayrıca defensive hale getiriliyor (bkz. commit).

ALTER TABLE public.personel_mesai_kayitlari_arsiv
  ADD COLUMN IF NOT EXISTS bildirim_sayaci integer,
  ADD COLUMN IF NOT EXISTS son_bildirim_tarihi timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cikis_onay_token text,
  ADD COLUMN IF NOT EXISTS cikis_bildirim_gonderildi boolean,
  ADD COLUMN IF NOT EXISTS cikis_devam_flag boolean;

COMMENT ON TABLE public.personel_mesai_kayitlari_arsiv IS
  'Mesai kayıtları arşivi — canlı tablonun 1:1 kopyası. Kolon drift olursa /api/tasks/arsivle sessizce fail eder ve veri kaybı olur; bu tabloyu canlı ile senkron tut.';
