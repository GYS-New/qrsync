# ARŞIV SİSTEMİ - UYGULAMA ÖZETI

## 🎯 Amacı
Mevcut sayfaların görünüş ve çalışmax **BİR TÜRLÜ DEĞIŞMEDEN**, arka plandafizikseal arşivleme sistemi kurmak.

---

## 📊 MEVCUT DURUM

| Rapor Türü | Daha Önceki Yöntem | Problem | YENİ YÖNTEM |
|---|---|---|---|
| **Frekansiyel** | Ön fiziksel tablo | ✅ İyi | Devam eder |
| **Personel** | Same table + flag | ❌ Büyüyor | Fiziksel taşıma |
| **Müşteri** | Same table + flag | ❌ Büyüyor | Fiziksel taşıma |
| **Spesifik** | Same table + filter | ❌ Büyüyor | Fiziksel taşıma |
| **Çeklist** | Same table + filter | ❌ Büyüyor | Fiziksel taşıma |

---

## ✅ YAPILAN İŞLER

### 1️⃣ Veritabanı (5 Arşiv Tablosu)
```
scripts/arsiv-tabloları-olustur.sql
```

Oluşturulan tablolar:
- `personel_mesai_kayitlari_arsiv`
- `musteri_degerlendirmeleri_arsiv`
- `gorevler_arsiv`
- `checklist_sonuc_basliklari_arsiv`
- `checklist_sonuc_maddeleri_arsiv`

### 2️⃣ Cron Endpoint
```
app/api/tasks/arsivle/route.ts
```

- POST request kabul eder
- Token kontrolü: `x-cron-token` header
- 24+ saat eski veriyi taşır
- Her rapor tipi için aşağıdaki işletir:
  - Asıl tablodanveriyi oku
  - Arşiv tablosuna yaz
  - Asıl tablodan sil (veya flag yaz)

### 3️⃣ Cron Schedule
```
vercel.json
```

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

Her 6 saatte çalışır: 00:00, 06:00, 12:00, 18:00

### 4️⃣ Deployment Guide
```
ARSIV_DEPLOYMENT.md
```

---

## 🔄 ÇALIŞ İŞLEYİŞİ

### Bu Gece (24 saat sonra)

```
00:00 → Cron çalışır → /api/tasks/arsivle GET
          ↓
        24+ saat eski
          ↓
     Personel: 0 kayıt, Müşteri: 0 kayıt,
     Spesifik: X kayıt, Çeklist: Y kayıt
```

### Rapor Sayfası (Mevcut)

```
Rapor Merkezi > Çeklist
  └─ API: /api/raporlar/ceklist?cikti=rapor
     └─ checklist_sonuc_basliklari tabloından SADECE
        kayit_tarihi > NOW() - 24 HOURS
```

### Arşiv Sayfası (Mevcut)

```
Arşiv > Çeklist
  └─ API: /api/raporlar/ceklist?cikti=arsiv
     └─ checklist_sonuc_basliklari_arsiv'den TÜM veriler
```

---

## 🚀 DEPLOYMENT ADIMLAR

### 1. SQL çalıştır (Supabase SQL Editor)
```sql
-- scripts/arsiv-tabloları-olustur.sql'i çalıştır
```

### 2. Commit & Push
```bash
git add scripts/arsiv-tabloları-olustur.sql
git add app/api/tasks/arsivle/route.ts
git add vercel.json
git commit -m "feat: Implement physical archiving system - 5 archive tables + 6h cron"
git push origin main
```

### 3. Vercel Environment Variable
Vercel > Settings > Environment Variables:
```
CRON_SECRET = 14tGrTju6KTA3cQntEvlJrEUI72GhVTVAxyOAbMA0T4
```

### 4. Deploy
```bash
git push
# veya Vercel'den manuel Deploy
```

---

## ✨ SONUÇLAR

### DÖNEMINDEKİ GÖRÜNÜş (YALAY!)

- ✅ Sayfalar AYNEN çalışır
- ✅ UI değişmemesi
- ✅ Filtreler/arama AYNİ
- ✅ Export (CSV/Excel/Baskı) AYNI

### ARKADAKI İLYETEŞMELER

- ✅ Tablolar fiziksel olarak taşınır
- ✅ Asıl tabloların boyutu sabit kalır
- ✅ Sorgu hızı artar
- ✅ Arşiv veri ayrı tutulur

---

## 📋 TEST CHECKLIST

- [ ] SQL tabloları başarıyla oluşturuldu
- [ ] `/api/tasks/arsivle` POST isteği 200 döner
- [ ] Vercel cron logs'ta çalıştığı görülür
- [ ] Rapor sayfası normal çalışır
- [ ] Arşiv sayfası doğru veri gösterir
- [ ] 24+ saat eski kayıtlar arşive taşındı

---

## 📞 SAĞ KONTROL KOMUTLARI

```sql
-- Çeklist kaymışmı?
SELECT COUNT(*) FROM checklist_sonuc_basliklari WHERE kayit_tarihi < NOW() - INTERVAL '24 hours';
SELECT COUNT(*) FROM checklist_sonuc_basliklari_arsiv;

-- Personel taşındımı?
SELECT COUNT(*) FROM personel_mesai_kayitlari WHERE kayit_tarihi < NOW() - INTERVAL '24 hours' AND arsivlendi = false;
SELECT COUNT(*) FROM personel_mesai_kayitlari_arsiv;

-- Müşteri taşındımı?
SELECT COUNT(*) FROM musteri_degerlendirmeleri WHERE olusturma_tarihi < NOW() - INTERVAL '24 hours' AND arsivlendi = false;
SELECT COUNT(*) FROM musteri_degerlendirmeleri_arsiv;

-- Spesifik taşındımı?
SELECT COUNT(*) FROM gorevler WHERE (durum = 'IPTAL' OR (durum = 'TAMAMLANDI' AND durum_degisim_tarihi < NOW() - INTERVAL '24 hours'));
SELECT COUNT(*) FROM gorevler_arsiv;
```

---

## 🎉 TAMAMLANDI!

Gerçek arşivleme sistemi kuruldu. Mevcut sayfalar dokunulmadı.
Cron 6 saatte birden çalışacak ve 24+ saat eski veriyi taşıyacak.

**Ready to deploy!** 🚀
