# Runbook — OYAK Vardiya Saatleri Geçişi

**Hedef tarih:** 2026-05-31 22:30 TR (çalıştırma anı)
**Aktivasyon:** 2026-05-31 23:30 TR (yeni cron çalışır, 1 Haz V1 başlar)
**Migration:** `docs/migrations/066_oyak_vardiya_saatleri_yeni_sistem.sql`

---

## ÖNCEKİ KONTROLLER (31 May 22:00 civarı)

```sql
-- 1) 1 Haz için henüz görev üretilmemiş olduğunu teyit
SELECT COUNT(*) FROM canli_gorevler
WHERE firma_id='a121c4be-77ef-4cc7-8384-9f121eb22112'
  AND (aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul')::date = '2026-06-01';
-- BEKLENEN: 0
```

```sql
-- 2) Mevcut OYAK kural saatleri (önceki snapshot, raporlama için)
SELECT to_char(aktif_olma_saati,'HH24:MI') AS saat, COUNT(*)
FROM gorev_kurallari gk JOIN lokasyonlar l ON l.id=gk.lokasyon_id
WHERE gk.firma_id='a121c4be-77ef-4cc7-8384-9f121eb22112'
  AND l.proje_id='bd9dfb20-16aa-4038-9542-83abb167e6ee'
  AND gk.aktif=true GROUP BY saat ORDER BY saat;
-- BEKLENEN: 00:05=68, 08:00=179, 16:00=128
```

---

## UYGULAMA (31 May 22:30 TR)

1. **Supabase Dashboard** → SQL Editor → New query
2. `docs/migrations/066_oyak_vardiya_saatleri_yeni_sistem.sql` içeriğini yapıştır
3. **Run** → "BU MIGRATION 2026-05-31 22:00 TR ÖNCESI ÇALIŞTIRILAMAZ" hatası gelirse zaman doğru değildir, bekle
4. Başarılı çalışırsa NOTICE log'ları:
   - `Yeni saat: 07:30 (179 kural)`
   - `Yeni saat: 15:30 (128 kural)`
   - `Yeni saat: 23:35 (68 kural)`

---

## DOĞRULAMA (Migration sonrası, 22:35-23:00 arası)

```sql
-- A) Firma vardiya
SELECT vardiya_saatleri, tum_vardiya_ayarlari->'3' AS aktif_set
FROM firmalar WHERE id='a121c4be-77ef-4cc7-8384-9f121eb22112';
-- BEKLENEN: 23:30-07:30, 07:30-15:30, 15:30-23:30
```

```sql
-- B) Kural saatleri
SELECT to_char(aktif_olma_saati,'HH24:MI') saat, COUNT(*)
FROM gorev_kurallari gk JOIN lokasyonlar l ON l.id=gk.lokasyon_id
WHERE gk.firma_id='a121c4be-77ef-4cc7-8384-9f121eb22112'
  AND l.proje_id='bd9dfb20-16aa-4038-9542-83abb167e6ee'
  AND gk.aktif=true GROUP BY saat ORDER BY saat;
-- BEKLENEN: 07:30=179, 15:30=128, 23:35=68
```

```sql
-- C) pg_cron schedule
SELECT jobname, schedule, active FROM cron.job WHERE jobname='qrsync-gece-dongu';
-- BEKLENEN: schedule='30 20 * * *', active=true
```

---

## CRON ÇALIŞMA İZLEME (31 May 23:30+)

23:30 itibariyle pg_cron çalışacak. Doğrulama:

```sql
-- Cron son çalışma
SELECT
  to_char(start_time AT TIME ZONE 'Europe/Istanbul','YYYY-MM-DD HH24:MI:SS') AS basla_tr,
  status, return_message
FROM cron.job_run_details d JOIN cron.job j ON j.jobid=d.jobid
WHERE j.jobname='qrsync-gece-dongu'
ORDER BY start_time DESC LIMIT 3;
-- BEKLENEN (yeni satır): basla_tr=2026-05-31 23:30:00, status='succeeded'
```

