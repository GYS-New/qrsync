# Mobil — Çevrimdışı (Offline) Senkron Akışı

Backend, mobil uygulamanın çevrimdışı kuyruğundan (bekleyen_islemler / yerel queue) sonradan gelen
işlemleri **ayırt edebilecek** şekilde güncellendi. Bu doküman, offline senkron sırasında hangi alanları
nasıl göndermeniz gerektiğini açıklar.

> **Geriye dönük uyumluluk:** Aşağıdaki alanlar **tamamen opsiyoneldir**. Göndermediğiniz sürece eski
> davranış aynen devam eder (tamamlanma/iptal zamanı = sunucunun "şimdi" değeri, kanal = `MOBIL`).
> Mevcut mobil sürümler etkilenmez.

---

## 1. Kapsanan Endpoint'ler

Aşağıdaki endpoint'lerin body'sine `offline` + `yerel_zaman` alanları eklenebilir:

| Endpoint | Amaç |
|---|---|
| `POST /api/app/gorev-tamamla` | Frekans/spesifik görev tamamlama (mobil direkt endpoint) |
| `POST /api/app/gorev-iptal` | Manuel görev iptali (sebep ile) |
| `POST /api/app/ekstra-frekans` | Ekstra (kural dışı) frekansiyel görev |
| `POST /api/app/mesai-okut` | Mesai giriş/çıkış QR/NFC okutma |
| `POST /api/qr/{token}` | QR üzerinden görev başlat/tamamla (scan akışı — mobil de kullanır) |
| `POST /api/nfc/{token}` | NFC üzerinden görev başlat/tamamla (scan akışı — mobil de kullanır) |

**Mobil tespiti:** `X-Device-Token` header varsa istek mobil kabul edilir. `qr/{token}` ve
`nfc/{token}` web'den de çağrılır; header yoksa `kanal = 'QR'/'NFC'` kalır (mevcut davranış).
Mobilden `offline: true` gelirse `kanal = 'MOBIL_OFFLINE'`, sadece header varsa `kanal = 'MOBIL'`.

---

## 2. Body Şeması — Eklenen Alanlar

```jsonc
{
  // ... mevcut alanlar (gorev_id, iptal_sebep, lokasyon_id, vs.)
  "offline": true,                                      // bool — çevrimdışı kuyruktan geliyorsa true
  "yerel_zaman": "2026-04-21T09:17:43+03:00",           // ISO 8601 — eylemin cihazdaki gerçek anı
  "baslatilma_yerel_zaman": "2026-04-21T09:05:12+03:00" // ISO 8601 — görevin cihazda başlatıldığı an (opsiyonel)
}
```

### Alan Detayları

- **`offline`** (bool, opsiyonel)
  - `true`: Bu kayıt çevrimdışı yapıldı, sonradan senkron ediliyor. Backend `son_tamamlama_kanali`
    alanını `'MOBIL_OFFLINE'` olarak işaretler.
  - `false` / gönderilmedi: Kanal `'MOBIL'` (mevcut davranış).

- **`yerel_zaman`** (string, opsiyonel ama `offline=true` iken şiddetle tavsiye edilir)
  - Format: ISO 8601 (tercihen offset ile, örn. `+03:00`). `Date.toISOString()` çıktısı da kabul edilir.
  - Bu alan **cihazda görev tamamlandığı/iptal edildiği gerçek an**'dır.
  - Validasyon (geçersizse sessizce yok sayılır, `nowIso` kullanılır — hata dönmez):
    - ✗ Gelecek > 5 dakika → reddedilir (cihaz saati yanlış)
    - ✗ Geçmiş > 7 gün → reddedilir (çok eski kuyruk)
    - ✓ Aralıkta → `durum_degisim_tarihi`, `tamamlanma_tarihi` (veya `iptal` için tarih) olarak yazılır
  - Önemli: `olusturma_tarihi` her zaman sunucu zamanı kalır (DB insert anı). Sadece **eylem
    zamanları** (tamamlanma, iptal, başlama) yerel zaman'a çevrilir.

