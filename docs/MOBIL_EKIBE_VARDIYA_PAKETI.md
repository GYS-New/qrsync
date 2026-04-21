# Mobil — Vardiya Paketi (Offline Çalışma Modu)

> **Durum:** Backend hazır (`GET /api/app/vardiya-paketi`). Mobil tarafı henüz bu akışı desteklemiyor.
> Bu doküman yeni eklenen endpoint'in **neden** eklendiğini, **ne döndürdüğünü** ve mobil tarafında
> **nasıl kullanılması gerektiğini** açıklar.

---

## 1. NEDEN bu endpoint var?

### Bugünkü durum (mobil)
Mobil uygulama şu an **tamamen online** çalışıyor. Her işlem (görev listesi, QR doğrulama, süre
kontrolü, çeklist, görev tamamlama) ayrı bir API çağrısı yapıyor — yani her işlem için internet gerekir.

### Sorun
Sahada internet bağlantısı sürekli olmayabilir:
- Bodrum/depo/tüneller → sinyal yok
- Operatör bazlı kesintiler
- Cihaz batarya/ağ problemi

Bugün internet kesildiğinde personel hiçbir görev işleyemiyor. Bu da Oyak Renault gibi 500+ görev
üreten büyük projelerde gün içinde önemli kayıplara neden oluyor.

### Çözüm fikri
Personel **iş başı** yaptığında (mesai-okut) cihaz **tek çağrıda** o vardiyada ihtiyaç
duyacağı tüm veriyi indirir:
- Atanmış açık görevler (spesifik + canlı frekansiyel)
- Yetkili lokasyonların QR/NFC token'ları (offline QR doğrulama için)
- Lokasyonların süre metaları (min/max dakika — offline timer için)
- Çeklist şablonları
- Vardiya tanımı + sunucu zamanı

Sonrasında cihaz **offline kalsa bile** görevi tamamlayabilir, QR/NFC doğrular, süreyi sayar,
çeklisti doldurur. Kayıtları local queue'ya koyar. İnternet geri geldiğinde `offline=true` +
`yerel_zaman` ile gönderir (bu mekanizma zaten hazır — bakınız [MOBIL_EKIBE_OFFLINE_SYNC.md](./MOBIL_EKIBE_OFFLINE_SYNC.md)).

### Neden yeni endpoint — mevcut `gorevlerim` yetmiyor mu?
Hayır. `gorevlerim` sadece görev listesini dönüyor. Offline çalışma için **lokasyon meta verisi +
QR/NFC token'ları + çeklist şablonları + vardiya bilgisi** de gerekiyor. Bunları ayrı ayrı çağırmak
hem trafik üretir hem atomik snapshot alma garantisi vermez. Tek endpoint → tek snapshot → tutarlı.

### Neden sadece "personel takibi aktif" projeler?
Offline akış, vardiya anı (iş başı saati) kavramına dayanır. Veri snapshot'ı bu ana bağlanır.
Personel takibi kapalı projelerde "vardiya başı" yok, dolayısıyla net bir yakalama anı da yok.
Bu projeler **mevcut online akışı** kullanmaya devam eder (bu tam olarak yeni değişiklik istememen
gereken senaryo — zaten bu projelerin durumu bugünkü gibi kalacak).

---

## 2. NE döndürür? (Response Şeması)

**Endpoint:** `GET /api/app/vardiya-paketi`
**Header:** `X-Device-Token: <cihaz token>`
**Method:** GET (body yok)

### Başarılı response (200)

