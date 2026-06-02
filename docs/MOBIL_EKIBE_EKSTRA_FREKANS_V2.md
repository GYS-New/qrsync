# MOBİL EKİBE — Ekstra Frekansiyel Görev V2 (Audit + Süre Takibi)

**Tarih:** 2026-06-02
**Backend commit:** `4381ffb`
**Hedef mobil sürüm:** iOS Build 7, Android v1.0.28 (yayın hedefi 07 Haz 2026)
**Migration:** ✅ Uygulandı (074, prod DB güncel)
**Durum:** Backend hazır + DB hazır, mobil entegrasyon bekleniyor

> ℹ️ V1 dokümanı (eski tek-POST akışı) hâlâ geçerli ve **v1.0.27 ve öncesi sürümler için endpoint korunuyor**. Bu dokümanın konusu **v1.0.28+ için yeni 2-fazlı akış**.

---

## 1. Neden değişiklik?

OYAK RENAULT sordu: "Personel ekstra görev kaydediyor ama **neden** yaptığını ve **ne kadar sürdüğünü** bilmiyoruz. Her ekstra göreve ücret ödüyoruz, gerekçesi olmalı."

### Mevcut sorun (V1, eski endpoint)

```
POST /api/app/ekstra-frekans → görev anında oluştur+tamamla → tamamlanma_suresi_saniye=0, gerekçe yok
```

Sonuç: rapora bakan müşteri "neden ekstra yapıldı?" sorusunu cevaplayamıyor, faturalandırma zayıf.

### Yeni akış (V2)

İki aşama:
1. **Başlat**: Personel gerekçe yazar → görev `durum=ISLEMDE` açılır, `baslatilma_tarihi=now` kaydedilir
2. **Tamamla**: Personel "Tamamla"ya basar → görev `TAMAMLANDI`, `tamamlanma_suresi_saniye` backend tarafından otomatik hesaplanır

Süre **backend tarafından** hesaplanır (`now() - baslatilma_tarihi`). Mobile süreyi manipüle edemez.

---

## 2. Sürüm matrisi

| Mobil sürüm | Hangi endpoint kullanılır | Durum |
|---|---|---|
| ≤ v1.0.27 | `POST /api/app/ekstra-frekans` (tek-POST, eski akış) | ✅ Çalışmaya devam eder |
| ≥ v1.0.28 | `POST /api/app/ekstra-frekans/baslat` → `POST /api/app/ekstra-frekans/tamamla` | ✅ Yeni akış |

> ⚠️ **Yeni sürümde eski endpoint'i çağırma.** Backend buna engel olmaz ama gerekçe ve süre takibi olmaz, rapor karışır.

---

## 3. Yeni endpoint #1 — `POST /api/app/ekstra-frekans/baslat`

### İstek

```http
POST /api/app/ekstra-frekans/baslat
X-Device-Token: <cihaz tokeni>
Content-Type: application/json

{
  "lokasyon_id": "uuid",          // Zorunlu
  "gorev_tanim": "WC Temizliği",  // Zorunlu, kural listesinden seçilen tanım
  "gerekce":     "Yağ döküldü, müdahale edildi.",  // Zorunlu, min 10 / max 1000 char
  "scan_token":  "<QR/NFC token>" // Lokasyonda QR/NFC zorunluysa zorunlu
}
```

### Alanlar

| Alan | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `lokasyon_id` | UUID | Evet | Ekstra işin yapıldığı lokasyon |
| `gorev_tanim` | string (3–200) | Evet | Frekans kuralındaki tanımla aynı olmalı (serbest metin değil) |
| `gerekce` | string (10–1000) | **Evet** | Personelin yazdığı gerekçe — backend trim eder |
| `scan_token` | string | Koşullu | Lokasyonda `tamamlama_qr_zorunlu` aktifse zorunlu |

### Başarılı yanıt — `200 OK`

```json
{
  "ok": true,
  "mesaj": "Ekstra görev başlatıldı",
  "gorev_id": "uuid",
  "baslatilma_tarihi": "2026-06-02T12:30:00.000Z"
}
```

**Mobile'ın yapması gereken:**
- `gorev_id`'yi sakla — tamamla çağrısında gerekecek
- `baslatilma_tarihi`'yi (server timestamp) lokal kronometre için referans al
- "Aktif Ekstra Görev" ekranına geç

