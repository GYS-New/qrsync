# MOBİL EKİBE — Min/Max Süre Validasyonu Backend Tarafı

**Tarih:** 2026-06-03
**Backend commit'leri:** `d473dd7` (min), `a08f6c3` → `6dc32cf` (max, ters çevrildi)
**Hedef mobil sürüm:** iOS 1.0.2, Android v1.0.28 (yayın hedefi 07 Haz 2026)
**Durum:** Backend hazır + Railway deploy edildi
**İlgili spec:** Mobile'ın 02 Haz 2026 spec'i (Backend Min/Max Süre Validasyonu)

> Bu dokümanın amacı: mobile ekibin gönderdiği spec ile **backend tarafında gerçekten yapılanları** yan yana koymak. Bazı yerlerde **spec ile sapma** var — aşağıda işaretli.

---

## 1. Özet — spec'e uyum tablosu

| Spec'teki istek | Backend'de yapılan | Durum |
|---|---|---|
| Min süre validasyonu (3.1 madde) | Birebir uygulandı | ✅ **AYNEN** |
| `MIN_SURE_DOLMADI` (HTTP 400) | Aynı code + aynı response field'ları | ✅ **AYNEN** |
| `kalan_sn` field response'ta | Var | ✅ **AYNEN** |
| Audit log: `min_sure_bypass_denemesi` | Var | ✅ **AYNEN** |
| Max süre (3.2-A): 400 + IPTAL | **Sadece cron tarafından IPTAL** — manuel tamamlamada kabul edilir | ⚠️ **SAPMA** |
| `MAX_SURE_ASILDI` (HTTP 400) | **YOK** — manuel tamamlama reddedilmiyor | ⚠️ **SAPMA** |
| Endpoint: `/api/qr/[token]` (action='tamamla') | Mobile teyit ettiği üzere bu endpoint kullanılıyor (NFC de aynısına gidiyor) | ✅ **AYNEN** |
| Atomicity (aynı transaction) | Tek query update — Supabase JS optimistik | ✅ **YAKLAŞIK** |

> 🔴 **Kritik sapma:** Max süre kontrolünde mobil spec'in A seçeneği (manuel = 400 + IPTAL) yerine **manuel = TAMAMLA + cron = IPTAL** yaklaşımı seçildi. Sebep ve detay aşağıda madde 3'te.

---

## 2. Min süre validasyonu — spec ile birebir

### Endpoint
```
POST /api/qr/[token]
Headers: X-Device-Token: <cihaz tokeni>
Body: { taskId, taskType, checklistResults, confirm_scan_token? }
```

(action belirtmeden; default tamamlama akışı.)

### Backend mantığı
- `task.baslatilma_tarihi` boşsa auto-baslat (mevcut davranış)
- Auto-baslat **sonrası** min süre kontrolü çalışır
- `lokasyon.min_sure_dakika`'dan az süre geçmişse → 400 + reddet
- Görevi tamamlamaz, mevcut durumu (ISLEMDE) korur

> 💡 **Mantık nüansı**: Tek-tıkla tamamlama denenirse → auto-baslat tetiklenir → baslatilma=now → gercek_gecen=0 → min süre > 0 ise REDDEDİLİR. Yani mobile'ın "min süre 10 dk, kullanıcı görevi başlatmadan direkt tamamla" senaryosu backend tarafından engellenir.

### Response — başarısız
```json
{
  "ok": false,
  "code": "MIN_SURE_DOLMADI",
  "error": "Minimum süre dolmadı, 9 dakika 47 saniye daha bekleyin.",
  "gercek_gecen_sn": 13,
  "min_gereken_sn": 600,
  "kalan_sn": 587,
  "lokasyon_id": "uuid"
}
```

HTTP **400**.

### Mobile davranışı (spec ile aynı)
- Hata kartı göster: `error` mesajı zaten formatlı
- `kalan_sn` ile countdown timer/UI state senkronu
- Tamamla butonu disabled kalır

