# Mobil Ekibe — Oto Yıkama Tur 2 Cevapları

**Tarih:** 2026-05-19
**Cevaplayan:** Web ekibi

---

## 1. Foto Upload — ✅ Yeni endpoint hazır

**Karar: A akışı** (önce foto yükle URL al, sonra tek POST ile tamamla).

### Yeni endpoint: `POST /api/app/upload/oto-yikama`

**Body (multipart/form-data):**
```
file        — image (png/jpg/webp)
lokasyon_id — UUID
plaka       — string (mobil tarafta upper-case + boşluksuz normalize edin)
tip         — 'oncesi' | 'sonrasi'
```

**Response:**
```json
{ "ok": true, "publicUrl": "https://...supabase.co/storage/v1/object/public/checklist-media/oto-yikama/.../oncesi-1716120000000.jpg" }
```

**Yetki:** yıkama personeli (kullanici_lokasyon_yetkileri'nde oto_yikama_lokasyon=true).
Olmazsa **403 OTO_YIKAMA_YETKISI_YOK**.

**Storage:**
- Bucket: `checklist-media` (mevcut, ek bucket gerekmez)
- Path: `oto-yikama/{lokasyon_id}/{PLAKA}/{tip}-{timestamp}.{ext}`

### Sonraki POST'a URL'leri koy

Hem `/api/app/ekstra-frekans` (Oto Yıkama dalı) hem `/api/app/gorev-tamamla` body'sine
opsiyonel olarak alıyor (önceki Tur 1):
```json
{
  ...
  "km": 145300,
  "foto_oncesi_url": "https://...oncesi-...jpg",
  "foto_sonrasi_url": "https://...sonrasi-...jpg",
  "notlar": "..."
}
```

---

## 2. Checklist Sistemi

**1) Mobile checklist'i nereden yükler?**
Evet — `scan-context` cevabındaki `checklistTemplate` field'ından. Bu field
`lokasyonlar.checklist_sablon_id` ile bağlı şablonun maddelerini içerir.
Mevcut spesifik görev akışıyla birebir aynı format.

**2) Test ortamına şablon ataması:**
ATALIAN-TEST → ARAÇ YIKAMA > İSTASYON-1/2 için bir test şablonu eklenecek.
**Tercih size:** sade çek-cevap (Dış / İç / Jant / Motor) mi yoksa daha detaylı mı?
Söyleyin, web panelden 5 dk'da atayalım.

**3) Madde formatı:**
Standart (spesifik görev ile aynı):
- `secenek_degeri` (örn "EVET" / "HAYIR" veya custom seçenekler)
- `aciklama` (opsiyonel text)
- `gorsel_url` (opsiyonel foto)

Foto upload `/api/app/upload/checklist` endpoint'ini kullanır (taskId zorunlu — checklist görev oluştuktan sonra eklenir). Veya Oto Yıkama için yeni
`/api/app/upload/oto-yikama` endpoint'ini de kullanabilirsiniz (taskId istemez).

---

## 3. Geçmiş Endpoint — ✅ Düzeltildi

`GET /api/app/gecmis` artık her Oto Yıkama görevi için ek field'lar döner:
```json
{
  "id": "uuid",
  "tanim": "Oto Yıkama - 16BGB710 (Ekstra)",
  "durum": "TAMAMLANDI",
  "tarih": "2026-05-19T10:30:00Z",
  "lokasyon": "İSTASYON-1",
  "tip": "manuel",
  "kategori": "tamamlanan",
  // ↓ Oto Yıkama görevleri için (sadece metadata varsa)
  "oto_yikama": true,
  "plaka": "16BGB710",
  "ekstra": true,
  "km": 145300,
  "notlar": "Çamurlu",
  "foto_oncesi_url": "https://...",
  "foto_sonrasi_url": "https://..."
}
```

Oto Yıkama olmayan normal görevlerde `oto_yikama` field'ı **yok** (undefined) —
geriye uyumlu.

---

## 4. Planlı + Ekstra Çakışması — ⏳ Atalian'ın kararı bekleniyor

İki seçenek var, ben şu an kullanıcıya soruyorum:

**A) Ekstra yapılınca planlı otomatik kapansın** — günde 1 yıkama disiplini
**B) İki ayrı kayıt kalsın** — esnek, ekstra ve planlı bağımsız

Karar gelince backend tarafında `ekstra-frekans` Oto Yıkama dalına bir satır eklerim:
```ts
// Senaryo A için:
await admin.from('gorevler').update({ durum: 'TAMAMLANDI', ... })
  .eq('firma_id', firmaId)
  .eq('lokasyon_id', /* aynı istasyon */)
  .eq('durum', 'ACIK')
  .in('id', /* aynı plaka + bugün metadata gorev_ids */)
```

