# MOBİL EKİBE NOT — Cihaz QR Sonuç Sayfasında Sıkışıyor (Boot'ta restore?)

**Tarih:** 2026-06-17
**Önem:** 🔴 Yüksek — Saha kullanıcısı uygulamayı kullanamaz halde
**Etkilenen cihaz:** Tek bir cihaz tespit edildi (aşağıda), ama mekanizma genel olabilir
**Etkilenen sürüm:** 1.0.28 (Android 15)

---

## 1. Semptom

**Kullanıcı:** FERİDE MUTLU (`a58cae42-0789-41db-a048-514a3ee80c9c`)
**Cihaz:** `da9b7b345f60a213` · Android 15 · V2430 · app 1.0.28

Cihaz açıldığında / uygulama açıldığında **direkt** şu QR sonuç sayfasına atıyor ve çıkamıyor:

> **Başlık:** "Aktif Görev Yok"
> **Alt başlık:** "SU SEBİLİ TEMİZLİĞİ 1.BÖLGE"
> **Sağ üst:** "QR" badge
> **İçerik:** "Bu lokasyonda şu an aktif görev yok"
> **Butonlar:** "Ekstra Görev Yap" + "Ana Sayfaya Dön"

"Ana Sayfaya Dön" butonuna basılıyor → kısa süreliğine geçiyor gibi → **tekrar aynı sayfaya atıyor**.

---

## 2. Backend tarafında yapılan kontrol — **temiz**

Backend'de bu davranışı tetikleyebilecek herhangi bir veri yok:

| Kontrol | Sonuç |
|---|---|
| Feride'nin atanmış aktif (ACIK/ISLEMDE) görevi var mı? (canli_gorevler + gorevler) | **YOK** |
| Feride'nin `islemi_yapan_id` veya `baslatan_kullanici_id`'sinde ISLEMDE görev var mı? | **YOK** |
| `/api/app/aktif-gorev` ne döner? | `{ gorev: null }` |
| Feride'nin `users.ust_lokasyon_id`'si test için NULL yapıldı | **Davranış değişmedi** — yine aynı sayfaya atıyor |
| device_token pasifleştirildi → tekrar aktif | Sayfa değişmedi |

`users.ust_lokasyon_id` = MONTAJ üst lokasyonu. **SU SEBİLİ TEMİZLİĞİ 1.BÖLGE** MONTAJ'ın ilk alt çocuğu — ilk hipotezimiz "mobil app `ust_lokasyon_id` üzerinden otomatik ilk QR'a atıyor" idi. Hipotez yanlış çıktı (NULL yapınca davranış değişmedi).

---

## 3. Saha'da denenen — sonuç olumsuz

- ✅ App'i kapat-aç
- ✅ Cihazı kapat-aç
- ✅ App'i sil + tekrar yükle
- ✅ Ayarlar → Uygulamalar → iO-GYS → **"Verileri Temizle"** (cache + data)
- ✅ Backend'de device_token pasifleştir → tekrar aktif et
- ✅ Backend'de `ust_lokasyon_id` NULL yap → eski değer geri ata

**Hiçbirinde** sayfa değişmedi.

---

## 4. Başka cihazda aynı hesap — **çalışıyor**

Feride'nin hesabıyla **başka bir telefonda** giriş yapıldı → normal ana sayfa / görev listesi açıldı. Yani sorun **kesinlikle bu cihazın kendisinde** — backend / kullanıcı verisi temiz.

---

## 5. Mobil tarafta kontrol edilmesi istenenler

Backend tarafında elimizden geleni yaptık. Aşağıdaki noktalar sadece mobil tarafta çözülebilir:

### 5.1. Boot zamanı URL restoration var mı?

Mobil app açılışta **son ziyaret edilen URL'i (örn. AsyncStorage veya WebView session)** restore ediyor mu? Eğer öyleyse:
- Hangi koşulda silinmeli? (Verileri Temizle çağrısında temizleniyor mu?)
- Restore koşulları "boot'ta yapma, sadece app arkaplandan öne geldiyse yap" olarak revize edilebilir mi?

### 5.2. Android intent stack / Activity rootIntent

- Bu cihazda push notification tıklanmış ve Activity'nin **rootIntent**'inde yapışıp kalmış olabilir mi?
- Push tıklama akışında `singleTask` veya `clearTaskOnLaunch` flag'leri nasıl ayarlı?
- Recent apps'ten swipe kapatma sonrasında bile rootIntent korunuyor mu?

### 5.3. Open-by-default / App Links

- `iogys.com.tr/qr/*` URL'leri için Android tarafında "Default app: iO-GYS" set edilmiş mi? Bir QR linki paylaşılmış veya tıklanmışsa Android otomatik o URL'i açabilir.
- App settings → "Açılış bağlantıları" → varsayılanları temizleme adımı dokümantasyona eklenmeli mi?

### 5.4. Capacitor WebView state

- Capacitor `App.handleOpenUrl` veya `appUrlOpen` listener'ı var mı?
- WebView'ın `localStorage`/`sessionStorage`/`IndexedDB`'sinde "lastVisitedRoute" veya "pendingQrToken" gibi bir anahtar saklıyor olabilir miyiz? Verileri Temizle bunları silmeli ama bazı Android sürümlerinde uygulamaya özel cache silinmeyebiliyor.

### 5.5. "Ana Sayfaya Dön" butonu davranışı

Butona basıldığında **kısa süre düzeliyor, sonra tekrar aynı sayfaya dönüyor**. Bu davranış kritik — `router.replace('/')` veya benzeri yapılıyor ama hemen ardından bir başka mekanizma (push, intent, restoration) tekrar yönlendiriyor. Hangi efekt/listener bu yönlendirmeyi tetikliyor?

---

## 6. Test cihazı bilgileri (mobil ekip için)

```
user_id      : a58cae42-0789-41db-a048-514a3ee80c9c
isim_soyisim : FERİDE MUTLU
firma_id     : a121c4be-77ef-4cc7-8384-9f121eb22112  (ATALIAN)
device_id    : da9b7b345f60a213
device_token : ef20a254-6d9b-4b47-bd48-534a30412abd  (id)
app_version  : 1.0.28
UA           : Mozilla/5.0 (Linux; Android 15; V2430 Build/AP3A.240905.015.A2; wv) Chrome/149.0.7827.91
ust_lokasyon : 7f4a83e3-4ec6-46bc-8ea2-0f250e68bdbd  (MONTAJ)
takılı sayfa : QR /qr/ef87674d-68a9-45f8-b364-d8e6ff21988f  (SU SEBİLİ TEMİZLİĞİ 1.BÖLGE)
```

QR URL'i muhtemelen: `https://iogys.com.tr/qr/ef87674d-68a9-45f8-b364-d8e6ff21988f`

---

## 7. Acil saha çözümü

Mobil tarafta kalıcı fix gelene kadar **Feride'ye geçici başka bir telefon verildi** (aynı hesapla başka cihazda çalıştığı doğrulandı). Bozuk cihaz mobil ekipte log/inceleme için kullanıma açıktır.

---

## 8. Talep

🙏 Bu davranışı tetikleyebilecek bir routing/restoration mekanizması var mı tespit etmenizi ve varsa kapatmanızı / koşullarını revize etmenizi rica ederim. Tek bir cihazda görülmüş olsa bile **mekanizma genel olduğu için başka cihazlarda da tetiklenebilir**.

Sorular için bu dosyaya yorum bırakabilir veya direkt iletişime geçebilirsiniz.