```sql
-- 1 Haziran için üretilen görev sayısı
SELECT COUNT(*) FROM canli_gorevler
WHERE firma_id='a121c4be-77ef-4cc7-8384-9f121eb22112'
  AND (aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul')::date = '2026-06-01';
-- BEKLENEN: ~375 (kural sayısı kadar, frekans çarpanına göre değişir — günlük frekans yüksekse fazla)
```

```sql
-- audit_log'da cron_gece_dongu detayı
SELECT detay->>'tr_tarih' AS hedef_tarih, detay->'uretim' AS uretim
FROM audit_log
WHERE tip='cron_gece_dongu'
ORDER BY tarih DESC LIMIT 1;
-- BEKLENEN: hedef_tarih=2026-06-01, uretim.ok=true, uretim.uretilen>0
```

---

## GERİ DÖNÜŞ (Acil rollback gerekirse)

Aşağıdaki blok migration etkilerini geri alır:

```sql
-- 1) pg_cron eski schedule
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname='qrsync-gece-dongu'),
  schedule := '1 21 * * *'
);

-- 2) gece_tam_dongu eski hali (v_tr_date = bugün)
-- → migration 029 veya 034'teki orijinal fonksiyonu yeniden CREATE OR REPLACE et

-- 3) Kural saatleri +30 dk
UPDATE gorev_kurallari gk SET aktif_olma_saati = gk.aktif_olma_saati + INTERVAL '30 minutes'
FROM lokasyonlar l
WHERE gk.lokasyon_id=l.id AND gk.firma_id='a121c4be-77ef-4cc7-8384-9f121eb22112'
  AND l.proje_id='bd9dfb20-16aa-4038-9542-83abb167e6ee' AND gk.aktif=true;

-- 4) Firma vardiya eski hali
UPDATE firmalar SET
  vardiya_saatleri = '[{"no":1,"baslangic":"00:00","bitis":"08:00"},{"no":2,"baslangic":"08:00","bitis":"16:00"},{"no":3,"baslangic":"16:00","bitis":"00:00"}]'::jsonb,
  tum_vardiya_ayarlari = jsonb_set(tum_vardiya_ayarlari, '{3}',
    '[{"no":1,"baslangic":"00:00","bitis":"08:00"},{"no":2,"baslangic":"08:00","bitis":"16:00"},{"no":3,"baslangic":"16:00","bitis":"00:00"}]'::jsonb)
WHERE id='a121c4be-77ef-4cc7-8384-9f121eb22112';

-- Üretilmiş 1 Haziran görevleri yeni saatlerle oluştuysa silmek gerekebilir:
DELETE FROM canli_gorevler
WHERE firma_id='a121c4be-77ef-4cc7-8384-9f121eb22112'
  AND (aktif_olma_tarihi AT TIME ZONE 'Europe/Istanbul')::date = '2026-06-01'
  AND durum IN ('HAZIR','ACIK')  -- TAMAMLANDI/IPTAL olanlara dokunma
  AND olusturma_tarihi >= '2026-05-31 19:00:00+00';  -- migration sonrası üretilen
```

---

## NOTLAR

- **31 May'in vardiyaları (eski sistem)** o gün için normal çalışır, 23:30'a kadar eski saatlerle
- **1 Haz V1** (yeni sistem) 31 May 23:30'da başlar, ilk görev 23:35'te aktif
- **Vardiya hesabı geriye dönük etkilenir:** 31 May ve öncesi raporlarda vardiya sınırları yeni saatlere göre yeniden çizilir (örn 31 May 16:00 görevi eski sistemde V3, yeni sistemde de hala V3 — sayı değişmez, sadece sınırlar değişir)
- **Diğer ATALIAN projeleri** (BOSCH/Rexroth/TOGG/SİRO) pasif olduğu için etkilenmez