```jsonc
{
  "ok": true,
  "sunucu_zamani": "2026-04-21T06:00:00.000Z",   // cihaz clock drift tespiti için

  "kullanici": {
    "id": "uuid",
    "isim_soyisim": "Ahmet Yılmaz",
    "firma_id": "uuid",
    "proje_id": "uuid"
  },

  "proje": {
    "id": "uuid",
    "ad": "Oyak Renault",
    "personel_takibi_aktif": true               // offline gerekli koşul
  },

  "vardiya": {
    "mesai_kayit_id": "uuid",                    // personel_mesai_kayitlari.id
    "kayit_tarihi": "2026-04-21",                // TR günü (YYYY-MM-DD)
    "giris_saati": "2026-04-21T05:00:00.000Z"    // UTC ISO
  },

  "vardiya_ayarlari": { /* firmalar.tum_vardiya_ayarlari JSONB — vardiya saatleri */ },

  "gorevler": [                                   // atanan spesifik görevler (`gorevler` tablosu)
    {
      "id": "uuid",
      "gorev_tipi": "gorevler",
      "tanim": "…",
      "durum": "ACIK" | "ISLEMDE" | "TAMAMLANDI",
      "olusturma_tarihi": "ISO",
      "baslatilma_tarihi": "ISO" | null,
      "tamamlanma_tarihi": "ISO" | null,
      "lokasyon_id": "uuid",
      "lokasyon": { "id": "uuid", "tanim": "…", "ust_tanim": "…" | null },
      "checklist_sablon_id": "uuid" | null
    }
  ],

  "canli_gorevler": [                             // atanan frekansiyel görevler
    {
      "id": "uuid",
      "gorev_tipi": "canli_gorevler",
      "tanim": "…",
      "durum": "ACIK" | "ISLEMDE" | "BEKLEMEDE" | "TAMAMLANDI" | "ZAMANINDA_TAMAMLANDI",
      "olusturma_tarihi": "ISO",                  // aktif_olma_tarihi
      "baslatilma_tarihi": "ISO" | null,
      "tamamlanma_tarihi": "ISO" | null,
      "lokasyon_id": "uuid",
      "lokasyon": { "id": "uuid", "tanim": "…", "ust_tanim": "…" | null },
      "checklist_sablon_id": "uuid" | null
    }
  ],

  "lokasyonlar": [                                // kullanıcının yetkili olduğu tüm alt lokasyonlar
    {
      "id": "uuid",
      "tanim": "Fabrika A / Hat 3 / Nokta 7",
      "parent_id": "uuid" | null,
      "ust_tanim": "Hat 3" | null,
      "aktif": true,
      "qr_veri": "a1b2c3…" | null,                // offline QR doğrulama için
      "nfc_token": "…" | null,                    // offline NFC doğrulama için
      "tamamlama_qr_zorunlu": true,
      "sureli_gorev_aktif": false,
      "min_sure_dakika": 3 | null,
      "max_sure_dakika": 30 | null,
      "hedef_sure_dakika": 10 | null,
      "checklist_sablon_id": "uuid" | null
    }
  ],

  "checklist_sablonlari": [                       // normalize — lokasyon.checklist_sablon_id ile eşleş
    {
      "id": "uuid",
      "baslik": "Temizlik Kontrol",
      "versiyon": 1,
      "maddeler": [
        {
          "id": "uuid",
          "sira_no": 1,
          "baslik": "Zemin temiz mi?",
          "zorunlu_cevap": true,
          "gorsel_gerekli": false,
          "secenekler": [
            { "deger": "Evet", "aciklama_gerekli": false },
            { "deger": "Hayır", "aciklama_gerekli": true }
          ]
        }
      ]
    }
  ]
}
```

### Hata response'ları

| HTTP | `code` | Anlam | Mobil davranışı |
|---|---|---|---|
| 401 | — | `X-Device-Token gerekli` veya `Geçersiz cihaz token` | Re-login akışı |
| 403 | `USER_PASIF` | Kullanıcı pasif | Login'i engelle, uyarı göster |
| 403 | `MESAI_YOK` | İş başı yapılmamış | "Önce iş başı okutun" uyarısı |
| 400 | `PROJE_YOK` | Cihazın projesi tanımlı değil | Admin'e başvur uyarısı |
| 400 | `PERSONEL_TAKIBI_KAPALI` | Projede personel takibi kapalı | **Offline moda girme** — mevcut online akışla devam |
| 404 | — | Proje bulunamadı | Re-login akışı |

> `PERSONEL_TAKIBI_KAPALI` hatası **beklenen** bir durumdur — offline modun uygulanabilir olmadığını
> söyler. Kullanıcıya hata göstermeyin, sadece mevcut online akışla devam edin.

### Mevcut `gorevlerim` ile uyumluluk
`gorevler` ve `canli_gorevler` array'lerinin şekli `GET /api/app/gorevlerim` ile **aynı**. Yeni
alanlar (`lokasyon_id`, `checklist_sablon_id`) ek — eski alanlar olduğu gibi korunuyor. Mobil
tarafta mevcut görev parse logic'i sorunsuz çalışır.