### Audit log
- `tip: 'min_sure_bypass_denemesi'`
- `detay: { gorev_id, lokasyon_id, gercek_gecen_sn, min_gereken_sn, kalan_sn, kanal: 'QR' }`
- Atalian/OYAK denetim için "kaç bypass denemesi var" raporu çekilebilir.

---

## 3. Max süre validasyonu — **spec'ten sapma** (manuel = TAMAMLA, cron = IPTAL)

### Spec'in önerisi (A maddesi)
> Manuel tamamlama denenirse 400 + görev otomatik IPTAL (iptal_sebep='Max süre aşımı').

### Backend'in yaptığı
**Farklı bir yaklaşım benimsendi** — kullanıcı niyetine göre ayrım:

| Senaryo | Davranış | Sebep |
|---|---|---|
| Personel max süre dolduktan sonra kendi tamamlıyor (geç de olsa) | **TAMAMLANDI** kalır, backend reddetmez | Sorumlu personel niyetli — kabul edilir, görev kayba gitmez |
| Cron unutulan ISLEMDE görevi yakalıyor (kullanıcı hiç tamamlamamış) | **IPTAL**, `iptal_sebep='Görev Zaman Aşımı'`, `iptal_eden_id=null` (sistem) | Unutulmuş görev — kayıp olarak işaretlenir |