### Hata yanıtları

| Durum | HTTP | `code` | Açıklama / Mobil ne yapsın |
|---|---|---|---|
| Token yok | 401 | — | "Geçersiz cihaz token" — re-login |
| Kullanıcı pasif | 403 | `USER_PASIF` | "Pasif durumdasınız..." göster, çıkış yap |
| JSON geçersiz | 400 | — | Mobile bug, retry |
| `lokasyon_id` eksik | 400 | — | UI validation |
| `gorev_tanim` boş/kısa | 400 | `GOREV_TANIM_GEREKLI` | UI validation |
| `gorev_tanim` >200 | 400 | `GOREV_TANIM_UZUN` | UI validation |
| **`gerekce` <10 char** | **400** | **`GEREKCE_KISA`** | "Gerekçe en az 10 karakter olmalı" |
| **`gerekce` >1000 char** | **400** | **`GEREKCE_UZUN`** | "Gerekçe en fazla 1000 karakter olabilir" |
| Lokasyon yok | 404 | — | UI cache temizle, QR'ı yeniden okut |
| Başka firmanın lokasyonu | 403 | — | UI cache temizle |
| Lokasyon pasif | 409 | `LOKASYON_PASIF` | "Lokasyon pasif durumda" |
| Oto yıkama lokasyonu | 400 | `OTO_YIKAMA_ICIN_GECERSIZ` | Eski `/api/app/ekstra-frekans`'a fallback yap |
| QR/NFC zorunlu, yok | 403 | `QR_NFC_ZORUNLU` | "QR/NFC okutun" |
| QR/NFC uyuşmadı | 403 | `QR_NFC_ESLESMEDI` | "Yanlış kod" |
| Lokasyonda aktif kural görevi | 409 | `AKTIF_KURAL_GOREV_VAR` | "Önce mevcut görevinizi tamamlayın" |
| Lokasyonda kural yok | 409 | `KURAL_YOK` | "Bu lokasyonda tanımlı görev yok" |
| Tanım listede değil | 400 | `GOREV_TANIM_GECERSIZ` | Response içinde `izinli_tanimlar` var, dropdown'ı yenile |
| **5dk içinde mükerrer** | **429** | **`MUKERRER_EKSTRA`** | "Bu lokasyonda yakın zamanda ekstra başlattınız" — modal kapat |
| Ardışık bekleme | 429 | `ARDISIK_BEKLEME` | Süreyi göster, retry button |
| Devam eden başka görev | 409 | `DEVAM_EDEN_GOREV` | Response'ta `aktifGorev` var, ona git |
| DB hata | 500 | — | Generic retry |

> 💡 **`MUKERRER_EKSTRA` (429)**: Aynı user + lokasyon kombinasyonunda son 5 dakika içinde bir ekstra görev başlatılmışsa (durum farketmez — ISLEMDE veya TAMAMLANDI). Spam/yanlış tıklama önleme. Spec madde 6.

---

## 4. Yeni endpoint #2 — `POST /api/app/ekstra-frekans/tamamla`

### İstek

```http
POST /api/app/ekstra-frekans/tamamla
X-Device-Token: <cihaz tokeni>
Content-Type: application/json

{
  "gorev_id": "uuid"  // baslat response'undan gelen gorev_id
}
```

### Başarılı yanıt — `200 OK`

```json
{
  "ok": true,
  "mesaj": "✓ Ekstra görev tamamlandı (23 dk 15 sn)",
  "gorev_id": "uuid",
  "tamamlanma_tarihi": "2026-06-02T12:53:15.000Z",
  "tamamlanma_suresi_saniye": 1395
}
```

**Mobile'ın yapması gereken:**
- `mesaj`'ı toast olarak göster (zaten formatlı: "X dk Y sn" / "X sa Y dk" / "X sn")
- "Aktif Ekstra Görev" ekranını kapat, ana sayfaya dön
- Lokal kronometre'yi durdur
- `tamamlanma_suresi_saniye`'yi sakla istiyorsan (offline geçmiş için)

### Hata yanıtları

