# MOBİL EKİBE NOT — Modüler Platform Mimarisi (GYS / Oto Yıkama / FMS)

**Tarih:** 2026-06-16
**Durum:** Backend henüz başlamadı — mobil ekiple paralel planlama yapılıyor.
**Backend tahmini:** ~1.5 iş günü
**Kapsam:** Login akışına "modül seçimi" katmanı eklenir; her modülün kendi UI'ı olur. DB tek (mevcut Supabase), API endpoint'leri uyumlu kalır.

---

## 1. Neden değişiklik yapılıyor?

Şu an GYS sistemi ile Oto Yıkama özelliği aynı UI içinde iç içe. Yakında FMS (Facility Management System) modülü de eklenecek. Tek dashboard + tek sidebar bu üç modülü taşıyamaz. Çözüm:

- Her modülün kendine has dashboard + sidebar'ı olur.
- Login sonrası kullanıcı yetkili olduğu modülü seçer.
- Tek yetkili modül varsa seçim ekranı atlanır → direkt o modüle gidilir.

**Veritabanı tek paylaşımlıdır** — modüller ayrı app değil, aynı sistemin alt görünümleri.

---

## 2. Yeni endpoint: yetkili modülleri çekme

### GET /api/app/yetkili-moduller

**Auth:** `X-Device-Token` header (mevcut auth)

**İstek:** Body yok, sadece header.

**Yanıt (200):**
```json
{
  "ok": true,
  "moduller": [
    { "kod": "gys",        "ad": "GYS",        "ikon": "shield",  "aktif": true,  "yetkili": true },
    { "kod": "oto_yikama", "ad": "Oto Yıkama", "ikon": "car",     "aktif": true,  "yetkili": true },
    { "kod": "fms",        "ad": "FMS",        "ikon": "building","aktif": false, "yetkili": false }
  ],
  "tek_modul": false,
  "tek_modul_kodu": null
}
```

**Alan açıklamaları:**