- **`baslatilma_yerel_zaman`** (string, opsiyonel — hem online hem offline akışlarda gönderilebilir)
  - Format + validasyon: `yerel_zaman` ile aynı kurallar.
  - Kullanımı: Mobil lokal QR ile görevi başlattığında cihazda storage'a yazdığı zamandır.
  - Backend davranışı:
    - `gorev.baslatilma_tarihi` **DB'de dolu ise** → bu alan **yok sayılır**. Sunucunun bildiği
      başlatma zamanı her zaman öncelikli (web kullanıcısı veya çevrimiçi mobil üzerinden yazılmış).
    - `gorev.baslatilma_tarihi` **NULL ise** ve `baslatilma_yerel_zaman` geçerliyse →
      `baslatilma_tarihi` DB'ye yazılır + `baslatan_kullanici_id = userId` set edilir.
      `tamamlanma_suresi_saniye` artık bu yerel başlatma zamanından hesaplanır.
    - Ardışık başlatma kontrolü (ARDISIK_BEKLEME) yerel zamanla senkron edilen geçmiş başlatmada
      atlanır — senkron anında konrol etmek anlamsız; çakışma zaten offline'da oluşmaz.
  - Kapsanan endpoint'ler: `gorev-tamamla`, `qr/[token]` (`action=basla` + tamamlama yolları).

---

## 3. Kullanım Senaryoları

### Senaryo A — Normal (online) akış
```json
POST /api/app/gorev-tamamla
{ "gorev_id": "...", "gorev_tipi": "canli_gorevler" }
```
Kanal: `MOBIL`. Tamamlanma zamanı: sunucunun o anki saati. **Hiçbir değişiklik yok.**

### Senaryo B — Çevrimdışı yapılmış, senkronda gönderiliyor
```json
POST /api/app/gorev-tamamla
{
  "gorev_id": "...",
  "gorev_tipi": "canli_gorevler",
  "offline": true,
  "yerel_zaman": "2026-04-21T08:52:10+03:00"
}
```
Kanal: `MOBIL_OFFLINE`. Tamamlanma zamanı: `2026-04-21T08:52:10+03:00` (UTC'ye çevrilir).

### Senaryo C — Offline=true ama yerel_zaman yok/geçersiz
```json
POST /api/app/gorev-iptal
{ "gorev_id": "...", "iptal_sebep": "…", "offline": true }
```
Kanal: `MOBIL_OFFLINE` (işaretleme yine yapılır). Tamamlanma/iptal zamanı: sunucunun o anki saati.

### Senaryo D — Mesai okut (giriş/çıkış) çevrimdışı
```json
POST /api/app/mesai-okut
{
  "token": "…",
  "offline": true,
  "yerel_zaman": "2026-04-21T08:03:22+03:00"
}
```
- `giris_saati` / `cikis_saati` → `yerel_zaman` (geçerliyse).
- `kayit_tarihi` → `yerel_zaman`'ın TR günü (Europe/Istanbul). Bu, TR 02:00'de okutulup TR 08:00'de
  senkron edilen kaydın **doğru güne** düşmesini sağlar (aksi halde +6 saat sapmayla yanlış güne yazılırdı).
- `giris_tipi` / `cikis_tipi` → `'MOBIL_OFFLINE'`.
- Açık kayıt çakışması (`zaten_acik`) kontrolü de `yerel_zaman`'ın TR günü üzerinden yapılır.

### Senaryo E — QR/NFC scan (görev başlatma + tamamlama) çevrimdışı

Bu akışta mobil cihaz vardiya-paketi'ni çoktan indirmiş olmalı (lokal IndexedDB'de görevler
ve lokasyon tokenları var). Kullanıcı çevrimdışıyken QR/NFC okuttuğunda mobil kendi kendine
start + complete adımlarını yerelde yürütür, senkron anında ikisini birden gönderir.

**Mobil akış (önerilen):**

1. **Scan (offline):** Kullanıcı QR/NFC okutur.
   - Mobil, token'ı **lokal IndexedDB'deki `lokasyonlar` tablosundan** arar (QR zaten kapsanmış
     olmalı — vardiya-paketi yetkili lokasyonları indirdi).
   - Token eşleşince lokasyonun aktif görevlerini lokalden çeker.

2. **Görev başlat (offline):** Kullanıcı bir görev seçer.
   - Mobil **cihaza `baslatilma_${gorev.id}` storage key'i** yazar (unix ms).
   - Görev lokalde `durum = ISLEMDE` olarak işaretlenir (UI için).
   - **Backend çağrısı yapılmaz** — kuyruğa `gorev-basladi` satırı da eklenmez; tek seferlik
     sync'te start + complete birlikte gider.

3. **Çeklist doldurma (offline):** Kullanıcı maddeleri yanıtlar. Fotoğraflar cihaz depoda tutulur.

4. **Görev tamamla (offline):** Kullanıcı "tamamla"ya basar.
   - `baslatilma_${gorev.id}` okunur, ISO'ya çevrilir → `baslatilma_yerel_zaman`
   - `Date.now()` ISO → `yerel_zaman`
   - Queue'ya eklenir (aşağıdaki şema ile).