| Durum | HTTP | `code` | Açıklama / Mobil ne yapsın |
|---|---|---|---|
| Token yok | 401 | — | Re-login |
| Kullanıcı pasif | 403 | `USER_PASIF` | Çıkış |
| JSON geçersiz | 400 | — | Mobile bug |
| `gorev_id` eksik | 400 | — | Mobile bug |
| Görev yok (yanlış id) | 404 | `GOREV_YOK` | Görev cache temizle |
| Başka firmanın görevi | 403 | `FIRMA_UYUMSUZ` | Cache temizle |
| Görev ekstra değil (kural_id var) | 400 | `KURAL_GOREV_GECERSIZ` | Mobile bug |
| **Durum ISLEMDE değil** | **409** | **`DURUM_GECERSIZ`** | Görev zaten tamamlanmış/iptal → UI'ı senkronize et |
| **Başka user başlattı** | **403** | **`BASLATAN_DEGIL`** | "Bu görevi yalnızca başlatan tamamlayabilir" |
| `baslatilma_tarihi` NULL | 500 | `BASLATILMA_YOK` | Veri tutarsız, support'a bildir |
| DB hata | 500 | — | Generic retry |

> 💡 **`DURUM_GECERSIZ`**: Başka bir taraftan (web admin) görev manuel kapatıldıysa veya gece arşivlemeyi yakaladıysa olabilir. Mobile bu hatayı görünce sessizce ana sayfaya dön ve ekranı yenile.

---

## 5. UX akış — referans diyagram

```
┌─────────────────────────┐
│ 1. QR okut              │
│ GET /api/qr/{token}     │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│ 2. Lokasyonda aktif     │
│    kural görevi var mı? │
└────────┬────────────────┘
         │ HAYIR
         ▼
┌─────────────────────────────────────┐
│ 3. "Ekstra Görev Yap" butonu        │
│    (sadece lokasyon_kurallari > 0)  │
└────────┬────────────────────────────┘
         │ TIKLA
         ▼
┌─────────────────────────────────────┐
│ 4. Modal:                            │
│   - Tanım dropdown (bugun_tamamlananlar + lokasyon_kurallari)
│   - Gerekçe textarea (zorunlu, sayaç: x/1000)
│   - [Vazgeç] [Başlat] butonları
└────────┬────────────────────────────┘
         │ BAŞLAT (gerekçe ≥10 char)
         ▼
┌─────────────────────────────────────────┐
│ 5. POST /api/app/ekstra-frekans/baslat  │
└────────┬────────────────────────────────┘
         │ 200 OK
         ▼
┌─────────────────────────────────────┐
│ 6. AKTİF EKSTRA GÖREV EKRANI        │
│                                      │
│ 🟢 Ekstra Görev Yapılıyor           │
│ Lokasyon: BANT İÇİ ATIK             │
│ Tanım:    WC Temizliği              │
│ Gerekçe:  "Yağ döküldü..."          │
│                                      │
│ ⏱️  00:05:32  (canlı kronometre)    │
│                                      │
│ [ ✓ Tamamla ]                       │
│                                      │
│ "Ana sayfaya dönebilirsin,           │
│  görev arka planda devam eder."     │
└────────┬────────────────────────────┘
         │ TAMAMLA
         ▼
┌─────────────────────────────────────────────┐
│ 7. POST /api/app/ekstra-frekans/tamamla     │
└────────┬────────────────────────────────────┘
         │ 200 OK
         ▼
┌─────────────────────────────────────┐
│ 8. Toast: "✓ Tamamlandı (23dk 15sn)"│
│    Ana sayfaya dön                  │
└─────────────────────────────────────┘
```

---

## 6. Kritik UX kuralları

### 6.1 Kronometre

- Mobile'da kronometre **sadece görsel** — backend'in `baslatilma_tarihi`'sini referans al
- `Date.now() - baslatilma_tarihi_ms` ile her saniye güncelle
- App backgrounded olduğunda kronometre durmasın (sistem timer)
- Tamamla yanıtındaki süre ile mobile kronometre arasında **küçük fark olabilir** (network gecikmesi) — kullanıcıya backend'in döndüğü süreyi göster, kendi sayacını değil

### 6.2 Backgrounded / process kill durumu