---

## 3. NASIL kullanılır? (Entegrasyon Akışı)

### Akış diyagramı

```
┌─────────────────────┐
│ Personel iş başı    │   POST /api/app/mesai-okut (mevcut — değişmedi)
│ QR/NFC okutur       │   → Giriş kaydı oluşur
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Mobil offline mod   │   [YENİ] — iş başı başarılıysa hemen çağır
│ için snapshot al    │
└──────────┬──────────┘
           │
           ▼  GET /api/app/vardiya-paketi
┌─────────────────────┐
│ Response'u local    │   SQLite / AsyncStorage / Hive — cihaz local DB
│ DB'ye yaz           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Online / Offline    │   Uygulama normal kullanılabilir, internet kesilirse
│ karışık çalışma     │   local DB'den oku, işlemleri queue'ya koy
└──────────┬──────────┘
           │ (İnternet dönünce)
           ▼
┌─────────────────────┐
│ Queue'daki işlemler │   POST gorev-tamamla / gorev-iptal / ekstra-frekans
│ offline=true + …    │   offline=true + yerel_zaman ile gönder
│ yerel_zaman ile     │   (bu akış zaten hazır — MOBIL_EKIBE_OFFLINE_SYNC.md)
└─────────────────────┘
```

### Ne zaman çağrılmalı?

1. **İş başı başarılı olduğunda** (zorunlu) — `mesai-okut` 200 döndüğünde hemen arkasından.
2. **Manuel yenileme** (opsiyonel) — kullanıcı uygulamayı arka plandan öne aldığında veya
   "yenile" butonuna bastığında. Ama **sadece online iken**; offline'da mevcut local DB kullanılır.
3. **Kritik:** Aynı vardiya içinde birden fazla kez çağrılabilir (idempotent). Her çağrı
   güncel snapshot döner; local DB üzerine yazılır.

### Ne zaman çağrılmamalı?

- İş başı yapılmadan (`MESAI_YOK` döner)
- Personel takibi kapalı projelerde (`PERSONEL_TAKIBI_KAPALI` — bu normal, mevcut akışla devam)
- Offline iken — internet gerekli

### Offline QR/NFC doğrulama (mobil tarafı)

Lokasyonun QR/NFC kodu okutulduğunda:

```ts
// Pseudocode — offline QR doğrulama
function qrDogrula(okunanToken: string, lokasyonId: string): boolean {
  const lok = localDb.lokasyonlar.find(l => l.id === lokasyonId)
  if (!lok) return false
  if (lok.aktif === false) return false
  const qrOk  = lok.qr_veri  && okunanToken === lok.qr_veri
  const nfcOk = lok.nfc_token && okunanToken === lok.nfc_token
  return !!(qrOk || nfcOk)
}
```

Bu mantık **backend'in aynısı** ([ekstra-frekans/route.ts:114-128](../app/api/app/ekstra-frekans/route.ts#L114)). Offline'da doğruladığınız QR kodu sunucuya gönderildiğinde de aynı kontrolden geçecek — tutarlılık garanti.

### Offline süre (timer) takibi

`sureli_gorev_aktif=true` olan lokasyon için:
```
Kullanıcı QR okuttu (başlatma) → local timer başlat
  - min_sure_dakika geçmeden tamamlama → UI uyarısı ("henüz erken")
  - max_sure_dakika geçerse → görev otomatik iptal (local), sync'te IPTAL kaydı
  - hedef_sure_dakika → kullanıcıya gösterilen hedef
```

### Conflict durumu (offline sync sırasında)

Kullanıcı offline tamamladı, senkronda sunucu reddederse:
- `IPTAL_EDILEMEZ` (HTTP 409) → admin web'den önce iptal etmiş → kullanıcıya "bu görev zaten iptal edildi" mesajı, local kaydı sil
- `404 Görev bulunamadı` → görev silinmiş/taşınmış → kullanıcıya bilgilendirme, local kaydı sil
- Diğer 5xx → queue'da tut, tekrar dene (exponential backoff)

---

## 4. Local DB şeması önerisi (mobil)

Response'u doğrudan aynı yapıda saklayın. Örnek SQLite:

