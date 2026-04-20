# MOBİL EKİBE NOT — Ekstra Frekansiyel Görev

**Tarih:** 2026-04-20
**Backend commit:** (bu notun yanındaki commit hash'i)
**Durum:** Backend tarafı hazır — mobil entegrasyon bekleniyor.
**Migration:** Yok (migration-less yaklaşım, `kural_id IS NULL` kullanılıyor).

---

## 1. Neden değişiklik yapıldı?

Frekans kuralı bir lokasyona günde 9 "WC Temizliği" ürettiği halde operatör günde 12 yapmak isteyebilir (müşteri yoğunluğu, kirlenme vs.). Şu an sistem bu ek işleri kayıt altına alamıyor:
- Kural 9 ürettikten sonra 10. satır yok
- Operatör fazla yaptıklarını raporlara yansıtamıyor

Artık operatör **ekstra frekansiyel** görev açıp kaydedebilecek.

## 2. Kurallar

- **Hedef hesaba girmez:** Rapor'daki Hedef alanı hâlâ kural sayısı kadar (örn 9)
- **Tamamlanan'a eklenir:** Ekstra yapılan iş tamamlanana sayılır (örn 12)
- **Başarı oranı %100'ü aşabilir:** 12 / 9 = %115
- **Rapor'da "Frekans Dışı" başlığı altında listelenir**

## 3. Yeni Endpoint

```
POST /api/app/ekstra-frekans
Headers:
  X-Device-Token: <cihaz tokeni>
  Content-Type:   application/json

Body:
{
  "lokasyon_id": "uuid",                  // Zorunlu
  "gorev_tanim": "WC Temizliği",          // Zorunlu (min 3, max 200 char)
  "scan_token":  "<QR veya NFC tokeni>"   // Lokasyonda zorunluysa
}
```

### Alanlar

| Alan | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `lokasyon_id` | UUID | Evet | Ekstra işin yapıldığı lokasyon |
| `gorev_tanim` | string | Evet | Yapılan işin tanımı (frekans kuralındaki tanımla aynı olmalı, örn "WC Temizliği"). Min 3, max 200 char |
| `scan_token` | string | Koşullu | Lokasyonda `tamamlama_qr_zorunlu` aktifse zorunlu — QR verisi veya NFC tokeni |

### Yanıtlar

| Durum | HTTP | Body |
|---|---|---|
| Başarılı | 200 | `{ ok: true, mesaj, gorev_id, tanim, lokasyon_id, tamamlanma_tarihi }` |
| Aktif kural görevi var | **409** | `{ ok: false, error: "... tamamlanmamış frekans görevi var...", code: "AKTIF_KURAL_GOREV_VAR" }` |
| Tanım boş / kısa | 400 | `{ ok: false, code: "GOREV_TANIM_GEREKLI" }` |
| Tanım çok uzun | 400 | `{ ok: false, code: "GOREV_TANIM_UZUN" }` |
| Lokasyon yok | 404 | `{ ok: false, error: "Lokasyon bulunamadı" }` |
| Başka firma lokasyonu | 403 | `{ ok: false, error: "Bu lokasyona erişim yetkiniz yok" }` |
| Lokasyon pasif | 409 | `{ ok: false, code: "LOKASYON_PASIF" }` |
| QR/NFC gerekli ama gönderilmedi | 403 | `{ ok: false, code: "QR_NFC_ZORUNLU" }` |
| QR/NFC uyuşmuyor | 403 | `{ ok: false, code: "QR_NFC_ESLESMEDI" }` |
| Token geçersiz | 401 | `{ ok: false, error: "Geçersiz cihaz token" }` |
| Kullanıcı pasif | 403 | `{ ok: false, code: "USER_PASIF" }` |

## 4. Mobil UX akışı

1. **QR/NFC okutma** → `GET /api/qr/{token}` veya `GET /api/nfc/{token}`
2. Response içinde artık `bugun_tamamlananlar` alanı geliyor (2026-04-20 eklendi):
   ```json
   {
     "ok": true,
     "lokasyon": {...},
     "tasks": [...],
     "bugun_tamamlananlar": [
       { "tanim": "WC Temizliği", "adet": 9 },
       { "tanim": "Çöp Boşaltma", "adet": 3 }
     ]
   }
   ```
   - Bugün (TR takvim günü 00:00 itibariyle) o lokasyonda tamamlanmış **kural-tabanlı** (`kural_id NOT NULL`) görevlerin distinct tanımları + adetleri
   - `canli_gorevler` + `canli_gorevler_arsiv` birleşik taranır
   - `adet DESC` sıralı
   - Hiç tamamlanan yoksa boş array: `[]`
3. Backend'in dönüşüne göre:
   - Aktif kural görevi varsa (`tasks` dolu) → mevcut UI (başlat/tamamla butonları)
   - Yoksa ve `bugun_tamamlananlar.length > 0` → **"Ekstra Görev Yap"** butonu göster
   - Yoksa ve `bugun_tamamlananlar` boşsa → buton gösterme (hangi tanım seçileceği belirsiz)
4. Butona basıldığında modal aç:
   - **Dropdown:** `bugun_tamamlananlar` öğelerini "WC Temizliği (9 kez)" formatında listele
   - Seçim zorunlu — operatör serbest yazmaz (yazım farklılığı raporu bozar)
   - "Vazgeç" / "Kaydet" butonları
5. "Kaydet" → `POST /api/app/ekstra-frekans` body `{ lokasyon_id, gorev_tanim: <seçilen tanım>, scan_token }`
6. **Başarı yanıtı** → toast "Ekstra görev kaydedildi" + QR ekranını yenile (bugun_tamamlananlar güncellensin)
7. `AKTIF_KURAL_GOREV_VAR` hatası → uyarı göster ("Önce mevcut görevinizi tamamlayın"), modal kapansın

## 5. "Ekstra butonu" gösterim kuralı

- Aktif kural görevi VARSA → butonu gösterme
- Aktif kural görevi YOKSA → butonu göster
- QR/NFC zorunluysa → modal'da açıklayıcı mesaj ("QR okutmuştunuz, bu bilgi backend'e gönderilecek")

## 6. Backend tarafında yapılanlar

- Yeni endpoint: [app/api/app/ekstra-frekans/route.ts](../app/api/app/ekstra-frekans/route.ts)
- `canli_gorevler` tablosuna `kural_id=NULL, durum='TAMAMLANDI'` ile anlık kayıt atılır
- Audit log: `tip='ekstra_frekans'`, `detay={ gorev_id, lokasyon_id, tanim, kanal:'MOBIL' }`
- Genel Rapor:
  - Hedef sayısı sadece `kural_id IS NOT NULL` üzerinden
  - Tamamlanan = kural tamamlanan + ekstra tamamlanan (başarı oranını artırır)
  - "Frekans Dışı Çalışmalar (Ekstra Frekansiyel)" bölümünde listelenir
  - Excel export'unda "EKSTRA" kolonu grup metrik tablosunda yer alır

## 7. Test senaryoları

| # | Senaryo | Beklenen |
|---|---|---|
| 1 | Lokasyonda aktif kural görevi YOK, tanım="WC Temizliği", geçerli QR | 200, gorev_id döner, raporda "Frekans Dışı"da görünür, başarı %>100 |
| 2 | Lokasyonda ACIK kural görevi var | 409 AKTIF_KURAL_GOREV_VAR |
| 3 | gorev_tanim boş | 400 GOREV_TANIM_GEREKLI |
| 4 | gorev_tanim 250 karakter | 400 GOREV_TANIM_UZUN |
| 5 | QR zorunlu lokasyon + scan_token yok | 403 QR_NFC_ZORUNLU |
| 6 | QR yanlış token | 403 QR_NFC_ESLESMEDI |
| 7 | Başka firmanın lokasyonu | 403 |
| 8 | Pasif kullanıcı | 403 USER_PASIF |

## 8. İlişkili dokümanlar

- [MOBIL_EKIBE_GOREV_IPTAL.md](MOBIL_EKIBE_GOREV_IPTAL.md) — Manuel görev iptali (benzer UX desen)
- [ROLLBACK_EKSTRA_FREKANS.md](ROLLBACK_EKSTRA_FREKANS.md) — Geri yükleme noktası ve rollback talimatları
