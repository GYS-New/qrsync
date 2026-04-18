# MOBİL EKİBE NOT — check-device Cihaz Tabanlı Firma Çözümleme (Hazır)

**Tarih:** 2026-04-19
**Durum:** Backend tamamlandı, sizin kullanıma hazır.

İstediğiniz gibi `/api/app/check-device` endpoint'i `firma_id` parametresi olmadan da çalışacak şekilde güncellendi. Geriye uyumlu, eski akışlar kırılmadı.

---

## 1. API sözleşmesi

### `GET /api/app/check-device`

**Parametreler:**

| Parametre | Zorunlu mu? | Açıklama |
|---|---|---|
| `device_id` | ✅ Evet | Android `Settings.Secure.ANDROID_ID` veya eşdeğer benzersiz cihaz ID'si |
| `firma_id` | Opsiyonel | Yeni mobil — firma kodu çözümü sonrası elinde varsa gönder |
| `firma` | Opsiyonel | Eski mobil — `app_download_links.link_token` (geriye uyumluluk) |

**Davranış:**

1. **firma_id VERİLDİ** → o firma için device_id eşleşmesi ara.
2. **firma (token) VERİLDİ** → token'dan firma_id çöz, o firma için eşleşme ara.
3. **HİÇBİRİ VERİLMEDİ** → yalnızca `device_id` ile ara, birden fazla varsa **en son `son_kullanim`** kaydını döndür.

### Başarılı yanıt (kayıt bulunduğunda)

```json
{
  "ok": true,
  "eskiKayit": {
    "user_id":     "uuid",
    "isim_soyisim":"Ad Soyad",
    "proje_id":    "uuid",
    "firma_id":    "uuid",
    "firma_adi":   "ATALİAN"
  }
}
```

**Yeni:** `firma_id` ve `firma_adi` her zaman yanıtta yer alır (eski sürümlerde yoktu — geriye uyumsuzluk yaratmaz; eski mobil okumazsa yok sayar).

### Kayıt yok / cihaz silinmiş / firma pasif

```json
{ "ok": true, "eskiKayit": null }
```

Mobil bu durumda firma kodu giriş ekranını gösterir.

### Hatalı istek

```json
{ "ok": false, "error": "device_id gerekli" }
```
HTTP 400.

---

## 2. Önerdiğiniz mobil init akışı

Sizin taslağınız bire bir uygulanabilir:

```javascript
const savedFirmaId = await getFromStorage('firma_id')

const url = savedFirmaId
  ? `/api/app/check-device?device_id=${deviceId}&firma_id=${savedFirmaId}`
  : `/api/app/check-device?device_id=${deviceId}`

const res = await fetch(url).then(r => r.json())

if (res.ok && res.eskiKayit) {
  // Auto-restore:
  //   firma_id, firma_adi, user_id, isim_soyisim, proje_id → storage
  //   proje/isim seçim ekranlarını atla, direkt şifre ekranı göster
  // Şifre doğrulaması /api/app/register'da zaten var — mevcut akış.
} else {
  // Firma kodu giriş ekranından başla
}
```

---

## 3. "Birden fazla firma" senaryosu

Şimdilik backend **her zaman en son `son_kullanim`'a sahip kaydı** dönüyor (most-recent-wins). Cihaz birden fazla firmaya bağlıysa da sadece en son kullanılanı döner.

Eğer ilerde "birden fazla firma var, kullanıcı seçsin" akışı isterseniz backend'de ayrı bir endpoint açılabilir (ör. `/api/app/check-device-tum` veya body parametresi). Şimdilik gerek görmedik, ihtiyaç olursa söyleyin.

---

## 4. Güvenlik — şifre kontrolünü bypass etmez

Auto-restore sadece **bilgi getirme** işlemi. Asıl auth hâlâ `/api/app/register`'da, `sifre` alanı zorunlu:

1. check-device → eski kayıt bilgileri cevap olarak döner
2. Mobil `firma_id, user_id, proje_id, isim_soyisim` bilgilerini elde
3. Kullanıcıya **sadece şifre** sorulur
4. Mobil `/api/app/register` çağırır → sifre doğrulanır → auth tamamlanır

Yani cihaz tanınsa bile şifre olmadan auth yok. Mevcut güvenlik zincirini koruduk.

**Not:** Register endpoint'i de `firma_id`'yi zaten alıyordu (soft rollout ile); ek değişiklik gerekmez.

---

## 5. Pasif firma / silinmiş kullanıcı durumu

Backend iki durumda `eskiKayit: null` döner:

- Eşleşen `device_tokens` kaydı yok
- Kullanıcı pasif (`users.aktif = false`)
- **YENİ:** Firma pasif (`firmalar.aktif = false`) — rebrand/çıkış sonrası otomatik yeniden onboard akışı

Bu durumlarda mobil, firma kodu ekranını gösterir. Yeni firmaya geçmek isteyen kullanıcılar böylece engelsiz yeni kod girebilir.

---

## 6. Test

```bash
# Yeni akış: sadece device_id
curl "https://app.iogys.com.tr/api/app/check-device?device_id=test-dev-1"

# firma_id ile
curl "https://app.iogys.com.tr/api/app/check-device?device_id=test-dev-1&firma_id=<UUID>"

# Eski akış (firma token) hâlâ çalışıyor
curl "https://app.iogys.com.tr/api/app/check-device?device_id=test-dev-1&firma=<LINK_TOKEN>"
```

---

## 7. Deploy

Commit ile birlikte Railway otomatik deploy alacak (yaklaşık 1-2 dk). Deploy sonrası test edebilirsiniz.

Soru veya ek istek olursa dönün.