```sql
CREATE TABLE vardiya_snapshot (
  anahtar TEXT PRIMARY KEY,   -- 'current' sabiti
  alindigi_zaman TEXT,        -- cihazdaki alma anı
  sunucu_zamani TEXT,         -- response'taki sunucu_zamani
  gecerli_gun TEXT,           -- vardiya.kayit_tarihi — gün değişirse invalidate
  payload TEXT                -- JSON (tüm response)
);

CREATE TABLE offline_kuyruk (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT,              -- '/api/app/gorev-tamamla' vs.
  body_json TEXT,             -- offline=true + yerel_zaman dahil
  yapildigi_an TEXT,          -- eylemin gerçek anı (retry'da değişmez)
  deneme_sayisi INTEGER DEFAULT 0,
  son_hata TEXT,
  olusturma TEXT
);
```

**Kritik nokta:** `yapildigi_an` eylem yapıldığında **bir kez** set edilir. Senkron retry'ında
`new Date()` kullanmayın — yoksa gerçek zaman bilgisi kaybolur ve rapor yanlış çıkar.

---

## 5. Veri boyutu — ne beklemeli?

Gerçek ölçüm için Oyak Renault gibi büyük proje referans alındı:

| Proje büyüklüğü | Tipik paket boyutu |
|---|---|
| Küçük firma (5-20 görev, 5-10 lokasyon) | 15-30 KB |
| Orta (50 görev, 30 lokasyon) | 50-80 KB |
| Büyük (100 görev, 50+ lokasyon, çok şablon) | 120-180 KB |

Bu boyutlar **gzip sonrası** daha da küçülür (tipik %60-70). Zayıf 3G'de bile 3-5sn sürer.
Loader gösterin, timeout 15-20sn koyun.

---

## 6. Güvenlik notları

- **QR/NFC token'lar statik.** Cihaz kaybı/root durumunda bu token'lar compromise olur. Mobilde
  mutlaka **secure storage** (iOS Keychain, Android Keystore) kullanın.
- **Token rotasyonu ilk sürümde yok.** Sonraki sürümde session-based rotation planlanacak.
- **Device token iptal edilirse** (`device_tokens.aktif=false`), o cihaz artık paket alamaz — admin'in
  cihaz erişimini kaldırabilmesi için tek yol bu.
- **Offline snapshot gün geçince geçersiz.** `vardiya.kayit_tarihi` bugünden farklıysa local DB'yi
  temizleyip yeni paket alın.

---

## 7. Test senaryoları (kabul kriterleri)

1. **Happy path:** Mesai okut → paket al → local DB dolu mu? Görev sayısı `gorevlerim` ile eşleşiyor mu?
2. **Personel takibi kapalı proje:** `PERSONEL_TAKIBI_KAPALI` döner — mobil sessizce online akışla devam etmeli
3. **Mesai yok:** `MESAI_YOK` döner — kullanıcıya "önce iş başı okutun" göster
4. **Offline çalışma:** Flight mode aç → QR okut → görev tamamla → internet aç → local queue boşalır mı? Rapor'da `MOBIL_OFFLINE` kanal'ı ile mi görünüyor?
5. **Conflict:** Offline görev tamamla, senkrondan önce admin web'den iptal etsin → `IPTAL_EDILEMEZ` geldiğinde kullanıcı doğru bilgilendiriliyor mu?
6. **Gün değişimi:** Gece 00:00 olunca local snapshot'ı invalidate et, yeni gün yeni paket.
7. **Büyük proje (Oyak Renault):** 100+ görev ile paket boyutu/süresi kabul edilebilir mi?

---

## 8. Backend commit referansı

- Endpoint: [app/api/app/vardiya-paketi/route.ts](../app/api/app/vardiya-paketi/route.ts)
- Offline sync desteği: `gorev-tamamla`, `gorev-iptal`, `ekstra-frekans` endpoint'leri
  zaten `offline=true` + `yerel_zaman` kabul ediyor (commit `866102a`).
- İlgili doküman: [MOBIL_EKIBE_OFFLINE_SYNC.md](./MOBIL_EKIBE_OFFLINE_SYNC.md)

---

## 9. Soru/destek

Backend tarafıyla iletişim. Entegrasyon sırasında edge case çıkarsa önce response şemasını
production'da kontrol edin (örnek çağrı + JSON dump), sonra backend ile koordine edin —
şema değişmeyecek ama ek alan eklenebilir (geriye uyumlu).
