# Mobil Ekibe — Oto Yıkama Soruları Toplu Cevap

**Tarih:** 2026-05-17
**Yanıtlayan:** Web ekibi

Sırayla 11 soru için tek tek cevap. Önemli notlar **kalın**.

---

## 1. Personel ayırt etme

**`users.rol = 'ARAÇ YIKAMA'` diye bir rol YOK ve eklenmeyecek** (Kural 1:
mevcut yapı bozulmaz; yeni rol/kolon eklenmez).

**Doğru sinyal: `kullanici_lokasyon_yetkileri` tablosu**

Kullanıcı eklenirken üst lokasyon seçimi zorunlu. Yıkama personeli olarak
işaretlenecek kişiye "ARAÇ YIKAMA" üst lokasyonu atanır. Yani:

```
Kullanıcı "yıkama personeli" mi?
  ↓
kullanici_lokasyon_yetkileri tablosunda kaydı var mı?
  AND ust_lokasyon_id'ye bağlı lokasyon.oto_yikama_lokasyon = true?
```

**Önerimiz: Profil endpoint'ine `oto_yikama_personeli: boolean` ekleyelim.**

Backend hesaplaması:
```sql
SELECT EXISTS (
  SELECT 1 FROM kullanici_lokasyon_yetkileri k
  JOIN lokasyonlar l ON l.id = k.ust_lokasyon_id
  WHERE k.user_id = :user_id
    AND l.oto_yikama_lokasyon = true
) AS oto_yikama_personeli
```

`true` → mobil yıkama UI'ı açar, `false` → mevcut görev UI'ı (hiç değişmez).

Bu yaklaşım hem:
- ✅ Mevcut `users` tablosunda hiçbir değişiklik gerektirmez
- ✅ Bir kullanıcı hem yıkama hem normal görev yapabilir (birden fazla üst lokasyona atanabilir)
- ✅ Mevcut "Personel Detay" sayfasından "ARAÇ YIKAMA" üst lokasyonu atanarak/çıkarılarak yıkama yetkisi açılır/kapanır

**Aksiyon:** Profil endpoint'ini güncelleyeceğim — söyleyin hangi endpoint'i kullanıyor mobil (büyük olasılıkla `/api/app/profil` veya `/api/auth/me`). Yoksa yeni endpoint ekleyim.

---

## 2. Planlı yıkama görevleri

**Tablo: `gorevler`** (canli_gorevler DEĞİL — Oto Yıkama spesifik görev).

Görev oluşturulurken:
- `gorevler` tablosuna 1 satır: `tanim="Oto Yıkama - <PLAKA>"`, `lokasyon_id=İSTASYON-X`,
  `atanan_kullanici_id=NULL` (açık görev — QR okutan yapar), `durum='ACIK'`
- `oto_yikama_gorev_metadata` tablosuna 1 satır: `gorev_id`, `arac_id`,
  `plaka_snapshot="<PLAKA>"`, `hedef_tarih="YYYY-MM-DD"`, `ekstra=false`

**Endpoint:** Mevcut **`/api/app/gorevlerim`** kullanılabilir. Bu endpoint personelin
aktif görev listesini döner. Oto Yıkama görevleri `atanan_kullanici_id=NULL` (açık)
olduğu için yıkama personelinin lokasyon yetkisi ile filtre ekleyebiliriz.

**Alternatif (önerilen):** Yeni endpoint **`GET /api/app/oto-yikama/bugun-planli`**
döner — bugün hedef_tarih olan açık/işlemde Oto Yıkama görevleri (yıkama
personelinin yetkili olduğu lokasyonlar altında). Daha temiz/spesifik bir liste.

**Plaka bilgisi:** İkisi de var — hem `gorevler.tanim` içinde (örn "Oto Yıkama - 16BGB710"),
hem `oto_yikama_gorev_metadata.plaka_snapshot` kolonunda. Parse etmek yerine
**metadata'dan oku** (daha güvenli, kullanıcı tanım'ı değiştirirse parse bozulur).

---

## 3. QR sticker