### Cron detayı
- Endpoint: `POST /api/tasks/max-sure-kontrol` (external scheduler tetikliyor, Supabase pg_cron'da değil)
- Düzensiz aralıkla çalışıyor (~30-60dk arası)
- `ISLEMDE` + `baslatilma_tarihi < now - max_sure_dakika*60` koşulundaki görevleri IPTAL'e çekiyor
- Kanal: `MOBIL`
- 10 dk öncesinden FCM uyarı bildirimi gönderiyor (mevcut davranış)

### Mobile için ne değişir
- **`MAX_SURE_ASILDI` response'u backend GÖNDERMEZ.** Mobile bu kodun handler'ını yazmasına gerek yok.
- Mobile wall-clock validasyonu (1.0.28'de mevcut) **client-side** çalışmaya devam edebilir — kullanıcıya görev anında uyarı vermek için iyi UX, ama backend bunu zorlamaz.
- Mobile kullanıcı max süreyi aştıysa tamamla butonu yine de gönderilebilir → backend kabul eder → görev TAMAMLANDI olur.

### Atalian/OYAK denetim açısından
- Manuel aşımlar `tamamlanma_suresi_saniye > max_sure_dakika*60` ile DB'de izlenebilir
- Cron iptalleri raporlarda "Kayıp Frekanslar" → "Görev Zaman Aşımı" sebebiyle görünür
- İptal taksonomisi:
  1. Mobile cancel → IPTAL (kullanıcı sebep yazar)
  2. Web manual cancel → IPTAL (TA/SA sebep yazar)
  3. PD cron → ZAMANI_GECMIS, `iptal_sebep='vardiya bitti'`
  4. **Max süre cron → IPTAL, `iptal_sebep='Görev Zaman Aşımı'` (yeni, bu spec)**

### FCM uyarı bildirimi
Cron süreye 10 dk kala FCM atıyor. Mesaj güncellendi:

```
⏰ Görev Süresi Bitiyor
{Lokasyon} görevinizin süresi dolmak üzere. 10 dakika içinde tamamlamazsanız
sistem görevi otomatik iptal edecektir (sebep: Görev Zaman Aşımı).
```

Eskisi: "...otomatik tamamlanmış olarak işaretleyecektir" (artık geçersiz).

---

## 4. Endpoint kapsamı

Mobile cevabı (2026-06-03):
> Mobile şu an tamamlama için TEK endpoint kullanıyor: `POST /api/qr/[token]` (action belirtmeden, body'de taskId + taskType + checklistResults + opsiyonel confirm_scan_token). NFC de aynı endpoint'e gidiyor.

**Bu kapsama göre min süre kontrolü sadece `/api/qr/[token]` POST tamamlama dalına eklendi.**

Eklenmediği endpoint'ler ve sebep:

| Endpoint | Min kontrol var mı? | Sebep |
|---|---|---|
| `/api/qr/[token]` POST | ✅ Var | Mobile bunu kullanıyor |
| `/api/nfc/[token]` POST | ❌ Yok | Mobile bunu kullanmıyor (NFC token okutması → /scan?token=... → /api/qr/[token]) |
| `/api/app/gorev-tamamla` POST | ❌ Yok | Sadece oto yıkama, min/max kuralı yok |
| `/api/scan/tamamla` POST | ❌ Yok | Web admin tarafı, yetkilendirilmiş |
| `/api/tasks/max-sure-kontrol` (cron) | — | Süre kontrolünü kendisi yapıyor (max için) |

> ⚠️ İlerde NFC için ayrı bir endpoint kullanılırsa veya başka tamamlama akışları eklenirse helper `lib/tasks/minSureKontrol.ts`'i import edip aynı pattern ile entegre edilebilir.

---

## 5. Akış diyagramı (mobile için referans)

```
┌──────────────────────────────────┐
│ 1. QR/NFC okut                   │
│ POST /api/qr/{token}             │
│ body: { taskId, taskType, ... }  │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────┐
│ Backend sıralı kontroller:       │
│ - Mesai + pasif kontrol           │
│ - Firma/proje uyumu               │
│ - Aktif kural görevi              │
│ - Tanım listesi                   │
│ - Çeklist zorunlu maddeler        │
│ - QR/NFC confirm token            │
│ - ardısık başlatma kontrolü       │
│ - auto-baslat (gerekiyorsa)       │
│ - **MIN SÜRE KONTROL** (yeni)    │
│ - completeTask                   │
└─────────┬────────────┬───────────┘
          │            │
       BAŞARI       BAŞARISIZ
          │            │
          ▼            ▼
   200 OK         400 MIN_SURE_DOLMADI
                  + kalan_sn ile
                    timer için
```

Cron paralel akış:
```
┌──────────────────────────────────┐
│ External scheduler tetikler      │
│ POST /api/tasks/max-sure-kontrol │
└──────────┬───────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────┐
│ Tüm ISLEMDE görevleri tara:                  │
│ - Süreye 10 dk kala → FCM uyarı              │
│ - Süre dolmuş → IPTAL                        │
│   iptal_sebep='Görev Zaman Aşımı'           │
│   iptal_eden_id=null                         │
│   tamamlanma_suresi_saniye=elapsed (iz için) │
└──────────────────────────────────────────────┘
```

---

## 6. Test senaryoları

Mobile'ın spec madde 7'sindeki senaryolarla karşılaştırma:

| # | Senaryo | Spec beklentisi | Backend gerçeği |
|---|---|---|---|
| 1 | Min 10dk, görev 3dk'da tamamla | 400 `MIN_SURE_DOLMADI`, kalan_sn=420 | ✅ Aynı |
| 2 | Min 10dk, görev 10dk 1sn'de tamamla | 200 OK | ✅ Aynı |
| 3 | Max 120dk, görev 119dk'da tamamla | 200 OK | ✅ Aynı |
| 4 | Max 120dk, görev 121dk'da tamamla | 400 `MAX_SURE_ASILDI`, görev IPTAL | ⚠️ **FARKLI**: 200 OK, görev TAMAMLANDI (manuel niyet kabul) |
| 5 | Mobile bypass → direkt API çağrı | Reddet | ✅ Min için reddet, max için kabul |
| 6 | Min süre 0 (kural yok) | Kontrol atla, 200 OK | ✅ Aynı |
| 7 | Aynı anda 2 mobile'dan tamamla | İlk 200, ikinci 409 | ✅ Aynı (`Görev zaten X durumda`) |

### Backend'in eklediği ekstra senaryolar

| # | Senaryo | Davranış |
|---|---|---|
| 8 | Cron çalışırken görev hala ISLEMDE + max süre dolmuş | IPTAL'e çek (`Görev Zaman Aşımı`) |
| 9 | Cron çalışırken görev TAMAMLANDI olmuş (manuel) | Dokunma (cron sadece ISLEMDE arar) |
| 10 | Max süre 120dk, kullanıcı 119dk + cron araya girdi | Race: önce gelen kazanır. Cron önce: IPTAL. Kullanıcı önce: TAMAMLA. |
| 11 | Tek-tıkla tamamla (başlatmadan) + min süre 5dk | Auto-baslat çalışır → min kontrol REDDEDER (kullanıcı 5dk beklemeli) |

---

## 7. Mobile için aksiyon listesi

### Yapılması gereken
- [x] **`MIN_SURE_DOLMADI` (HTTP 400) handler'ı ekle** — error mesajı + kalan_sn ile UI countdown
- [x] **Min süre kontrolünün backend tarafından geldiğinde** UI'yi senkronla (state'i backend kaynağıyla update et)

### Yapılmaması gereken / değişen
- [ ] **`MAX_SURE_ASILDI` handler'ı YAZMA** — backend bunu göndermiyor (spec'ten sapma, mobile'ın bu kodu beklemesine gerek yok)
- [ ] Mobile wall-clock max validasyonu **isteğe bağlı** — backend zorlamıyor, ama client-side UX için iyi
- [ ] "Max aşıldı, görev iptal edildi" toast/yönlendirme **gerekmiyor** — tamamlama başarılı olur, ana sayfaya dönüş normal akış

### Test öncesi haberdar olunması gereken
- Atalian raporunda "Görev Zaman Aşımı" sebebiyle iptaller görünecek (cron çıkışı)
- Manuel aşımlar TAMAMLANDI olarak kalacak; raporda `tamamlanma_suresi > max` ile filtrelenebilir

---

## 8. Hata kodları özeti

| Code | HTTP | Anlamı | Mobile davranışı |
|---|---|---|---|
| `MIN_SURE_DOLMADI` | 400 | Min süre dolmadan tamamlama denendi | Hata kartı + kalan_sn ile countdown |
| `MAX_SURE_ASILDI` | — | **GÖNDERILMIYOR** | — |
| `ARDISIK_BEKLEME` | 429 | Ardışık başlatma süresi dolmadı | Süreyi göster, retry button |
| `DEVAM_EDEN_GOREV` | 409 | Aktif başka ISLEMDE görev var | "Önce mevcut görevinizi tamamlayın" |
| `QR_NFC_ZORUNLU` | 403 | confirm_scan_token eksik | "QR/NFC tekrar okutun" |
| `QR_NFC_ESLESMEDI` | 403 | Token uyuşmadı | "Yanlış kod" |
| `USER_PASIF` | 403 | Kullanıcı pasifleştirilmiş | Çıkış |

---

## 9. Audit log tipleri

| Tip | Ne zaman yazılır | Detay |
|---|---|---|
| `min_sure_bypass_denemesi` | Min süre dolmadan tamamla denemesi her seferde | `{ gorev_id, lokasyon_id, gercek_gecen_sn, min_gereken_sn, kalan_sn, kanal: 'QR' }` |
| `cron_max_sure` | Her cron tetiklemesinde (≥1 sonuç varsa) | `{ uyari_gonderildi, gorevler_otomatik_iptal, canli_gorevler_otomatik_iptal }` |

> Field adları **değişti** (eski: `*_otomatik_tamamla`). Eski audit kayıtları geçmişte kalmış davranışı yansıtır.

---

## 10. Geçiş stratejisi

| Aşama | Durum |
|---|---|
| Backend min süre validasyonu | ✅ Deploy edildi (`d473dd7`) |
| Backend max süre cron → IPTAL | ✅ Deploy edildi (`6dc32cf`) |
| Mobile 1.0.28 build hazırlık | Mobile ekibi sürecinde |
| Mobile `MIN_SURE_DOLMADI` handler | Bu spec'e göre yapılmalı |
| Mobile `MAX_SURE_ASILDI` handler | **Yazmaya gerek yok** (spec'ten sapma) |
| iOS 1.0.2 + Android 1.0.28 yayın | 07 Haz 2026 hedef |

> ⚠️ **Geri uyumluluk:** v1.0.27 ve öncesi APK'lar `MIN_SURE_DOLMADI` kodunu tanımıyor, generic hata gösterir. Bu kabul edilebilir — kullanıcı "tekrar deneyin" der. Min süre dolduktan sonra zaten 200 alacak.

---

## 11. SSS

**S: Neden max aşımında IPTAL değil de TAMAMLA?**
C: Personel niyetli — sonunda işi yapmış (geç de olsa). IPTAL = kayıp, müşteriye fatura kesilmez. Atalian'a fatura için TAMAMLA olmalı. Cron tarafından IPTAL, sadece "personel hiç tamamlamamış" senaryosunda — yani gerçekten unutulmuş.

**S: Mobile spec'in talebi vs backend gerçeği farklı, neye uyalım?**
C: **Backend gerçeği geçerli** — bu doküman backend davranışını anlatır. Mobile spec'in max kısmı (MAX_SURE_ASILDI gönderimi) bilmiyor olmasında sakınca yok, ama UX'ta "max aşıldı, görev iptal" hatasını göstermesin (yanlış olur).

**S: Manuel aşımı backend'in zorlamak istemediğini biliyoruz. Peki Atalian denetim raporunda nasıl ayırt edilir?**
C: 3 katmanlı:
- DB'de `tamamlanma_suresi_saniye > lokasyon.max_sure_dakika*60` filtresi ile "aşımlı tamamlamalar"
- DB'de `durum=IPTAL + iptal_sebep='Görev Zaman Aşımı'` ile "cron iptalleri"
- Audit log `cron_max_sure` ile cron çalışma geçmişi

**S: Cron interval düzensiz, bu sorun mu?**
C: Spec madde 8 ile uyumlu değil ama mevcut external scheduler düzensiz tetikliyor. İhtiyaç olursa Supabase pg_cron'a alıp 5dk sabit yapabiliriz. Şimdilik max sapma 60dk → yine iptal edilir, sadece geç.

**S: Cihaz saati yanlışsa ne olur?**
C: Backend kendi server zamanını kullanır (`new Date()`). Mobile saati önemsiz. NTP/saat hatası mobil tarafında client-side UX'ı bozar (kronometre yanlış), ama backend kararı doğru kalır.

---

## 12. Backend referans dosyaları

- [lib/tasks/minSureKontrol.ts](../lib/tasks/minSureKontrol.ts) — min süre helper
- [app/api/qr/[token]/route.ts](../app/api/qr/[token]/route.ts) — entegrasyon + audit log
- [app/api/tasks/max-sure-kontrol/route.ts](../app/api/tasks/max-sure-kontrol/route.ts) — cron, otomatikIptal davranışı
- [lib/audit/log.ts](../lib/audit/log.ts) — audit log helper

## 13. Commit referansları

| Commit | İçerik |
|---|---|
| `d473dd7` | feat(min-sure-validasyon): Backend min süre kontrolü (qr endpoint) |
| `a08f6c3` | feat(max-sure-validasyon): Max aşımında IPTAL (geri alındı bir sonraki commit'te) |
| `6dc32cf` | feat(max-sure): davranış ters çevrildi — manuel=TAMAMLA, cron=IPTAL |

---

## 14. İlişkili dokümanlar

- [MOBIL_EKIBE_EKSTRA_FREKANS_V2.md](MOBIL_EKIBE_EKSTRA_FREKANS_V2.md) — Ekstra görev V2 (paralel iş)
- [MOBIL_EKIBE_EKSTRA_FREKANS.md](MOBIL_EKIBE_EKSTRA_FREKANS.md) — V1 eski tek-POST akışı

---

## 15. İletişim

Bu dokümanın amacı backend davranışını yansıtmak — mobil spec ile sapma noktaları net işaretli.

Eğer mobile tarafı **bu sapmaları kabul edemiyorsa** (özellikle max aşımı için spec'in literal A önerisini istiyorsanız), web ekibiyle koordinasyon kurun. Aksi halde backend bu davranışta kalır.

Bu doküman **backend davranışı yansıtır** — UI/UX kararları farklıysa **doküman doğrudur**, mobile'ı buna göre uyarlayın.
