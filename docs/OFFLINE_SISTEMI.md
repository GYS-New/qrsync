# Çevrimdışı (Offline) Çalışma Sistemi — Mimari & Referans

**Son güncelleme:** 2026-04-24  
**Statü:** Canlı (OYAK RENAULT projesinde saha testinde)

Bu doküman mobil uygulamanın çevrimdışı çalışma akışını, backend'in bunu nasıl desteklediğini ve olası sorunların nerede aranacağını tek yerde toplar. İleride bir arızada buraya bak.

---

## 1. Genel Akış

```
┌─────────────┐  ①  snapshot   ┌──────────┐   ③ sync   ┌──────────┐
│ Mobil       │ ───────────────▶│  Backend │◀───────────│  Mobil   │
│ (online)    │   indirme       │          │   toplu    │ (tekrar  │
│             │                 │          │   gönderim │  online) │
└─────────────┘                 └──────────┘            └──────────┘
       │                                                      ▲
       ▼                                                      │
  ② Uçak modu: lokal snapshot ile QR okut, görev tamamla ─────┘
```

1. **Snapshot (`POST /api/app/offline-snapshot`)** — mobil, şebeke varken "sıradaki 1 saat içinde ihtiyaç duyacağı" verileri tek istekte indirir.
2. **Offline çalışma** — cihazda ağ yokken, snapshot'taki lokasyon/görev/checklist şablonlarıyla normal iş akışı.
3. **Sync (`POST /api/app/offline-sync`)** — ağa dönünce biriken kayıtlar toplu gönderilir. Her kayıt bağımsız işlenir, idempotent.

---

## 2. Snapshot Endpoint — `/api/app/offline-snapshot`

### Auth
- Header `X-Device-Token` (device_tokens.device_token)
- Kullanıcı `users.aktif = true` olmalı, değilse `403 USER_PASIF`

### PT (Personel Takibi) Modu
- `firmalar.personel_takibi_aktif` **ve** `projeler.personel_takibi_aktif` ikisi `true` ise **PT aktif**
- PT aktif → açık mesai zorunlu. Yoksa `403 MESAI_YOK`
- PT pasif → mesai yok, vardiya yok; tüm kapsam dönebilir