Bu güne kadar mobil tarafta **B (mevcut)** ile devam edebilirsiniz; karar sonrası
sadece backend güncellemesi gerek, mobil değişmez.

---

## 5. `bugun_tamamlananlar` Field'ı

**İçerik:** `[{ tanim: string, adet: number }]` formatında — o lokasyonda bugün
**(TR 00:00 itibaren)** TAMAMLANDI olan kural-tabanlı görevlerin distinct tanım
listesi + adetleri. Frekansiyel ekstra görev modal'ında "şu güne kadar X yıkama
yapıldı" tarzı geri bildirim için tasarlandı.

Şu anki kod (referans): [`lib/scan/bugunTamamlananlar.ts`](../lib/scan/bugunTamamlananlar.ts)

**Oto Yıkama için ne yapar?**
Helper'ın Oto Yıkama dalında bu field doğrudan **plaka bazlı tamamlanma sayımı** döner:
- Örn: `[{ tanim: "16BGB710", adet: 1 }, { tanim: "06ABC123", adet: 2 }]`
- Yani bugün bu istasyonda hangi plaka kaç kez yıkanmış

**Mobile kullanımı:**
- Plaka seçim ekranında "✓ Bugün yıkandı" rozeti için ideal — `bugun_tamamlananlar` array'inde plaka varsa rozet göster
- Veya araç listesinde `araclar` endpoint'inden gelen `bugun_yikandi: boolean` zaten kullanılabilir (Tur 1)

---

## 6. Senkronizasyon

**Anında güncel — async değil.** `ekstra-frekans` POST DB INSERT yapar, hemen
döner. Bir sonraki `bugun-planli` GET çağrısında veri taze.

1-2sn gecikme **client-side cache veya network round-trip** olabilir, backend
tarafında async job/event handler yok. Optimistic update + delayed refresh
yaklaşımınız doğru — değiştirmenize gerek yok.

---

## 7. OCR Plaka Eşleştirme — Örnek

**Endpoint:** `POST /api/app/oto-yikama/plaka-eslestir`

**Test ortamında deneme (ATALIAN-TEST firma, mobil kod ARFF2Y):**

```http
POST /api/app/oto-yikama/plaka-eslestir
X-Device-Token: <yıkama personeli token>
Content-Type: application/json

{ "okunan_plaka": "TEST001" }
```

**Cevap (tam eşleşme):**
```json
{
  "ok": true,
  "kesin_eslesme": {
    "id": "uuid",
    "plaka": "TEST001",
    "marka": "TOYOTA",
    "model": "Corolla",
    "departman": "YÖNETİCİ",
    "kullanici_adi_soyadi": "Test Yönetici 1",
    "fark": 0
  },
  "olasi_adaylar": []
}
```

**Cevap (yaklaşık eşleşme — örn OCR "TEST0OI" okuduğunda):**
```json
{
  "ok": true,
  "kesin_eslesme": null,
  "olasi_adaylar": [
    { "id": "uuid", "plaka": "TEST001", "fark": 2, ... },
    { "id": "uuid", "plaka": "TEST008", "fark": 2, ... }
  ]
}
```

**Cevap (bulunamadı, fark > 2):**
```json
{ "ok": true, "kesin_eslesme": null, "olasi_adaylar": [] }
```

- Normalize: backend `[^A-Z0-9]` temizler ve upper-case'e çevirir. Mobil tarafta
  da aynısını yaparsanız network'te boş istek azalır.
- Eşik: Levenshtein **≤ 2** karakter fark.
- Max aday: 5.

---

## 8 + 9. UI/UX + Versiyon — bilgi alındı, teşekkürler

Test cihazı uyumluluğu (vivo V2247, Android 16) iyi. ML Kit Text Recognition
riski için ileride **html5-qrcode benzeri fallback** kurmayı düşünebilirsiniz —
ama Tesseract.js zaten cross-platform, sorun olmayabilir.

---

## ✅ Backend tarafında yapılanlar (bu tur)

1. **Yeni endpoint:** `/api/app/upload/oto-yikama` (Madde 1)
2. **`/api/app/gecmis`** Oto Yıkama metadata ile genişletildi (Madde 3)

## ⏳ Bekleyenler (sizin / Atalian'ın aksiyonu)

- **Madde 2.2:** Test ortamına Yıkama Çeklist şablonu — söyleyin, atayım
- **Madde 4:** Senaryo A mı B mi (kullanıcıya soruyorum)

Hazır olduğunuzda mobil tarafta Aşama 3.5 (foto + checklist) eklenebilir.