- Kullanıcı uygulamayı kapatırsa veya OS process'i öldürürse görev backend'de **ISLEMDE olarak kalır**
- Mobile açılınca: "Aktif ekstra görevin var mı?" kontrolü yapılmalı
  - **Önerilen**: app start'ta `GET /api/app/aktif-gorevler` (eğer böyle bir endpoint varsa) veya `GET /api/qr/{token}` sonrası lokasyonda devam eden ekstra varsa göster
  - Eğer böyle bir endpoint yoksa: önce mobile'da pending bir baslat varsa onu hatırla (local storage)
- **Web admin** ISLEMDE kalmış ekstrayı görür ve "Tamamla" / "İptal" yapabilir → mobile'da `DURUM_GECERSIZ` görürse sessizce ekranı kapat

### 6.3 Gerekçe textarea

- **Sayaç göster** (`12/1000` formatında)
- Min 10 char'a ulaşmadan "Başlat" butonu disabled olsun
- Trim et (backend de trim ediyor ama UI'da feedback önemli)
- Placeholder: "Neden bu ekstra görevi yapıyorsunuz? (örn: Yağ döküldü, müdahale gerekti)"
- **KVKK uyarısı**: küçük not ekleyin: "Hassas/kişisel bilgi yazmayınız. Bu metin rapor ve faturada görünür."

### 6.4 İnternet zorunluluğu (offline desteği YOK)

- Hem baslat hem tamamla **online zorunlu**
- Connectivity check yap, offline ise modal: "İnternet bağlantısı gerekli. Ekstra görev kaydı için aktif bağlantı şarttır."
- Offline iken iptal et / başlatma — backend offline-sync'i bu yeni akışı **desteklemez**

### 6.5 Aktif başka görev / kural görevi

- `AKTIF_KURAL_GOREV_VAR` (409): Lokasyonda zaten bir kural görevi açık → modal kapat, mevcut göreve git
- `DEVAM_EDEN_GOREV` (409): Kullanıcının başka bir aktif görevi var → response'ta `aktifGorev` objesi var, onu göster

### 6.6 5dk mükerrer engelleme

`MUKERRER_EKSTRA` (429) gelirse:
- Modal kapat
- Toast: "Bu lokasyonda son 5 dakika içinde ekstra görev başlattınız."
- Geri sayım gösterme — kullanıcıyı bekletme, sadece bilgilendir
- Retry button **gösterme**

### 6.7 Oto yıkama lokasyonları

- Yeni endpoint **oto yıkama lokasyonlarını kabul etmez** (`OTO_YIKAMA_ICIN_GECERSIZ`)
- Oto yıkama UI'da plaka + KM + foto giriş akışı farklı — eski `/api/app/ekstra-frekans` kullanılmaya devam edilecek
- Mobile karar mantığı: lokasyon `parent_id`'sinin `oto_yikama_lokasyon=true` mi → varsa eski endpoint, yoksa yeni endpoint
- Bu bilgi `GET /api/scan/context` veya `GET /api/qr/{token}` response'unda olabilir; yoksa backend'den iste

---

## 7. Test senaryoları (kabul kriterleri)

### 7.1 Mutlu yol

| # | Adım | Beklenen |
|---|---|---|
| 1 | QR okut + Ekstra modal aç | Tanım + gerekçe alanları görünür, "Başlat" disabled |
| 2 | Gerekçe "Yağ döküldü" (12 char) yaz | "Başlat" enabled olur |
| 3 | Tanım seç + Başlat | 200 OK, gorev_id döner, kronometre ekranı açılır |
| 4 | 30sn bekle, "Tamamla" | 200 OK, toast: "✓ Ekstra görev tamamlandı (30 sn)" |
| 5 | Genel Rapor → Frekans Dışı sekme | Yeni kayıt görünür: GÖREV TANIMI, SÜRE=30sn, GEREKÇE="Yağ döküldü" |

### 7.2 Validasyon

| # | Senaryo | Beklenen |
|---|---|---|
| 6 | Gerekçe 8 char | 400 `GEREKCE_KISA` |
| 7 | Gerekçe 1200 char | 400 `GEREKCE_UZUN` |
| 8 | Boş gerekçe | 400 `GEREKCE_KISA` (trim sonrası) |
| 9 | Sadece whitespace gerekçe | 400 `GEREKCE_KISA` |
| 10 | Tanım listede yok | 400 `GOREV_TANIM_GECERSIZ`, response.izinli_tanimlar dolu |

### 7.3 Edge case

| # | Senaryo | Beklenen |
|---|---|---|
| 11 | Baslat, 2dk sonra tekrar baslat aynı lokasyon | 429 `MUKERRER_EKSTRA` |
| 12 | Baslat, 6dk sonra tekrar baslat aynı lokasyon | 200 OK (eşik geçti) |
| 13 | Baslat A user, tamamla B user (deviceToken farklı) | 403 `BASLATAN_DEGIL` |
| 14 | Baslat, web admin görevi manuel iptal et, mobile tamamla | 409 `DURUM_GECERSIZ` |
| 15 | Baslat, mobile process kill, 1 saat sonra aç + tamamla | 200 OK, süre 1 saat olarak yansır |
| 16 | Aynı görevi iki kez tamamla (race condition) | İlk: 200, ikinci: 409 `DURUM_GECERSIZ` |
| 17 | Baslat, app kapat, gece arşivleme alır, mobile tamamla | 404 `GOREV_YOK` (canli'dan silindi) — UI sessizce kapat |
| 18 | Oto yıkama lokasyonu | 400 `OTO_YIKAMA_ICIN_GECERSIZ`, eski endpoint'e fallback |
| 19 | QR zorunlu lokasyon, scan_token yok | 403 `QR_NFC_ZORUNLU` |
| 20 | Offline (no internet) | Mobile yerel kontrol: modal göster, request atma |

### 7.4 Geriye uyumluluk

| # | Senaryo | Beklenen |
|---|---|---|
| 21 | v1.0.27 APK eski endpoint çağırır | 200 OK, eski davranış (TAMAMLANDI, süre=0, gerekçe NULL) |
| 22 | v1.0.28 yanlışlıkla eski endpoint çağırır | 200 OK ama gerekçe boş → rapor karışır (mobile'ı eski endpoint çağırmaktan kaçınmalı) |

---

## 8. Web panel görünümü

Yeni kayıtlar **Genel Rapor → Frekans Dışı Çalışmalar** sekmesinde görünür:

| SN | ÜST LOKASYON | GRUP TANIMI | LOKASYON | PERSONEL | TARİH | GÖREV SAATLERİ | SÜRE | GÖREV TANIMI | GEREKÇE |
|---|---|---|---|---|---|---|---|---|---|
| 1 | MONTAJ | Temizlik | BANT İÇİ ATIK | AHMET YILMAZ | 02.06.2026 | 14:30 - 14:53 | 23 dk 15 sn | WC Temizliği | Yağ döküldü, müdahale edildi |
| 2 | KANTİN | Toplama | MARKET ÖNÜ | FAİK AKDAĞ | 02.06.2026 | 15:42 - 15:50 | 8 dk 03 sn | Çöp Toplama | Patlayan çöp poşeti |

Eski tek-POST kayıtları için: SÜRE="Tek tık", GEREKÇE="—"

Excel export da aynı kolonları içerir.

---

## 9. Audit log

Backend her iki çağrıda audit kaydı atar:

- Baslat: `tip='ekstra_frekans_baslat'`, `detay={ gorev_id, lokasyon_id, lokasyon_tanim, tanim, gerekce_uzunluk, kanal:'MOBIL' }`
- Tamamla: `tip='ekstra_frekans_tamamla'`, `detay={ gorev_id, lokasyon_id, tanim, sure_saniye, kanal:'MOBIL' }`

> Not: Gerekçe metnini audit'e yazmıyoruz (KVKK + log boyutu). Sadece uzunluk var, denetim için.

---

## 10. Geçiş stratejisi (rollout önerisi)

1. **Backend deploy** (✅ tamam — main branch, migration uygulandı)
2. **Mobil build hazırlık** — yeni 2 endpoint'i implement et, eski endpoint çağrılarını kaldır
3. **Internal QA** — Senaryo 1-22'yi test et
4. **Beta dağıtım** (TestFlight + Internal Track) — 1 firma 1 gün
5. **Production yayın** (07 Haz hedef)

> ⚠️ **Eski sürüm uyumluluğu garantili** — yayından sonra eski APK'lar (v1.0.27) eski endpoint'i çağırmaya devam eder, etkilenmez. Yavaş uptake olsa bile sorun yok.

---

## 11. SSS

**S: Kullanıcı baslat yaptı ama tamamlayı unutursa ne olur?**
C: Görev `ISLEMDE` kalır. Gün sonu cron `gun_sonu_arsivle()` çalışır → terminal durumdaki (TAMAMLANDI/IPTAL/ZAMANI_GECMIS/ZAMANINDA_YAPILAMAYAN) görevleri arşive taşır. ISLEMDE arşivlenmez, `canli_gorevler`'de kalır. Web admin manuel kapatabilir.

**S: Baslat ile tamamla arasında app kapanır, geri açılırsa devam eden görevi nasıl görsün?**
C: Mobile local storage'a `gorev_id`'yi sakla. Açılışta varsa "Devam eden ekstra görevin var" göster + tamamla butonu sun. Veya `GET /api/qr/{token}` çağrısında lokasyonda bu user'ın ISLEMDE ekstrası varsa server da bildirir (gerekirse backend tarafında bu bilgiyi ekleriz — talep edin).

**S: Aynı lokasyonda farklı tanımlar peş peşe yapılabilir mi?**
C: 5 dakika sonra evet. 5dk içinde aynı lokasyonda 2. ekstra başlatma `MUKERRER_EKSTRA` ile engellenir (tanım farklı olsa bile).

**S: Web admin "Ekstra Görev Ekle" yapabilir mi?**
C: Şu an web'de bu UI yok. Mobile-only akış. İhtiyaç olursa ayrı talep.

**S: Backend süreyi neye göre hesaplıyor?**
C: `tamamlanma_suresi_saniye = ROUND((now_ms - baslatilma_tarihi_ms) / 1000)`. Minimum 0 (negatif olamaz). Süre sınırı yok (kullanıcı 5 saat sonra tamamlasa 18000 yazar).

**S: Gerekçe içinde yeni satır (\n) olabilir mi?**
C: Evet, backend filtrelemez. Web panelde wrap edilir.

**S: Karakter limitlerini neden 10/1000 yaptık?**
C: Spec madde 6. 10 alt sınır anlamlı gerekçe yazılmasını zorlar ("ok" / "evet" geçemez). 1000 üst sınır rapor şişmesini engeller (Excel hücresi rahat sığar).

---

## 12. İlişkili dokümanlar

- [MOBIL_EKIBE_EKSTRA_FREKANS.md](MOBIL_EKIBE_EKSTRA_FREKANS.md) — V1 (eski) tek-POST akışı, v1.0.27 için hâlâ geçerli
- [MOBIL_EKIBE_OTO_YIKAMA_ENDPOINTLER.md](MOBIL_EKIBE_OTO_YIKAMA_ENDPOINTLER.md) — Oto yıkama özel akışı
- [MOBIL_EKIBE_GOREV_IPTAL.md](MOBIL_EKIBE_GOREV_IPTAL.md) — Görev iptal UX deseni (benzer modal yapısı)
- [ROLLBACK_EKSTRA_FREKANS.md](ROLLBACK_EKSTRA_FREKANS.md) — V1 rollback talimatları

## 13. Backend referans dosyaları

- [app/api/app/ekstra-frekans/baslat/route.ts](../app/api/app/ekstra-frekans/baslat/route.ts)
- [app/api/app/ekstra-frekans/tamamla/route.ts](../app/api/app/ekstra-frekans/tamamla/route.ts)
- [app/api/app/ekstra-frekans/route.ts](../app/api/app/ekstra-frekans/route.ts) — V1, dokunulmadı
- [lib/tasks/ekstraLokasyonKontrol.ts](../lib/tasks/ekstraLokasyonKontrol.ts) — 5dk mükerrer helper
- [docs/migrations/074_canli_gorevler_aciklama.sql](migrations/074_canli_gorevler_aciklama.sql) — DB değişikliği

---

## 14. İletişim

Backend tarafında sorun/eksik tespit ederseniz:
- Slack veya doğrudan web ekibine iletin
- Spec'te belirtilmeyen edge case'ler için **karar vermeden önce sorun**
- Yeni hata kodu / response field gerekirse: rica edin, ekleriz

**Önemli**: Bu doküman backend davranışını yansıtır. Eğer mobile davranışı doküman ile çelişiyorsa **doküman doğrudur**, mobile'ı uyarlayın.
