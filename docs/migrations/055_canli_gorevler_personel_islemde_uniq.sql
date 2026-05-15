-- Migration 055: Bir personel aynı anda en fazla 1 ISLEMDE göreve sahip olabilir
--
-- Bug: SİM cron grup-bazlı çalışıyor; her grup kendi mesgulPersoneller
-- Set'ini sıfırdan kuruyor → gruplar arası kilit yok → bir personele
-- Grup A'da görev verildikten sonra Grup B aynı personeli serbest sandığı
-- için ona da görev veriyordu (REMZİYE örneği: ÇAY+SİGARA çakışması).
--
-- Code-level fix: simulasyon/calistir.ts'de grup-üstü mesgulPersoneller
-- kuruldu (eşlenik commit). Bu DB constraint defense-in-depth:
-- - Cron multi-instance race condition'ını önler
-- - Gerçek personel + sim çakışmasını önler
-- - Mobil app double-click bug'ını önler
--
-- Mantık: durum='ISLEMDE' satırlar arasında baslatan_kullanici_id unique.
-- Diğer durumlar (ACIK, TAMAMLANDI, IPTAL, vs) etkilenmez — partial index.

-- Önce mevcut duplicate'lar temizlendi (manuel; bu migration öncesi).
-- Constraint çakışırsa migration patlar; o yüzden temizlik şart.

CREATE UNIQUE INDEX IF NOT EXISTS canli_gorevler_personel_islemde_uniq
  ON canli_gorevler(baslatan_kullanici_id)
  WHERE durum = 'ISLEMDE' AND baslatan_kullanici_id IS NOT NULL;

COMMENT ON INDEX canli_gorevler_personel_islemde_uniq IS
  'Bir personel aynı anda max 1 ISLEMDE frekansiyel görev. SIM çift atama bug fix (defense-in-depth).';
