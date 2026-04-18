# MOBİL EKİBE NOT — Personel İsim-Cihaz Eşleştirmesinde Şifre Doğrulama

**Tarih:** 2026-04-17 (revizyon: 2026-04-19)
**Backend commit:** (bu notun yanındaki commit hash'i)
**Durum:** Backend tarafı hazır — mobil güncelleme bekleniyor.

## ÖNEMLİ (2026-04-19 revizyonu)

Şifre doğrulaması **yalnızca YENİ pairing** sırasında sorulur (firma kodu → proje → isim → **şifre** → register).

**Re-install senaryosu:** Cihaz daha önce kayıtlıysa `/api/app/check-device` ile auto-login olur, şifre sorulmaz. Detay için `MOBIL_EKIBE_CHECK_DEVICE_DONUS.md`.

---

## 1. Neden değişiklik yapıldı?

Mobil uygulamada personel proje seçimi sonrası listeden ismini seçiyor, seçim anında `POST /api/app/register` çağrılıyor ve cihaz o kullanıcıyla eşleştiriliyordu. **Hiçbir doğrulama yoktu** — rastgele bir personel, başka bir personelin ismini seçerek kendi cihazını onun yerine tanıtabiliyordu.

Bu güvenlik açığını kapatmak için **isim seçimi sonrasında şifre sorulacak ve doğrulanacak**.

---

## 2. Backend tarafında yapılanlar

**Dosya:** [app/api/app/register/route.ts](../app/api/app/register/route.ts)

Endpoint artık **opsiyonel** olarak `sifre` alanını kabul ediyor:

```json
POST /api/app/register
{
  "firma_token": "...",
  "device_id":   "...",
  "user_id":     "...",
  "isim_soyisim":"...",
  "proje_id":    "...",
  "sifre":       "kullanıcının şifresi"   ← YENİ ALAN
}
```

**Davranış:**

| `sifre` alanı | Backend davranışı |
|---|---|
| Yok / boş / null | Şifre doğrulaması atlanır (eski mobil sürümler için geriye uyumluluk) |
| Gönderildi | Supabase Auth üzerinden `signInWithPassword` ile doğrulanır |

**Yanıtlar:**

| Durum | HTTP | Body |
|---|---|---|
| Başarılı | 200 | `{ ok: true, device_token, user_id, ... }` |
| Şifre yanlış | **401** | `{ ok: false, error: "Şifre hatalı", sifre_hatali: true }` |
| Çok yanlış deneme (5) | **429** | `{ ok: false, error: "Çok fazla yanlış deneme. 900 saniye sonra…", kilitli: true, kalan_sn: 900 }` |
| Kullanıcı yok / firma hatası | 403/404 | `{ ok: false, error: "..." }` |

**Brute-force koruması:** Aynı `device_id` için 5 yanlış denemede 15 dakika kilit.

---

## 3. Mobil tarafın yapacakları

### 3.1. Yeni ekran: Şifre giriş

Kullanıcı isim seçtikten sonra **proje seçim / isim listesine geri dönmeden ÖNCE** şifre girişi ekranı açılacak. Alanlar:

- Maskeli şifre input'u (gizli)
- "Giriş Yap" butonu
- "Vazgeç / Geri Dön" butonu → isim listesine döndürür

### 3.2. API çağrısı güncelle

`/api/app/register` isteğine `sifre` alanı eklenecek:

```dart
// örnek (Flutter/Dart)
final body = {
  "firma_token": firmaToken,
  "device_id":   deviceId,
  "user_id":     secilenUserId,
  "isim_soyisim":secilenIsimSoyisim,
  "proje_id":    secilenProjeId,
  "sifre":       sifreInput,   // ← EKLE
};
```

### 3.3. Yanıt işleme

```dart
if (response.statusCode == 200 && body["ok"] == true) {
  // Eşleşme başarılı — ana ekrana geç
}
else if (response.statusCode == 401 && body["sifre_hatali"] == true) {
  // Toast/Dialog: "Şifre hatalı, tekrar deneyin"
  // İsim listesine döndürme — kullanıcı aynı isimle tekrar deneyebilir
}
else if (response.statusCode == 429 && body["kilitli"] == true) {
  // Toast: "Çok fazla yanlış deneme. ${body["kalan_sn"]} saniye sonra tekrar deneyin."
  // İsim listesine geri dön (veya başka bir ekran)
}
else {
  // Diğer hatalar — mevcut hata gösterimi
}
```

### 3.4. UX detayları

- **Şifre alanı:** Boş gönderme. Mobil tarafta "şifre boş olamaz" validation'ı.
- **Kilit süresi:** 429 gelince kullanıcıya kalan süreyi göster (1-2 sn'de bir azalan sayaç opsiyonel).
- **Şifre unutma:** Bu akışta şifre sıfırlama yok. Personel TA'ya başvurur. Mobil UI'da **"Şifreni mi unuttun? Firma yöneticine başvur"** linki gösterilebilir.

---

## 4. Geçiş planı (Soft rollout)

Backend şu anda `sifre` göndermeyen (eski sürüm) mobil isteklerini **hâlâ kabul ediyor**. Bu sayede:

1. Siz mobil güncellemesini hazırlayıp yayına aldığınızda eski sürüm kullanıcıları kırılmıyor.
2. Mobil güncellemesi yayında kalıcı olunca bize haber verin.
3. Biz backend'de `sifre`'yi **zorunlu** yapıp deploy alırız → artık eski mobil sürümler register yapamaz, güncelleme şart olur.

**Zorunlu hale geldikten sonra** eski sürümlerde register yapılmak istenirse 400 Bad Request dönecek. `version` endpoint'i ile force update prompt'u zaten var — aynı akış kullanılabilir.

---

## 5. Bize iletmeniz gerekenler

- [ ] Mobil güncelleme yayına alındığında → tarihi bildirin, backend tarafında `sifre` zorunlu hale getirelim.
- [ ] Minimum mobil sürüm numarası (eski sürümlere "güncelle" prompt'u için) → `/api/app/version`'a yazılacak.
- [ ] Eğer farklı bir endpoint tasarımı tercih ederseniz (örn. ayrı `/api/app/sifre-dogrula` endpoint'i → token → register) söyleyin, ona göre ayarlarız. Mevcut tasarım tek çağrıda hallediyor, basit ve yeterli.

---

## 6. Test senaryoları

Hem backend hem mobil test edilmeli:

1. ✅ Doğru şifre → başarılı eşleşme
2. ✅ Yanlış şifre → 401, isim listesine dön
3. ✅ 5 yanlış → 429, 15 dk kilit (aynı cihazda)
4. ✅ Kilit bittikten sonra tekrar giriş → çalışmalı
5. ✅ Eski mobil sürüm (sifre yok) → şu an çalışıyor (soft rollout), hard rollout sonrası 400 dönecek
6. ✅ Şifresi olmayan kullanıcı (auth'ta yok) → 500 "Kullanıcı kimlik bilgileri alınamadı" (TA'nın user oluştururken şifre atamış olması şart)

---

## 7. Soru/iletişim

Bu nottaki mantığa itirazınız veya daha iyi bir tasarım öneriniz varsa söyleyin, açıkız. Özellikle **UX akışı** (şifre ekranı layout'u, hata mesajları) tamamen sizin elinizde.
