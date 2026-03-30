# ARŞIV SİSTEMİ - DEPLOYMENT GUIDE (RAILWAY)

## 1️⃣ VERITABANI TABLOSU OLUŞTUR

Supabase SQL Editor'de çalıştır:
```
scripts/arsiv-tabloları-olustur.sql
```

✅ Kontrol:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name LIKE '%arsiv%' AND table_schema = 'public';
```

---

## 2️⃣ RAILWAY ENVIRONMENT VARIABLE EKLE

Railway Dashboard > Services > Your App > Variables:

```
CRON_SECRET = 14tGrTju6KTA3cQntEvlJrEUI72GhVTVAxyOAbMA0T4
```

---

## 3️⃣ CRON JOB SETUP (Railway'de Otomatik)

### A) NODE-CRON KÜTÜPHANESİ (Entegre)

`lib/cron/job.ts` → Node.js cron kütüphanesi
`server.js` → Custom Next.js server avec cron başlatma

**Railway Başlangıç:**
```
npm install
npm run build
npm start
```

Server başlarken cron otomatik aktif olur. ✅

---

### B) MANUEL TEST

```bash
curl -X POST https://senin-railway-url/api/tasks/arsivle \
  -H "x-cron-token: 14tGrTju6KTA3cQntEvlJrEUI72GhVTVAxyOAbMA0T4" \
  -H "Content-Type: application/json"
```

**Beklenen yanıt:**
```json
{
  "ok": true,
  "message": "24+ saatlik veriler başarıyla arşivlendi",
  "results": {
    "personel": { "moved": X, "ok": true },
    "musteri": { "moved": X, "ok": true },
    "spesifik": { "moved": X, "ok": true },
    "ceklist": { "moved": X, "madde_count": Y, "ok": true }
  }
}
```

---

## 4️⃣ DEPLOYMENT ADIMLAR

```bash
# 1. Dependency ekle
npm install

# 2. Build et
npm run build

# 3. Railway push (git push otomatik deploy eder)
git add .
git commit -m "feat: Add Railway cron job for archiving + update APIs"
git push origin main

# Railway otomatik build & deploy eder
```

---

## 5️⃣ LOG KONTROL (Railway)

Railway Dashboard > Logs:

```
[CRON] Arşiv cron job başlatıldı (her 6 saat)
[CRON-ARSIVLE] 2026-03-31T... { ok: true, results: {...} }
```

---

## 6️⃣ DATABASE SOL KONTROL

Her 6 saat sonra:

```sql
-- Çeklist taşındı mı?
SELECT COUNT(*) FROM checklist_sonuc_basliklari;
SELECT COUNT(*) FROM checklist_sonuc_basliklari_arsiv;

-- Personel taşındı mı?
SELECT COUNT(*) FROM personel_mesai_kayitlari WHERE arsivlendi = false;
SELECT COUNT(*) FROM personel_mesai_kayitlari_arsiv;

-- Müşteri taşındı mı?
SELECT COUNT(*) FROM musteri_degerlendirmeleri WHERE arsivlendi = false;
SELECT COUNT(*) FROM musteri_degerlendirmeleri_arsiv;

-- Spesifik taşındı mı?
SELECT COUNT(*) FROM gorevler WHERE durum IN ('IPTAL', 'TAMAMLANDI');
SELECT COUNT(*) FROM gorevler_arsiv;
```

---

## 7️⃣ CRON SCHEDULE DEĞIŞTİRMEK

`lib/cron/job.ts` satır 11:

```typescript
cron.schedule('0 */6 * * *', async () => { // Her 6 saat
```

Cron formatı:
- `0 */12 * * *` → Her 12 saat
- `0 0,6,12,18 * * *` → 00:00, 06:00, 12:00, 18:00
- `0 9 * * MON` → Pazartesi 09:00

---

## ⚠️ NOTLAR

- ✅ Mevcut sayfalar **DOKUNULMADI** - UI/UX aynı
- ✅ Cron Node.js'de çalışır (Railway'de otomatik)
- ✅ `cikti=rapor` mode asıl tablodan çekeriz
- ✅ `cikti=arsiv` mode arşiv tablosundan çekeriz
- ⚠️ Cron 6 saatte bir çalışır (Railway reboot'a dayanıklıdır)
- ⚠️ Token gizli tutulmalı - Railroad env variables'a sahip

---

## 📞 SORUNLAR

**Cron çalışmıyor?**
- Railway logs'ı kontrol et
- `CRON_SECRET` env var'ı var mı?
- `/api/tasks/arsivle` endpoint'i erişilebilir mi?

**Veri taşınmıyor?**
- SQL tabloları oluştun mu?
- İzinler (RLS) ayarlı mı?
- Verileri manuel test: POST request yolla

**Server başlamıyor?**
- `npm install` çalıştır
- `npm run build` kontrol et
- Logs'ı oku