**Şu an araçlara QR sticker YOK.** Sistemde QR'lar **lokasyonlara** ait.
ARAÇ YIKAMA altındaki İSTASYON-1 ve İSTASYON-2 lokasyonlarının her birinin
**sabit tek bir QR'ı** var (lokasyon kaydedildiğinde otomatik üretilen `qr_veri`).

Yıkama personeli istasyon QR'ını okuturken:
- `scan-context` endpoint'i o lokasyonun aktif görevlerini + `ekstra_frekans_kurallari`
  (Oto Yıkama altıysa plaka listesi) döner
- Mobil app dropdown'da plakaları gösterir

**Atalian araçlara QR yapıştırırsa nasıl olur?**
- Her araç için yeni bir QR token üretmek mümkün ama mevcut sistem
  `lokasyonlar.qr_veri` tabanlı. Araçlara QR atamak için yeni tablo/sistem gerek.
- **Önerimiz:** İlk fazda yapmayalım — mobil OCR + istasyon QR + plaka dropdown
  yeterli. İhtiyaç çıkarsa Phase 2'de eklenir.

---

## 4. Araç listesi (1000 araç) endpoint'i

Mevcut iki yol:

**A) Mevcut `scan-context` / `offline-snapshot` cevabı içinde:**
- `lokasyon.ekstra_frekans_kurallari` array'i = firma'nın aktif plaka listesi
  (Oto Yıkama lokasyonlarında). Şu an düz string array `[{tanim: "16BGB710"}, ...]`
- Mobil zaten cache'ler

**B) Yeni endpoint (önerilen, daha zengin):**

`GET /api/app/oto-yikama/araclar` — yıkama personeli için tam metadata:
```json
{
  "ok": true,
  "araclar": [
    {
      "id": "uuid",
      "plaka": "16BGB710",
      "marka": "Toyota",
      "model": "Corolla",
      "renk": "Beyaz",
      "departman": "YÖNETİCİ",
      "kullanici_adi_soyadi": "Ahmet Yılmaz",
      "yikama_gunleri": [1, 3],
      "son_yikama_tarihi": "2026-05-10T08:30:00Z",
      "bugun_yikandi": false,
      "yikama_gerekli_mi": true
    }
  ]
}
```

**Yetki:** firma_id eşleşmesi yeterli. Tüm 1000 araç (aktif olanlar) döner.
Mobil cache'ler, offline kullanır.

**Önerimiz:** B yolu — bu endpoint'i hazırlayabilirim. ~10 dk iş.

---

## 5. Plaka eşleştirme (OCR sonrası)

**Önerimiz: B — Backend eşleştirir** (sebep: 1000 araç memory'de zaten var,
Levenshtein hızlı, mobil battery/CPU yer).

Yeni endpoint: `POST /api/app/oto-yikama/plaka-eslestir`

Body:
```json
{ "okunan_plaka": "16BGB7I0" }
```

Cevap:
```json
{
  "ok": true,
  "kesin_eslesme": null,
  "olasi_adaylar": [
    { "id": "uuid", "plaka": "16BGB710", "fark": 1, "departman": "YÖNETİCİ", "kullanici_adi_soyadi": "Ahmet Yılmaz" },
    { "id": "uuid", "plaka": "16BGB718", "fark": 2, "departman": "POOL", "kullanici_adi_soyadi": null }
  ]
}
```

- `fark = 0` → kesin eşleşme, `kesin_eslesme` doldurulur
- `fark <= 2` → aday listesi (max 5)
- `fark > 2` → boş döner, mobil "bulunamadı, listeden seç" der

Backend Levenshtein algoritmasıyla mesafe hesaplar. Plaka normalize:
upper-case + boşluk/tire temizliği.

---

## 6. Yıkama tamamlama

**İki durum için iki endpoint:**

### Planlı görev (gorevler tablosunda hedef_tarih=today olan ACIK)
Mevcut **`/api/app/gorev-tamamla`** kullanılabilir. Body:
```json
{
  "gorev_id": "uuid",
  "checklist_results": [...],
  "scan_token": "..."  // İstasyon QR token
}
```