### Vardiya Tespiti
- `aktifVardiyaAraligi(vardiya_sayisi, tum_vardiya_ayarlari, mesai.giris_saati)` — `lib/scan/vardiya.ts`
- Tolerans aralığı: `[baslangic − 30 dk, baslangic + 6 saat]`
- Birden fazla vardiya tolere içindeyse en yakın başlangıçlı seçilir
- Tolerans dışıysa "başlamış ve devam eden" vardiyaya fallback
- Hiçbiri tutmazsa `null` döner (snapshot bu durumda vardiya filter'sız çalışır)

### Yetki Kapsamı — **Önemli Konvansiyon**
`kullanici_lokasyon_yetkileri` tablosu için **sistem genelinde**:
```
yetki kaydı yok  →  tüm erişim
yetki kaydı var  →  sadece yetkili üst lokasyonlar + BFS alt ağaç
```
`lib/yetki/getLokasyonYetki.ts`:38 ile hizalı. Mobil snapshot da aynı davranır.

**Uygulama tuzağı:** PostgREST `.in('lokasyon_id', [...])` 400+ UUID'de URL limit'i (~8KB) aşar ve **sessizce boş sonuç döner**. Bu yüzden:
- Yetki var → `.in(lokasyon_id, yetkiliLokIds)` (küçük liste — sorun yok)
- Yetki yok → `.eq(proje_id, personelProjeId)` (tek eq, URL güvenli)

### Görev Kapsam Politikası — **Sıradaki 1 Saat Penceresi**
```ts
const siradakiSinir = şimdi + 1 saat
filter: durum IN (HAZIR, ACIK) AND aktif_olma_tarihi <= siradakiSinir
```
- **ACIK** görevler: vardiya penceresi içindeyse dahil
- **HAZIR** görevler: sadece önümüzdeki 1 saatte aktifleşecek olanlar dahil
- Daha ileri tarihli HAZIR görevler (sistem 24 saat ilerisi için üretir) **dışlanır**

**Rasyonel:**
- Operatörün önündeki iş yükü 1 saatlik pencereye sığar
- Snapshot boyutu makul kalır (50-150 görev)
- Vardiya tespit edilemeyen senaryolarda bile kontrollü kapsam (gün boyu HAZIR yığılması gelmez)
- Operatör 1 saatten uzun offline kalırsa snapshot'ı yeniden indirir — doğal beklenti

### Ekstra Frekans Kuralları — Kapsam İstisnası
Her lokasyon için `ekstra_frekans_kurallari: [{tanim}]` listesi döner (mevcut `gorev_kurallari` kayıtlarından). **Önemli:**
- `gorev_kurallari.proje_id` tarihsel olarak **NULL** olabilir
- Bu yüzden fallback'te `.eq('proje_id', ...)` KULLANILMAZ
- Strateji: `.eq('firma_id', firmaId)` ile çek + memory-side `lokasyonIdSet.has(lokasyon_id)` filtrele

### Response Yapısı
```typescript
{
  ok: true,
  sunucu_zamani: "ISO",
  mod: 'pt_aktif' | 'pt_pasif',
  kullanici: { id, isim_soyisim, firma_id, proje_id },
  vardiya: { no, baslangic, bitis, baslangicISO, bitisISO } | null,
  mesai: { mesai_kayit_id, kayit_tarihi, giris_saati } | null,
  bekleyen_gorevler: [
    { gorev_id, gorev_tipi, tanim, durum, aktif_olma_tarihi, baslatilma_tarihi,
      lokasyon_id, lokasyon: { id, tanim, ust_tanim }, checklist_sablon_id }
  ],
  lokasyonlar: [
    { id, tanim, parent_id, ust_tanim,
      qr_veri, nfc_token, tamamlama_qr_zorunlu, sureli_gorev_aktif,
      min_sure_dakika, max_sure_dakika, hedef_sure_dakika,
      checklist_sablon_id,
      ekstra_frekans_kurallari: [{ tanim }] }
  ],
  checklist_sablonlari: [
    { id, baslik, versiyon, maddeler: [{ id, sira_no, baslik, zorunlu_cevap,
      gorsel_gerekli, secenekler: [{ deger, aciklama_gerekli }] }] }
  ]
}
```

---

## 3. Mesai Patch — `/api/app/mesai-okut`

### GIRIS Response
```json
{
  "ok": true, "sonuc": "giris", "tip": "GIRIS", "isim": "...",
  "mesai": { "mesai_kayit_id": "...", "kayit_tarihi": "2026-04-24", "giris_saati": "..." }
}
```
### CIKIS Response
```json
{ "ok": true, "sonuc": "cikis", "tip": "CIKIS", "isim": "...", "mesai": null }
```

**Mobil sorumluluğu:** Response'taki `mesai` objesini lokal snapshot.mesai'ye patch eder. Böylece online iş başı → offline geçiş akışında snapshot'ı yeniden indirmek gerekmez.

---

## 4. Offline-Sync Endpoint — `/api/app/offline-sync`

### Request
```typescript
{
  kayitlar: [
    {
      _mobil_kayit_id: string (UUID v4 — idempotency anahtarı),
      gorev_tipi: 'gorevler' | 'canli_gorevler',
      lokasyon_id: string,
      baslatilma_zamani: ISO, bitirme_zamani: ISO,
      maddeler?: [{ madde_id, secenek_degeri, aciklama?, gorsel_url? }],
      ekstra_mi: boolean,
      // Normal görev için:
      gorev_id?: string,
      // Ekstra görev için:
      tanim?: string  // lokasyonun gorev_kurallari listesinden BİREBİR seçilmiş
    }
  ]
}
```

### Response
```typescript
{
  ok: true,
  sonuclar: [
    { _mobil_kayit_id, status: 'ok' | 'cakismali' | 'hata', mesaj?, error? }
  ]
}
```

### Kurallar
1. **Idempotency:** `canli_gorevler.mobil_kayit_id` unique — aynı `_mobil_kayit_id` ikinci kez gelirse `status: 'ok'` (zaten işlenmiş)
2. **Zaman sanity:**
   - `baslatilma < bitirme` zorunlu
   - `bitirme <= şimdi + 5 dk` (clock skew toleransı)
   - `baslatilma >= şimdi − 49 saat` (48h TTL + 1h pay)
3. **Çatışma kuralı — online kazanır:**
   - Görev online tarafta zaten `TAMAMLANDI / IPTAL / ZAMANINDA_YAPILAMAYAN / ZAMANI_GECMIS / KAPATILDI` ise offline kaydı `status: 'cakismali'`
   - Üzerine yazma yok
4. **Ekstra görev tanım doğrulaması:** `tanim` mutlaka lokasyonun aktif `gorev_kurallari` tanımlarından biri olmalı; serbest metin yasak
5. **Kanal:** Tüm başarılı yazımlar `son_tamamlama_kanali = 'OFFLINE'`

---

## 5. Ekstra Görev Endpoint — `/api/app/ekstra-frekans`

### Spec (Kritik)
Ekstra görev = **mevcut kural görevinin tekrarı**. Serbest metin DEĞİL. Kullanıcı lokasyonun `gorev_kurallari` listesinden birini seçer.

### Validation
```ts
if (!izinliTanimlar.has(gorevTanim)) {
  return 400 GOREV_TANIM_GECERSIZ + izinli_tanimlar listesi
}
if (lokasyonda aktif kural yok) {
  return 409 KURAL_YOK
}
```

### UI Gereksinimi (Mobil)
- `ekstra_frekans_kurallari` listesi dolu → chips/radio seçimi
- Liste boş → "Bu lokasyonda tanımlı kural görevi yok" mesajı, "Başlat" pasif
- Serbest metin input **yok**

---

## 6. Kanal Politikası (Sistem Genelinde)

Terminal durum geçişlerinde `son_tamamlama_kanali` **zorunlu** — `lib/gorev/durum-degistir.ts` helper'ı tip sistemi üzerinden kanalı zorlar.

| Kanal | Kullanım |
|---|---|
| `WEB` | Web admin paneli (completeTask) |
| `QR` / `NFC` | Web session scan (scan/tamamla, qr/nfc route'ları) |
| `MOBIL` | Mobil uygulama online eylemi + SIM/PD/max-sure cron'ları (doğal görünme) |
| `OFFLINE` | Mobil çevrimdışı sync |
| `NULL` | Sistem kaynaklı kapanış — sadece `BEKLEMEDE → ZAMANI_GECMIS` (hiç dokunulmamış görev) |

---

## 7. Vardiya Saat Sınırları Dışında İş Başı

**Senaryo:** 1 vardiyalı firma (ör. 08:00-17:00). Operatör 20:00'de iş başı yapar.

- `mesai-okut` saat kontrolü yapmaz — mesai açılır
- `aktifVardiyaAraligi` tolerans dışı + devam eden vardiya yok → **null** döner
- Snapshot vardiya filter uygulamaz → **yalnızca "sıradaki 1 saat" penceresi** çalışır
- Operatör yine yakın görevleri görür, ama vardiya belli olmadığı için kapsam sıkı kalır

**Uyarı:** Snapshot response'unda `vardiya: null` geliyor ama kullanıcıya açık hata verilmiyor. Mobil UI bu alanı kontrol edip uyarı gösterebilir ("İş başı saatiniz vardiya dışı").

---

## 8. Sık Hatalar ve Teşhis

### "Snapshot boş dönüyor"
1. Kullanıcının `users.aktif = true` mi?
2. PT aktif projede açık mesai kaydı var mı?
3. `kullanici_lokasyon_yetkileri` boş mu? (Boşsa fallback tüm proje lokasyonları dönmeli — bug değil)
4. Fallback aktifse `.in()` URL limit'i aşılıyor mu? (Kod `.eq(proje_id)` kullanmalı, karışmamalı)
5. `gorev_kurallari` için `proje_id NULL` senaryosu — firma_id filter olmalı

Debug: DB'de `SELECT COUNT(*) FROM lokasyonlar WHERE firma_id=? AND proje_id=? AND aktif=true` — snapshot sayısıyla tutmalı.

### "Offline'da 'önce iş başı yap' hatası"
1. Online iş başı yapılmış mı? DB `personel_mesai_kayitlari` bak — açık kayıt var mı?
2. `mesai-okut` response'u `mesai` objesi dönüyor mu? (Commit `6d025c1` sonrası dönmeli)
3. Mobil bu objeyi lokal snapshot.mesai'ye patch ediyor mu? (Mobil log: `[v2] Snapshot mesai patch`)

### "Aynı lokasyonda birden fazla ACIK görevden sadece biri görünüyor"
Backend snapshot tüm eşleşmeleri döndürür (test: ARITMA WC'de 3/3 geldi). Sorun mobil tarafında — lokasyon bazlı dedupe/limit UI'da olabilir. `snapshot.bekleyen_gorevler.filter(g => g.lokasyon_id === lokId)` ile **tüm** eşleşmeleri listele.

### "Ekstra görev 'Başlat' butonu yok"
1. `ekstra_frekans_kurallari` dolu mu? Boşsa o lokasyonda aktif `gorev_kurallari` yok demek — normal
2. Mobil UI serbest metin input'u beklemesin, liste seçimi sunmalı
3. Liste boşsa UI kullanıcıya açıkça "tanımlı kural yok" mesajı

### "`ekstra_frekans_kurallari` her lokasyonda boş"
- `gorev_kurallari.proje_id NULL` durumu + fallback'te `.eq('proje_id')` filtresi kullanılmışsa oluşur
- Fix: `firma_id` ile çek + memory-side lokasyon ID filter (commit `96f23b6`)

### "Offline-sync 'cakismali' döndü"
Online kazanır kuralı — görev zaten bir terminal durumda. Mobil bu offline kaydı "çatışma" olarak işaretleyip siler, kullanıcıya "başka biri tamamlamış" der.

### "Zaman sanity reject"
- `bitirme <= baslatilma` veya `bitirme > şimdi + 5 dk` → cihaz saati ileri
- `baslatilma < şimdi − 49 saat` → 48h TTL aşıldı, mobil bu kaydı silmeli

---

## 9. İlgili Commit Zinciri (24.04.2026 Düzeltme Paketi)

| Commit | İş |
|---|---|
| `4d30484` | Yetki kaydı yoksa proje kapsamı fallback |
| `6d025c1` | mesai-okut response'una mesai objesi ekle |
| `414f3d9` | `.in()` URL limit fix — fallback'te proje_id EQ |
| `96f23b6` | Ekstra görev spec validasyonu + `gorev_kurallari` NULL proje fix |
| `6fd4e84` | Sıradaki 1 saat penceresi + HAZIR kapsam kısıtı |
| `717a5e0` | Kanal-zorunlu helper (terminal durum geçişleri) |

---

## 10. Test Kontrol Listesi

Yeni deploy veya şüpheli durumda:

- [ ] Fatih token ile snapshot curl — `sayi.lokasyon > 0`, `sayi.gorev > 0`
- [ ] ARITMA WC gibi 3+ ACIK görevli lokasyon → snapshot'ta 3/3 gorev_id
- [ ] BAY WC SASI KAYNAK gibi kural tanımlı lokasyon → `ekstra_frekans_kurallari` 3 tanım
- [ ] DB'ye test HAZIR kayıt (aktif_olma = şu an + 3 saat) → snapshot'a **girmemeli**
- [ ] DB'ye test HAZIR kayıt (aktif_olma = şu an + 30 dk) → snapshot'a **girmeli**
- [ ] Test kayıtlarını sil
- [ ] `/api/cron/sistem-kontrol` yanıtında `Offline Mod` durumu `OK`