5. **Sync (online):** Kuyruktaki kayıt şu body ile gönderilir:
   ```json
   POST /api/qr/{token}       // veya /nfc/{token} — orijinal scan'a göre
   Headers: X-Device-Token: ...
   Body: {
     "taskId": "...",
     "taskType": "canli_gorevler",
     "checklistResults": [...],
     "offline": true,
     "yerel_zaman": "2026-04-21T09:17:43.000Z",
     "baslatilma_yerel_zaman": "2026-04-21T09:05:12.000Z"
   }
   ```
   Backend:
   - `completionChannel = 'MOBIL_OFFLINE'` (çünkü offline:true + device-token var)
   - `baslatilma_tarihi` DB'de NULL ise `baslatilma_yerel_zaman` yazılır, aksi halde yok sayılır
   - `tamamlanma_tarihi` = `yerel_zaman`
   - `son_tamamlama_kanali` = `'MOBIL_OFFLINE'`
   - `tamamlanma_suresi_saniye` = `yerel_zaman - baslatilma_tarihi`
   - `checklist_sonuc_basliklari.kanal` = `'MOBIL_OFFLINE'`
   - Ardışık başlatma kontrolü atlanır (geçmişteki başlatma için kontrol anlamsız)

**YANLIŞ akış (önceki gözlem, düzeltilmeli):**
- ❌ Offline scan → görev direkt `TAMAMLANDI`'ya çekiliyor (start atlanıyor, süre NULL)
- ❌ Lokal IndexedDB sorgulanmıyor, cihaz online sanıp API çağırıyor → fail → boşa düşüyor
- ✅ Doğrusu: yukarıdaki 5 adımlı akış; backend hazır, mobilin lokal lookup + start+complete
  ikilisini yerelde yürütmesi yeterli.

---

## 4. Raporlama Tarafında Ne Görünür?

- **Kanal kolonu:** `son_tamamlama_kanali` alanı şu değerleri taşıyabilir:
  - `'MOBIL'` — online mobil tamamlama (gorev-tamamla veya mobilden qr/nfc scan)
  - `'MOBIL_OFFLINE'` — çevrimdışı yapılmış, sonradan senkron edilmiş
  - `'QR'` — web üzerinden QR scan
  - `'NFC'` — web üzerinden NFC scan
- **Zaman damgaları:** Raporlar `tamamlanma_tarihi` / `durum_degisim_tarihi` kullanıyor; offline
  senkronda artık bunlar eylemin **gerçek zamanı** olur (sistemin 3 saat sonra gelen senkron anı değil).
- **Süre hesaplamaları:** `gorev-tamamla` içinde `tamamlanma_suresi_saniye` artık gerçek
  `baslatilma_tarihi → yerel_zaman` farkıyla hesaplanır (eğer yerel zaman geçerliyse).

---

## 5. Implementasyon Notları — Mobil Tarafı

Önerilen client kod (pseudocode):
```ts
async function offlineKuyrukGonder(kayit: OfflineRecord) {
  await fetch(API + kayit.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Device-Token': token },
    body: JSON.stringify({
      ...kayit.body,
      offline: true,
      yerel_zaman: kayit.yapildigiAn.toISOString(), // eylemin gerçek anı
    }),
  })
}
```

**Önerilen kayıt yapısı (yerel DB / AsyncStorage):**
```ts
interface OfflineRecord {
  endpoint:
    | '/api/app/gorev-tamamla'
    | '/api/app/gorev-iptal'
    | '/api/app/ekstra-frekans'
    | '/api/app/mesai-okut'
  body: Record<string, any>
  yapildigiAn: Date  // eylemin gerçek anı — gönderime kadar korunmalı
}
```

**Kritik:** `yapildigiAn` alanını kuyruğa eklerken **bir kez** set edin (eylem yapıldığında). Senkron
anında `new Date()` kullanmayın — yoksa "gerçek zaman" bilgisi kaybolur.

---

## 6. Soru & Test

- Backend hazır ve canlıda (opsiyonel alanlar, geriye uyumlu).
- Test önerisi: Flight mode'da görev tamamla → internet aç → senkron gönder → raporlarda:
  - Kanal kolonu `MOBIL_OFFLINE` göstermeli
  - Tamamlanma zamanı eylemin yapıldığı an olmalı (senkron anı değil)

Soru/hata için: backend tarafıyla iletişim.