Backend gorevler.durum=TAMAMLANDI yapar.

### Ekstra yıkama (planlı değil)
Mevcut **`/api/app/ekstra-frekans`** Oto Yıkama dalı (zaten çalışıyor):
```json
{
  "lokasyon_id": "İSTASYON-X uuid",
  "gorev_tanim": "16BGB710",
  "scan_token": "..."
}
```

Backend `gorevler` + `metadata (ekstra=true)` yazar.

### KM + foto + checklist için
Şu an `oto_yikama_gorev_metadata`'da km/foto kolonu yok. **Migration ile
ekleyebiliriz** (~5 dk):

```sql
ALTER TABLE oto_yikama_gorev_metadata
  ADD COLUMN IF NOT EXISTS km int,
  ADD COLUMN IF NOT EXISTS foto_oncesi_url text,
  ADD COLUMN IF NOT EXISTS foto_sonrasi_url text,
  ADD COLUMN IF NOT EXISTS notlar text;
```

Sonra her iki endpoint body'sine opsiyonel olarak alınır:
```json
{
  "gorev_id": "...",
  "checklist_results": [...],
  "km": 145300,
  "foto_oncesi_url": "...",
  "foto_sonrasi_url": "...",
  "notlar": "...",
  "scan_token": "..."
}
```

**Onayınız varsa migration + endpoint genişletmesi hazırlayacağım.**

---

## 7. Foto upload

**Mevcut görev sistemindeki gibi — Supabase Storage.**

Checklist sonuçları için zaten `gorsel_url text` kolonu var
(`checklist_sonuc_maddeleri.gorsel_url`). Aynı pattern Oto Yıkama için de
kullanılır.

Mobil tarafında upload:
1. Foto seç/çek
2. Supabase client ile `storage.from('bucket').upload(...)`
3. Dönen URL'i endpoint body'sine koy

Bucket için `gorev-fotograflari` (mevcut) veya yeni `oto-yikama-fotograflari`
kullanılabilir. RLS policy `authenticated insert` yeterli.

---

## 8. Checklist yapısı

**Mevcut `checklist_sablonlari` sistemini kullanın** — proje bazlı dinamik.

İSTASYON-1 ve İSTASYON-2 lokasyonlarına web panelden bir "Yıkama Çeklisti"
şablonu atayın (`lokasyonlar.checklist_sablon_id`). Mobil tarafta:
- `/api/scan/context` cevabında `sablon` alanı dolu gelir
- Şablon maddeleri (Dış / İç / Jant / Motor vb.) gösterilir
- Personel cevaplar, gönderir

**Avantaj:** Atalian sonra "Pool araçları için farklı çeklist" derse İstasyon
bazlı şablon atayabilir. Esnek.

**Sabit/hard-coded checklist istemiyoruz** çünkü gelecekte değişiklik gerektirir.

---

## 9. KM bilgisi

**Önerimiz: Ayrı bir alan** (checklist maddesi değil).

Sebepler:
- KM sayısal — checklist genelde EVET/HAYIR
- "Önceki KM" karşılaştırması için spesifik kolon lazım
- Raporlamada `MAX(km) - MIN(km)` gibi sorgular kolaylaşır

