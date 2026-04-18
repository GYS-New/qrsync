# MOBİL EKİBE NOT — check-device Cihaz Tabanlı Auto-Login (Güncel)

**Tarih:** 2026-04-19 (revizyon)
**Durum:** Backend tamamlandı.

---

## ÖNEMLİ REVİZYON

İlk dönüşte "re-install sonrası şifre ekranı göster" demiştik. **Revizyon:**

> **Cihaz daha önce bu backend'e kayıt olduysa, re-install sonrası HİÇBİR doğrulama olmadan direkt ana ekrana geçilir.**

**Neden:** Şifre doğrulaması "rastgele isim-cihaz eşleştirmesini" önlemek içindi. Re-install senaryosunda cihaz ve bağlı kullanıcı zaten eşleşmiş durumda — yeni pairing yok, rastgele eşleşme riski yok. Aynı fiziksel cihaz, aynı bağlı kullanıcı.

Şifre sadece **ilk kez cihaz-kullanıcı bağlaması** sırasında (yeni register) sorulur.

---

## 1. API sözleşmesi

### `GET /api/app/check-device`

**Parametreler:**

| Parametre | Zorunlu mu? | Açıklama |
|---|---|---|
| `device_id` | ✅ Evet | Android `Settings.Secure.ANDROID_ID` veya eşdeğer |
| `firma_id` | Opsiyonel | Yeni mobil — firma kodu çözümü sonrası varsa gönder |
| `firma` | Opsiyonel | Eski mobil — `app_download_links.link_token` (geriye uyumluluk) |

**Davranış:**

1. `firma_id` verildi → o firma için device_id eşleşmesi ara.
2. `firma` (token) verildi → token'dan firma_id çöz, o firma için eşleşme ara.
3. Hiçbiri verilmedi → yalnızca `device_id` ile ara, birden fazla varsa **en son `son_kullanim`** kaydını döndür.

### Başarılı yanıt (eşleşme bulundu — auto-login!)

```json
{
  "ok": true,
  "eskiKayit": {
    "user_id":      "uuid",
    "isim_soyisim": "Ad Soyad",
    "proje_id":     "uuid",
    "firma_id":     "uuid",
    "firma_adi":    "ATALİAN",
    "device_token": "token-string"
  }
}
```

**YENİ:** `device_token` eklendi. Mobil bu token ile register'ı bypass edip direkt ana ekrana geçer.

### Kayıt yok / cihaz silinmiş / firma pasif

```json
{ "ok": true, "eskiKayit": null }
```

Mobil firma kodu giriş ekranını gösterir → normal kayıt akışı (firma kodu → proje → isim → şifre → register).

### Hatalı istek

```json
{ "ok": false, "error": "device_id gerekli" }
```

---

## 2. Mobil init akışı (GÜNCEL)

```javascript
const res = await fetch(`/api/app/check-device?device_id=${deviceId}`)
  .then(r => r.json())

if (res.ok && res.eskiKayit) {
  // ✓ Cihaz tanındı — auto-login, ŞİFRE SORMA
  await saveToStorage({
    firma_id:     res.eskiKayit.firma_id,
    firma_adi:    res.eskiKayit.firma_adi,
    user_id:      res.eskiKayit.user_id,
    isim_soyisim: res.eskiKayit.isim_soyisim,
    proje_id:     res.eskiKayit.proje_id,
    device_token: res.eskiKayit.device_token,
  })
  goToMainScreen()
} else {
  // Yeni kurulum / silinmiş cihaz → firma kodu ekranı
  goToFirmaKoduScreen()
}
```

Mobil zaten `firma_id`'yi storage'da tutuyorsa ilk çağrıda ekleyebilirsin — ama gerek yok, sadece `device_id` yeterli.

---

## 3. Şifre akışı ne zaman devreye girer?

**Sadece yeni pairing sırasında:**

1. Firma kodu girişi (yeni cihaz / silindikten sonra eşleşme yok)
2. Proje seç
3. İsim seç
4. **Şifre ekranı** ← sadece burada
5. `/api/app/register` → doğru şifre → device_tokens row'u oluşur

**Re-install sonrası:**

1. check-device → eskiKayit dolu
2. Direkt ana ekran (şifre yok)

---

## 4. Birden fazla firma senaryosu

Cihaz farklı firmalara da bağlı olabilir (nadir ama mümkün — IT/test cihazı vs). Backend **en son son_kullanim** kaydını döndürüyor. İhtiyaç olursa liste dönebilen ayrı endpoint açarız.

---

## 5. Pasif firma / silinmiş kullanıcı

Backend `eskiKayit: null` döner şu durumlarda:

- Eşleşen `device_tokens` kaydı yok
- Kullanıcı pasif (`users.aktif = false`)
- Firma pasif (`firmalar.aktif = false`)

Bu durumlarda mobil firma kodu ekranına döner. Eski cihaz yeni firma için temiz başlar.

---

## 6. Güvenlik dengesi

**Tercih edilen model:**
- Cihaz tabanlı kimlik: `device_id` + `device_token` (Android storage'da saklanır, ama backend DB'de de var)
- Şifre: sadece ilk pairing'de (proje/isim seçiminde random matching'i engellemek için)
- Re-install: cihaz tanımlıysa auto-login

**Risk:** Cihaz çalınırsa/verilirse, yeni kişi önceki hesaba erişir. Ama bu zaten Android ANDROID_ID modelinin doğası. Kullanıcı IT'den cihaz silme isteyebilir → TA, ilgili device_tokens row'unu `aktif=false` yapar → bir sonraki check-device `eskiKayit: null` döner.

TA için "Cihazı Kaldır" butonu gerekliyse backend'de eklenebilir — söyleyin.

---

## 7. Test

```bash
# Auto-login testi (cihaz daha önce kayıtlı)
curl "https://app.iogys.com.tr/api/app/check-device?device_id=test-dev-1"

# Yanıtta eskiKayit.device_token gelirse → mobil direkt ana ekran
```

---

## Özet

- **Yeni pairing** (ilk kurulum, firma değişimi): firma kodu + proje + isim + **ŞİFRE** zorunlu.
- **Re-install** (aynı cihaz, silinip yeniden kurulum): `device_id` yeterli, **ŞİFRE YOK**, device_token otomatik döner.

Soru olursa dönün.