| Alan | Tip | Açıklama |
|---|---|---|
| `moduller[].kod` | string | Modül sabit kodu: `gys`, `oto_yikama`, `fms` |
| `moduller[].ad` | string | UI başlığı (TR) |
| `moduller[].ikon` | string | İkon adı (mobil tarafta MaterialIcon/SF Symbol'a map edilir) |
| `moduller[].aktif` | bool | Firma için modül aktif mi (`firmalar.modul_aktif` flag'leri) |
| `moduller[].yetkili` | bool | Bu kullanıcı modüle erişim yetkisine sahip mi (`kullanici_grubu_yetkileri.modul_kodu`) |
| `tek_modul` | bool | Kullanıcı sadece bir modülde hem `aktif` hem `yetkili` ise true |
| `tek_modul_kodu` | string\|null | `tek_modul=true` ise o modülün kodu, değilse null |

**Davranış kuralları:**

- Her kullanıcı en az **`gys`** modülünde yetkilidir (default fallback). Yani array hiçbir zaman boş dönmez.
- `aktif=false` modüller listeye dahil edilir ama mobil UI'da **"Yakında" badge** ile gri gösterilir, tıklanamaz.
- `yetkili=false` modüller listeye **DAHİL EDİLMEZ** — backend tarafında filtrelenir (yetkisi olmayan modülü kullanıcı görmez).

**Yanıt (geriye uyumlu eski sürümler için):**
- Eski mobil sürümler bu endpoint'i çağırmaz → mevcut GYS akışı aynen çalışır.

---

## 3. Mobil tarafında akış

### 3.1. Login sonrası

```
register (yeni cihaz) VEYA check-device (yeniden açılış) başarılı
    ↓
local storage'da `aktif_modul` var mı?
   → Var → o modülün ana ekranına git (sunucudan yetki yine de fetch edilir, sessiz validate)
   → Yok → GET /api/app/yetkili-moduller
            ↓
        tek_modul=true ?
           → Evet → aktif_modul = tek_modul_kodu, local storage'a yaz → ana ekrana git
           → Hayır → Modül Seçim ekranı göster
```

### 3.2. Modül Seçim ekranı

- Her modül için bir kart (3 kart: GYS, Oto Yıkama, FMS — backend yanıtındaki sıraya göre).
- `aktif=true && yetkili=true` → kart aktif, tıklanabilir.
- `aktif=false` → kart gri, "Yakında" badge'i, tıklama bir toast ("Bu modül henüz aktif değil") gösterir.
- `yetkili=false` zaten yanıtta yok → karta hiç eklenmez.
- Tasarım dili: **GYS sisteminin Verde palette** (web ile aynı tema). Modül ayırt edici özellik: ikon + renk vurgusu.

### 3.3. Ana ekran (modüle göre)

| aktif_modul | Mobilde gösterilen ekran |
|---|---|
| `gys` | **Değişiklik YOK.** Mevcut görev listesi, scan, bildirim, vs. aynen çalışır. |
| `oto_yikama` | Plaka eşleştirme + günlük plan + araç listesi (zaten mevcut endpoint'ler kullanılır). |
| `fms` | Henüz yok — `aktif=false` döner, bu ekrana hiç girilmez. |

**Önemli:** Oto Yıkama için mobilde **zaten mevcut endpoint'ler** var ve değişmiyor:
- `GET  /api/app/oto-yikama/araclar`
- `GET  /api/app/oto-yikama/bugun-planli`
- `POST /api/app/oto-yikama/plaka-eslestir`

Yeni eklenecek tek şey: bunları çağıran UI'ın **ayrı bir akış olarak** (modül seçimi ile etkinleştirilen) gösterilmesi.

### 3.4. Modül Değiştir

- Topbar'a veya kullanıcı menüsüne **"Modül Değiştir"** butonu eklenir.
- Tıklanınca:
  - `aktif_modul` local storage'dan **silinir**
  - `/api/app/yetkili-moduller` tekrar çağrılır
  - Modül Seçim ekranı gösterilir
- Mobil hem **yan modülün state'ini sıfırlamalı** (ekran cache'leri, in-memory data) hem de seçim ekranına dönmeli.

### 3.5. Persist (kalıcılık)

| Veri | Saklama yeri | Yaşam |
|---|---|---|
| `aktif_modul` (kod: `gys`/`oto_yikama`/`fms`) | local storage / SharedPreferences | App silinene kadar |
| Cihaz token + kullanıcı bilgisi | Mevcut | Değişmedi |

**Anahtar adı önerisi:** `iogys_aktif_modul` (web tarafıyla aynı cookie ismi).

### 3.6. App yeniden açılışta

- `aktif_modul` varsa → direkt o modülün ana ekranına git.
- Sonra arka planda `/api/app/yetkili-moduller` sessiz çağrılır:
  - Hala yetkili → devam et.
  - Yetki düşmüş veya modül `aktif=false` olmuş (örn firma kapattı) → kullanıcıya bilgi göster, Modül Seçim ekranına yönlendir.

---

## 4. Geriye uyumluluk

Eski mobil sürümler için **kırılma yok**:

| Eski mobil sürüm davranışı | Backend yanıtı |
|---|---|
| `/api/app/yetkili-moduller` çağırmaz | Endpoint çağrılmaz, mevcut GYS akışı aynen sürer |
| `/api/app/oto-yikama/*` çağırmaz | Yine sürer (modül seçim mantığı sadece UI; backend her zaman tüm endpoint'leri sunar) |
| Görev listesini çekiyor | Aynen alır |
| Mobil ekibin tarafında ek bir mecburiyet | YOK — kademeli rollout mümkün |

Yeni modül seçim akışı **opt-in**: mobil ekip kendi takvimine göre devreye alabilir.

---

## 5. Test senaryoları

### Senaryo 1: Tek yetkili modül (sadece GYS)
- Login sonrası `/api/app/yetkili-moduller` → `tek_modul=true, tek_modul_kodu="gys"`
- Modül Seçim ekranı **atlanır**, direkt GYS ana ekranı açılır.

### Senaryo 2: Çoklu yetkili modül (GYS + Oto Yıkama)
- Login sonrası `/api/app/yetkili-moduller` → 2 modül yetkili, `tek_modul=false`
- Modül Seçim ekranı gösterilir.
- Oto Yıkama'yı seç → local storage'a yaz → Oto Yıkama ana ekranı.

### Senaryo 3: Modül firma için kapatıldı (aktif=false)
- Kullanıcı daha önce Oto Yıkama'yı `aktif_modul` olarak kullanıyordu.
- Firma admin Oto Yıkama'yı kapattı (`firmalar.oto_yikama_aktif=false`).
- App yeniden açılışta sessiz çağrı → Oto Yıkama `aktif=false` döner.
- Mobil: "Bu modül firma tarafından devre dışı bırakıldı" bildirimi + Modül Seçim ekranına yönlendir.

### Senaryo 4: Yetki düştü
- Kullanıcı Oto Yıkama yetkisini kaybetti.
- Yanıtta Oto Yıkama listede yok.
- Mobil: aynı bildirim + Modül Seçim ekranına yönlendir.

### Senaryo 5: Modül Değiştir
- Aktif modül GYS, kullanıcı "Modül Değiştir" basar.
- Local storage temizlenir, seçim ekranı gösterilir.

### Senaryo 6: Eski mobil sürüm + yeni backend
- Mobil `/api/app/yetkili-moduller` çağırmaz.
- Mevcut GYS akışı aynen çalışır.
- Hiçbir hata, hiçbir kırılma.

---

## 6. Mobil tarafından teyit gereken kararlar

| # | Soru | Önerilen |
|---|---|---|
| 1 | `aktif_modul` storage anahtarı: `iogys_aktif_modul` mu? | Evet (web ile tutarlı) |
| 2 | Modül Seçim ekranında animasyon var mı? | Opsiyonel, UX kararı |
| 3 | "Modül Değiştir" butonu nerede gösterilir — topbar, hamburger menü, profil sayfası? | Mobil ekibin tasarım kararı |
| 4 | `aktif=false` modülün kartına tıklanınca hangi mesaj? | "Bu modül henüz aktif değil. Yöneticinize başvurun." |
| 5 | Modül Seçim ekranı ilk kez açıldığında bir tutorial/onboarding gerekli mi? | İlk sürüm: gerek yok, sade |

---

## 7. Sürüm zinciri ve rollout

**Faz A — Backend hazır (mobil etkilenmez):**
- `/api/app/yetkili-moduller` deploy edilir.
- Mevcut mobil sürümler bu endpoint'i çağırmaz, GYS akışı sürer.
- Web tarafında modül sistemi devreye alınır, panelden test edilir.

**Faz B — Mobil revize (paralel veya sıralı):**
- Mobil ekip bu spec'e göre uygular.
- Beta'da test edilir.
- Store'a yayınlanır.

**Faz C — Geriye uyumluluk dönem:**
- Eski + yeni mobil sürümler birlikte çalışır.
- Kullanıcı yeni mobil yüklerse modül seçimi devreye girer.
- Eski mobil sürüm: hep GYS akışı (etkilenmez).

**Mobil minimum sürüm zorlaması yok** — kullanıcı kendi takvimine göre geçer.

---

## 8. İlgili dosyalar (referans)

- Mevcut auth akışı: [docs/MOBIL_EKIBE_FIRMA_KODU.md](MOBIL_EKIBE_FIRMA_KODU.md), [docs/MOBIL_EKIBE_SIFRE_DOGRULAMA.md](MOBIL_EKIBE_SIFRE_DOGRULAMA.md), [docs/MOBIL_EKIBE_CHECK_DEVICE_DONUS.md](MOBIL_EKIBE_CHECK_DEVICE_DONUS.md)
- Mevcut Oto Yıkama mobil endpoint'leri: `app/api/app/oto-yikama/{araclar,bugun-planli,plaka-eslestir}/route.ts`
- Web tarafı plan: yapılacaklar listesi madde 8 (Modüler Platform Mimarisi)

---

## 9. İletişim

Backend tarafında değişiklik öncesi/sonrası sorular için bu dosya tek kaynak olarak güncellenir. Mobil tarafı revize ederken takıldığınız her noktada yorum veya direkt geri dönüş bekleriz.