Migration ile `oto_yikama_gorev_metadata.km int` eklenir (§6'da bahsettim).

**KM gerileme:** Backend `km < SELECT MAX(km) FROM oto_yikama_gorev_metadata
WHERE arac_id = ? AND km IS NOT NULL` ise uyarır (response'da
`uyari: "KM önceki yıkamadan düşük"`). **Yine kabul eder** — bazen arıza/değişim
olabilir, mobil uyarıyı kullanıcıya gösterir, devam edebilir.

---

## 10. Aynı araç günde 1 yıkama kuralı

**Backend zorlamıyor.** Mevcut UNIQUE constraint:
`UNIQUE (arac_id, hedef_tarih, gorev_id)` — `gorev_id` da unique key'in parçası.
Yani aynı araç + aynı gün için **farklı gorev_id ile birden fazla kayıt mümkün**.
Ekstra yıkama akışı bunu kullanıyor.

**Akış:**
- **Planlı yıkama:** Bugün için `metadata.hedef_tarih = today AND arac_id = X
  AND ekstra = false` kaydı varsa → mobil "Bu araç bugün için planlı yıkanmış,
  ekstra mı?" diye sorar
- **Ekstra yıkama:** Hiçbir kısıt yok — istenildiği kadar açılabilir

**Mobil tarafının kontrol etmesine gerek yok** — `/api/app/oto-yikama/araclar`
endpoint'i `bugun_yikandi: true` döner. Mobil UI'da görsel uyarı verir, kullanıcı
yine yıkayabilir.

---

## 11. Test ortamı

**Mevcut canlı veri test için kullanılabilir:**
- Firma: ATALIAN (`a121c4be-77ef-4cc7-8384-9f121eb22112`)
- Proje: OYAK RENAULT (`bd9dfb20-16aa-4038-9542-83abb167e6ee`)
- Üst lokasyon: ARAÇ YIKAMA (`6b7c6067-683c-4bce-b759-fd0b1d6d2cd0`)
- Alt lokasyonlar: İSTASYON-1, İSTASYON-2 (her ikisinin QR'ı aktif)
- Araç sayısı: 48 (aktif)

**Apple Review için yıkama personeli oluşturulabilir:**
- Test kullanıcısı (örn `yikama.test@atalian.com`)
- Üst lokasyon yetkisi: ARAÇ YIKAMA
- Kişisel kod paylaşılır

**Ayrı test firması istenirse:**
- `ATALIAN-TEST` firma + boş proje + 5-10 test plakası → 5 dk açabilirim.
- Apple Review için spesifik bir firma kodu istiyorsanız söyleyin.

---

## Mobil ekibinin UI planına yorum

UI akışınız mantıklı görünüyor. Aşağıdaki düzeltmeleri öneriyorum:

### `users.rol = 'ARAÇ YIKAMA'` yerine
Profil endpoint'inden `oto_yikama_personeli: true` flag'i ile yönlendirin.

### "QR Okut" + "OCR" iki ayrı buton
- QR Okut → İstasyon QR'ı (lokasyon scan-context tetiklenir)
- OCR → Plaka tarama (plaka-eslestir endpoint'i)

Mevcut UI mantığınızla %100 uyumlu.

### Hibrit yapı (planlı + QR + OCR + araç listesi)
Bu yaklaşım çok sağlam — ML Kit fail olursa kullanıcı diğer yollara düşer.
**Önerim:** "Araç Listesi" sekmesinde arama (plaka/kullanici_adi/departman)
ve hızlı seçim ile gitsin.

---

## 🛠️ Web ekibinden çıkacak iş listesi

Mobil ekibin onayıyla aşağıdakileri yapacağım:

1. **Profil endpoint'i** `/api/app/profil` (veya mevcut karşılığı) — `oto_yikama_personeli: bool` alanı eklensin
2. **Migration** — `oto_yikama_gorev_metadata`'ya `km int + foto_oncesi_url + foto_sonrasi_url + notlar text` kolonları
3. **Yeni endpoint** `GET /api/app/oto-yikama/araclar` — yıkama personeli için zenginleştirilmiş araç listesi
4. **Yeni endpoint** `POST /api/app/oto-yikama/plaka-eslestir` — Levenshtein fuzzy match
5. **Yeni endpoint** `GET /api/app/oto-yikama/bugun-planli` — bugünün planlı yıkamaları (opsiyonel — mevcut `gorevlerim` de iş görür)
6. **Mevcut `/api/app/gorev-tamamla` ve `/api/app/ekstra-frekans` body'lerine** opsiyonel km/foto/notlar alanları
7. **Test kullanıcısı/firması** (ihtiyaç varsa)

**Tahmini süre:** Tüm bu iş için yarım gün.

**Onay verirseniz başlayım.**
