# ARŞIV SİSTEMİ - DEPLOYMENT GUIDE

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

## 2️⃣ ENVIRONMENT VARIABLE KONTROL

`.env.local` dosyasında zaten var:

```bash
CRON_SECRET=14tGrTju6KTA3cQntEvlJrEUI72GhVTVAxyOAbMA0T4
```

✅ Bu token kullanılacak. Vercel production ortamında da ekle:

**Vercel > Settings > Environment Variables:**
```
CRON_SECRET = 14tGrTju6KTA3cQntEvlJrEUI72GhVTVAxyOAbMA0T4
```

💡 Kalıp: `x-cron-token` header'ına bu değeri gönder

---

## 3️⃣ CRON JOB SCHEDULE (Vercel üzerindeyse)

### A) VERCEL CRON (Önerilen)

`vercel.json` dosyasına:
```json
{
  "crons": [
    {
      "path": "/api/tasks/arsivle",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

Redeploy et:
```bash
git add .
git commit -m "feat: setup real archiving system with 6-hour cron"
git push
```

---

### B) DIŞ CRON SERVICE (Eğer Vercel cron yoksa)

1. **cron-job.org** → https://cron-job.org/en/
2. URL: `https://senin-site.com/api/tasks/arsivle`
3. Method: `POST`
4. Headers:
   ```
   x-cron-token: [environment'daki CRON_SECRET_TOKEN]
   ```
5. Schedule: `0 */6 * * *` (Her 6 saat)

---

### C) SELF-HOSTED (Node.js)

`lib/cron/job.ts` veya `scripts/cron-setup.js` ekle:

```typescript
// lib/cron/job.ts
import cron from 'node-cron'
import fetch from 'node-fetch'

export function setupArsivCron() {
  // Her 6 saatte: 00:00, 06:00, 12:00, 18:00
  cron.schedule('0 */6 * * *', async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/tasks/arsivle`,
        {
          method: 'POST',
          headers: {
            'x-cron-token': process.env.CRON_SECRET_TOKEN!,
            'Content-Type': 'application/json',
          },
        }
      )
      const json = await res.json()
      console.log('[CRON-ARSIVLE]', json)
    } catch (e) {
      console.error('[CRON-ARSIVLE] Hata:', e)
    }
  })
}
```

`app.ts` veya Next.js server startup'ta:
```typescript
import { setupArsivCron } from '@/lib/cron/job'
setupArsivCron()
```

---

## 4️⃣ TEST ET

### A) Manuel Test (Postman / cURL)

```bash
curl -X POST https://senin-site.com/api/tasks/arsivle \
  -H "x-cron-token: 14tGrTju6KTA3cQntEvlJrEUI72GhVTVAxyOAbMA0T4" \
  -H "Content-Type: application/json"
```

**Beklenen yanıt:**
```json
{
  "ok": true,
  "message": "24+ saatlik veriler başarıyla arşivlendi",
  "results": {
    "personel": { "moved": 5, "ok": true },
    "musteri": { "moved": 3, "ok": true },
    "spesifik": { "moved": 0, "ok": true },
    "ceklist": { "moved": 2, "madde_count": 8, "ok": true }
  }
}
```

### B) Sayfaları Kontrol Et

Şu adreslerde **hiçbir değişiklik olmayacak:**

- `/ta/dashboard/arsiv` → Tüm sekmeler aynı çalışacak
- `/sa/dashboard/arsiv` → Tüm sekmeler aynı çalışacak
- `/raporlar/ceklist` → Rapor Merkezi aynı
- Arşiv sayfalarında çeklist verileri görünecek

**Veriler fiziksel olarak taşındığı için:**
- Rapor sayfaları asıl tablolardan (son 24 saat) çekecek ✅
- Arşiv sayfaları arşiv tablolarından çekecek ✅
- **Tabloların boyutu kontrol altında kalacak** ✅

---

## 5️⃣ DEPLOYMENT ADIMLAR

```bash
# 1. Feature branch
git checkout -b feat/real-archiving-system

# 2. SQL + Code commit
git add scripts/arsiv-tabloları-olustur.sql
git add app/api/tasks/arsivle/route.ts
git add .env.local  # (CRON_SECRET_TOKEN)
git commit -m "feat: Implement real archiving system - physical data migration every 6h"

# 3. Push
git push origin feat/real-archiving-system

# 4. PR açıp merge et
# 5. Vercel'de otomatik deploy

# 6. SQL çalıştır (Supabase SQL Editor)
# 7. Vercel cron aktif oldu ✅
```

---

## 6️⃣ MONİTORİNG

Cron çalıştıktan sonra kontrol et:

**Personel mesai:**
```sql
SELECT COUNT(*) as asil FROM personel_mesai_kayitlari WHERE arsivlendi = false;
SELECT COUNT(*) as arsiv FROM personel_mesai_kayitlari_arsiv;
```

**Müşteri:**
```sql
SELECT COUNT(*) as asil FROM musteri_degerlendirmeleri WHERE arsivlendi = false;
SELECT COUNT(*) as arsiv FROM musteri_degerlendirmeleri_arsiv;
```

**Çeklist:**
```sql
SELECT COUNT(*) as asil FROM checklist_sonuc_basliklari;
SELECT COUNT(*) as arsiv FROM checklist_sonuc_basliklari_arsiv;
```

---

## 7️⃣ ARŞIV RETENSİYON POLİTİKASI

İleridge ayar formuyla:

```
Çeklist arşiv veri tutma: 30 gün (varsayılan)
Personel arşiv veri tutma: 90 gün
Müşteri arşiv veri tutma: 1 yıl
Görev arşiv veri tutma: 2 yıl
```

Bu opsiyonel ve sonradan yapılabilir.

---

## ⚠️ NOTLAR

- ✅ Mevcut sayfalar **DOKUNULMADI** - UI/UX aynı
- ✅ `cikti=rapor` mode çeklist raporunu asıl tablodan çekeriz
- ✅ `cikti=arsiv` mode çeklist arşivini arşiv tablosundan çekeriz
- ✅ Cron **idempotent** - aynı datayı ikinci kez taşımayacak
- ⚠️ Token gizli tutulmalı - `.env` veya Vercel secrets'da

---

## 📞 SORUNLAR

**Cron çalışmıyor?**
- `.env` dosyasını check et
- Vercel cron log'larına bak

**Veri taşınmıyor?**
- SQL tabloları oluştun mu?
- İzinler (RLS) ayarlı mı?

**API hata dönüyor?**
- POST request'i test et
- x-cron-token header'ını check et
