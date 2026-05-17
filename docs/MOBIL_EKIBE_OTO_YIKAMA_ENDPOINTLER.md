# Mobil Ekibe — Oto Yıkama Endpoint Dökümü

**Tarih:** 2026-05-17
**Hazırlayan:** Web ekibi
**Hedef:** Mobil ekibinin Oto Yıkama akışını mevcut endpoint'lerle entegre etmesi

---

## Önemli ön bilgi

Oto Yıkama modülü için **yeni bir proje açılmadı**; mevcut OYAK RENAULT
projesi içinde **"ARAÇ YIKAMA" üst lokasyonu + İSTASYON-1/2 alt
lokasyonları** kullanılıyor. Üst lokasyonda `oto_yikama_lokasyon = true`
flag'i var. Bu yapı sayesinde:

- Yıkama personeli ayrı bir rol değil; mevcut OYAK RENAULT personeli
- Mobil app yeni bir UI ekranı açmıyor — mevcut "Ekstra Görev Yap" akışı
  Oto Yıkama lokasyonlarında otomatik plaka listesi gösteriyor
- Görev kayıtları `gorevler` + `oto_yikama_gorev_metadata` tablolarına yazılıyor

Yani **mevcut mobil app version'una hiçbir kod değişikliği gerekmeden Oto
Yıkama çalışıyor**. Aşağıdaki §2 (mobil-uyumlu endpoint'ler) bunun nasıl
çalıştığını anlatır.

---

## 1. Akış özeti (mobil app değişmeden)

```
1. Personel İSTASYON-1 QR'ını okutur
   → GET /api/scan/context?token=<qr-veri>&kanal=QR
   → Response lokasyon meta'sında ekstra_frekans_kurallari[] var
   → Oto Yıkama altıysa: bu array firma'nın plaka listesi (örn 1000 araç)

2. Mobil app "Ekstra Görev Yap" butonunu gösterir (lokasyon_kurallari dolu)

3. Personel butona basar → dropdown'da plakalar listelenir
   → Seçer (örn "16BGB710")

4. Mobil app POST /api/app/ekstra-frekans
   { lokasyon_id, gorev_tanim: "16BGB710", scan_token }

5. Backend "Oto Yıkama dalı" tetiklenir:
   - Plaka eşleşme kontrolü (firma'nın aktif aracı mı?)
   - Ardışık başlatma süresi kontrolü
   - Devam eden görev kontrolü
   - gorevler tablosuna INSERT (durum=TAMAMLANDI, tanim="Oto Yıkama - 16BGB710 (Ekstra)")
   - oto_yikama_gorev_metadata INSERT (ekstra=true, hedef_tarih=today TR)

6. Web panel Günlük Tablo (5sn polling) anlık günceller, plaka yanında
   sarı "EKSTRA" rozeti görünür
```

**Sonuç:** Mobil ekip için yeni endpoint, yeni UI yok. Mevcut "ekstra
görev" akışı Oto Yıkama lokasyonlarında **otomatik** Oto Yıkama'ya dönüşüyor.

---

## 2. Mobil-uyumlu endpoint'ler (X-Device-Token auth)

| Endpoint | Method | Amaç |
|---|---|---|
| `/api/scan/context?token=...&kanal=QR\|NFC` | GET | Lokasyon QR/NFC okutulduğunda lokasyon meta + görev listesi + `ekstra_frekans_kurallari` (Oto Yıkama altıysa plaka listesi) döner |
| `/api/qr/[token]` | GET | scan-context ile benzer — lokasyon + tasks + lokasyon_kurallari |
| `/api/nfc/[token]` | GET | NFC için aynı yapı |
| `/api/app/offline-snapshot` | GET | Mobil offline cache — lokasyonlar (her birinde `ekstra_frekans_kurallari` Oto Yıkama altıysa plaka listesi) |
| `/api/app/ekstra-frekans` | POST | Plaka seç + yıkama tamamla. Body: `{ lokasyon_id, gorev_tanim:"<PLAKA>", scan_token }` |
| `/api/app/gorev-tamamla` | POST | Normal görev tamamla (Oto Yıkama planlı görevler için) |
| `/api/app/gorevlerim` | GET | Personelin aktif görev listesi (Oto Yıkama dahil) |
| `/api/app/gecmis` | GET | Son 24 saat: hem atanmış görevler hem **tamamladığı açık görevler** (Oto Yıkama'lar dahil — `islemi_yapan_id` filter) |
| `/api/app/aktif-gorev` | GET | Devam eden ISLEMDE görev kontrolü |

### Plaka eşleşme detayı

`/api/app/ekstra-frekans` body'sinde `gorev_tanim` plaka olmalı — backend bu
plakayı `araclar` tablosunda `firma_id + plaka + aktif=true` ile arar. Tam
eşleşme zorunlu (case-insensitive değil — büyük harf + boşluksuz normalize):

- ✓ `"16BGB710"` → bulunur
- ✗ `"16 BGB 710"` → bulunmaz (mobil tarafta normalize edilmeli)
- ✗ `"16bgb710"` → bulunmaz (büyük harfe çevrilmeli)

**Fuzzy match yok.** OCR yanlış okursa mobil tarafta hata gösterilir veya
liste/manuel fallback'e düşer. Backend tam eşleşme zorlar.

### Hata kodları (`/api/app/ekstra-frekans` Oto Yıkama dalı)

| Code | HTTP | Anlam |
|---|---|---|
| `PLAKA_GECERSIZ` | 400 | Plaka sistemde yok veya pasif |
| `ARDISIK_BEKLEME` | 429 | Son tamamlamadan sonra X dk geçmeden yeni başlatılamaz |
| `DEVAM_EDEN_GOREV` | 409 | Kullanıcının başka ISLEMDE görevi var |
| `QR_NFC_ZORUNLU` | 403 | Lokasyon QR zorunluysa scan_token gönderilmedi |
| `QR_NFC_ESLESMEDI` | 403 | scan_token lokasyon ile eşleşmedi |
| `USER_PASIF` | 403 | Personel pasif |

---

## 3. Çözüm: mobil app spec'inin §4 endpoint'leri ile mevcut yapı

Spec'te 4 yeni endpoint isteniyordu. Mevcut karşılıkları:

| Spec'te istenen | Mevcut karşılık |
|---|---|
| `GET /api/app/oto-yikama/araclar` (araç listesi snapshot) | `/api/app/offline-snapshot` → her Oto Yıkama lokasyonu için plaka listesi geliyor |
| `POST /api/app/oto-yikama/plaka-eslestir` (OCR fuzzy match) | **YOK** — mobil tarafta normalize zorunlu, backend tam eşleşme arar |
| `POST /api/app/oto-yikama/tamamla` | `/api/app/ekstra-frekans` (Oto Yıkama dalı otomatik tetiklenir) |
| `GET /api/app/oto-yikama/gecmis` | `/api/app/gecmis` (Oto Yıkama görevleri zaten dahil — son 24 saat) |

### Eksik olan: KM + foto + checklist

Şu an `oto_yikama_gorev_metadata`'da `km` / `foto_oncesi_url` / `foto_sonrasi_url`
kolonları **YOK**. Bunlar gerekiyorsa:

**Opsiyon 1 — Mevcut checklist sistemi**
İSTASYON-1/2 lokasyonlarına `checklist_sablon_id` ata; mobil scan-context'ten
otomatik şablon gelir. KM, foto vs. çeklist maddeleri olarak tutulur. Yeni
endpoint gerekmez.

**Opsiyon 2 — Metadata kolon eklemesi**
Migration: `oto_yikama_gorev_metadata` tablosuna `km int`, `foto_oncesi_url text`,
`foto_sonrasi_url text` kolonları eklenir. `/api/app/ekstra-frekans` body'sine
opsiyonel olarak alınır ve yazılır. Yeni endpoint yine gerekmez — mevcut
endpoint genişletilir.

Hangisini tercih edersiniz? Mobil ekibi belirleyebilir.

---

## 4. SA panel endpoint'leri (mobil için DEĞİL)

Bu endpoint'ler sadece web admin paneli için, cookie session ile auth. Mobil
app'in bunları çağırmaması gerekir — yetki almaz (403).

| Endpoint | Method | Amaç |
|---|---|---|
| `/api/oto-yikama/araclar` | GET, POST | Araç listele / yeni araç ekle |
| `/api/oto-yikama/araclar/[id]` | PATCH, DELETE | Araç güncelle / sil |
| `/api/oto-yikama/araclar/import` | POST | Excel ile araç toplu yükleme |
| `/api/oto-yikama/lokasyonlar` | GET | Görev oluştur ekranı için lokasyon dropdown'u |
| `/api/oto-yikama/gorevler/olustur` | POST | Manuel toplu görev oluşturma |
| `/api/oto-yikama/gorevler/import-sablon` | GET | Görev şablon excel'i indir |
| `/api/oto-yikama/gorevler/import-excel` | POST | Excel ile görev toplu yükleme |
| `/api/oto-yikama/gunluk` | GET | Günlük Tablo verisi (5sn polling) |
| `/api/oto-yikama/gunluk/[id]` | PATCH, DELETE | Görev durum toggle / sil |
| `/api/oto-yikama/raporlar` | GET | Rapor verisi + agregasyon |
| `/api/oto-yikama/raporlar/excel` | GET | Rapor Excel export |

---

## 5. Test ortamı

Şu an ATALIAN canlı veri ile çalışıyor. Test için:

**Mevcut canlı durum:**
- Firma: ATALIAN (`a121c4be-77ef-4cc7-8384-9f121eb22112`)
- Proje: OYAK RENAULT (`bd9dfb20-16aa-4038-9542-83abb167e6ee`)
- Üst lokasyon: ARAÇ YIKAMA (`6b7c6067-683c-4bce-b759-fd0b1d6d2cd0`)
- Alt lokasyonlar: İSTASYON-1, İSTASYON-2
- Araç sayısı: 48 (canlı, test edilebilir)

**Test akışı:**
1. Mobil app yıkama personeli (örn Sinan Korkmaz veya test kullanıcısı) ile aç
2. İSTASYON-1 veya İSTASYON-2 QR'ını okut
3. Dropdown'da 48 araç plakası görünmeli
4. Plaka seç → "Ekstra Görev Yap" → POST atılır
5. Web panel `/sa/dashboard/oto-yikama/gunluk` ekranında satır anlık görünür
   (sarı EKSTRA rozetiyle)

Ayrı test firması istenirse hızlıca açılabilir (5 dk).

---

## 6. Karar sorusu

Mobil ekip için iki yol:

**Yol A — Mevcut akışla devam (önerilen)**
- Mevcut mobil app değişmez
- "Ekstra Görev Yap" akışı Oto Yıkama lokasyonlarında otomatik çalışıyor
- KM/foto/checklist gerekiyorsa checklist şablonu ile eklenir
- Plaka eşleşme: mobil tarafta normalize + backend tam match
- Geliştirme süresi: ~0 (zaten hazır)

**Yol B — Yeni endpoint'ler**
- `oto_yikama_gorev_metadata`'ya km/foto kolonları eklensin (migration)
- `/api/app/ekstra-frekans` body'sine opsiyonel km/foto alınsın
- Mobil app yeni UI ekranı (kamera + KM + foto + checklist)
- Geliştirme süresi: ~2-3 gün backend + mobil
- Yeni mobil version (1.1.0+)

**Yol C — Fuzzy match endpoint'i ekle (sadece OCR)**
- `POST /api/app/oto-yikama/plaka-eslestir` eklensin (Levenshtein)
- OCR'nin yanlış okuduğu plaka için aday öneri
- Sadece bu endpoint ek; gerisi Yol A ile aynı
- Geliştirme süresi: ~1 saat

Hangi yolu seçersiniz?

---

## İletişim

- Web ekibi: bu projeyi yazan ekip
- Mobil ekip: Özgür Aydoğdu (hercaisen@gmail.com)
- Sistem yönetici: ÖZCAN AYDOĞDU (ozcana1679@gmail.com)
