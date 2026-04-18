# MOBİL EKİBE NOT — Firma Kodu ile Çoklu Firma Desteği

**Tarih:** 2026-04-19
**Durum:** Backend hazır, soft rollout (eski akış da çalışıyor).

---

## 1. Neden bu değişiklik?

Her firma için ayrı APK üretmek yerine **tek APK** ile tüm firmalara hizmet vermek istiyoruz. Her firma kendi **6 karakter** mobil giriş kodunu personeline dağıtır; kullanıcı mobil uygulamayı açarken önce bu kodu girer, sonra proje/isim/şifre akışına devam eder.

**Örnek kodlar (gerçek):** `47D3EK` (ATALİAN), `X5T6SB` (EKOL).

Karakter seti `I, O, 0, 1` hariç 32 karakter — görsel karışıklık yok.

---

## 2. Yeni akış

```
1. [Firma Kodu]  → kullanıcı yazar: "47D3EK"
       ↓ POST /api/app/firma-kod-cozumle
       ↓ response: { firma_id, firma_adi, mod }
2. [Proje Seç]   → GET /api/app/personel?firma_id=...&proje=...
       ↓
3. [İsim Seç]
       ↓
4. [Şifre]       → POST /api/app/register (firma_id + sifre)
       ↓
✓ Cihaz eşleşti
```

---

## 3. Yeni endpoint

### `POST /api/app/firma-kod-cozumle`

**Request body:**
```json
{ "kod": "47D3EK", "device_id": "opsiyonel" }
```

**Başarılı yanıt:**
```json
{ "ok": true, "firma_id": "uuid", "firma_adi": "ATALİAN", "mod": "QR" }
```

**Hata yanıtları:**
| Durum | HTTP | Body |
|---|---|---|
| Kod eksik/yanlış uzunluk | 400 | `{ ok: false, error: "..." }` |
| Kod bulunamadı | 404 | `{ ok: false, error: "Geçersiz firma kodu" }` |
| Firma aktif değil | 403 | `{ ok: false, error: "Firma aktif değil" }` |
| 5 yanlış → kilit | 429 | `{ ok: false, kilitli: true, kalan_sn: 900 }` |

**Brute-force koruması:** Aynı `device_id` (yoksa IP) için 5 yanlış denemede 15 dk kilit.

---

## 4. Mevcut endpoint'lerde değişiklik

### `GET /api/app/personel`

Artık iki yol kabul ediyor:

**Yeni (tercih edilen):**
```
GET /api/app/personel?firma_id=UUID&proje=UUID
```

**Eski (geriye uyumluluk):**
```
GET /api/app/personel?firma=TOKEN&proje=UUID
```

İkisinden biri gönderilmezse 400.

### `POST /api/app/register`

Yeni alan: `firma_id` (eski `firma_token` da kabul ediliyor).

**Yeni payload:**
```json
{
  "firma_id": "uuid",
  "device_id": "...",
  "user_id": "...",
  "isim_soyisim": "...",
  "proje_id": "...",
  "sifre": "kullanıcı şifresi"
}
```

Eski `firma_token` alanı da hâlâ çalışır, ama yeni entegrasyonda `firma_id` kullan.

---

## 5. Mobil tarafın yapacakları

1. **İlk ekran: Firma Kodu** — tek input (max 6 karakter, büyük harf olarak kabul et, otomatik `toUpperCase`).
2. `firma-kod-cozumle` çağır. 200 → `firma_id`'yi local storage'a yaz, firma_adi'ni başlık olarak göster.
3. Sonraki çağrılarda (`personel`, `register`) `firma_id` kullan.
4. Hata senaryoları:
   - 404: "Firma kodu geçersiz, doğru yazdığınızdan emin olun"
   - 429: "Çok fazla yanlış deneme. N saniye sonra tekrar deneyin"
   - 403: "Firma şu anda aktif değil, yöneticinize başvurun"
5. **Değiştir/Çıkış:** Kullanıcı farklı firma seçmek isterse local'deki `firma_id`'yi silip ilk ekrana döndürme seçeneği olsun.

---

## 6. Geçiş planı (soft rollout)

Backend şu an hem eski (`firma_token`) hem yeni (`firma_id`) akışı destekliyor. Eski APK'lar kırılmadı.

Mobil yeni sürüm yayına alınınca bize haber verin. `app_download_links` tablosunu inaktif yaparak eski token'ları devre dışı bırakabiliriz — ama bu isteğe bağlı.

---

## 7. TA tarafı

- SA firma detayından → "Mobil Firma Kodu" bölümü (kod + Kopyala + Yenile).
- TA kendi Firma Ayarları sayfasından aynı paneli görür.
- Yenile butonu: tek tıkla yeni kod üretir, eski kod geçersiz olur.

---

## 8. Dikkat

- Kod yenilenirse **bağlı mobil cihazlar etkilenmez** (device_tokens eşleşmesi kendi başına, kod sadece ilk bağlamada kullanılır). Sadece YENİ eşleşmeler eski kodu çalıştıramaz.
- Personel şifresi zaten zorunlu (önceki değişikliklerde eklendi). Kod + şifre = iki katman güvenlik.

---

## 9. Test için

ATALİAN firması için kod `47D3EK`:
```
curl -X POST https://app.iogys.com.tr/api/app/firma-kod-cozumle \
  -H "Content-Type: application/json" \
  -d '{"kod":"47D3EK"}'
```

Dönen `firma_id` ile `/api/app/personel?firma_id=...` çağrılır.

---

Sorularınız olursa söyleyin.
