# MOBİL EKİBE NOT — Manuel Görev İptali

**Tarih:** 2026-04-20
**Backend commit:** (bu notun yanındaki commit hash'i)
**Durum:** Backend tarafı hazır — mobil entegrasyon bekleniyor.
**SQL migration:** [docs/migrations/019_gorev_iptal_sebep.sql](migrations/019_gorev_iptal_sebep.sql) (Supabase'de çalıştırılmalı)

---

## 1. Neden değişiklik yapıldı?

Mobil kullanıcı şu an aktif/işlemde olan bir görevi **manuel olarak iptal edemiyor**. Tek iptal yolu, max sürenin aşılması (otomatik IPTAL). Operasyonda görevin yapılamayacağı durumlar (lokasyon kapalı, ekipman arızalı, müşteri talebi vs.) yaşandığında kullanıcı görevi sonlandıramıyor.

Bu eksikliği gidermek için yeni bir endpoint eklendi.

---

## 2. Yeni Endpoint

```
POST /api/app/gorev-iptal
Headers:
  X-Device-Token: <cihaz tokeni>
  Content-Type:   application/json

Body:
{
  "gorev_id":    "uuid",            // iptal edilecek görevin ID'si
  "gorev_tipi":  "canli_gorevler",  // ya da "gorevler"
  "iptal_sebep": "Lokasyon kapalı"  // ZORUNLU — kullanıcının yazdığı manuel metin
}
```

### Alanlar

| Alan | Tip | Zorunlu | Açıklama |
|---|---|---|---|
| `gorev_id` | UUID | Evet | İptal edilecek görevin ID'si |
| `gorev_tipi` | string | Evet | `"canli_gorevler"` (frekansiyel) veya `"gorevler"` (spesifik) |
| `iptal_sebep` | string | **Evet** | Kullanıcının manuel girdiği iptal nedeni — min **3**, max **500** karakter |

### Yanıtlar

| Durum | HTTP | Body |
|---|---|---|
| Başarılı | 200 | `{ ok: true, mesaj: "Görev iptal edildi", gorev_id, gorev_tipi, durum: "IPTAL", iptal_sebep, iptal_tarihi }` |
| Sebep boş / kısa | 400 | `{ ok: false, error: "İptal sebebi zorunlu (en az 3 karakter)", code: "IPTAL_SEBEP_GEREKLI" }` |
| Sebep çok uzun | 400 | `{ ok: false, error: "İptal sebebi en fazla 500 karakter olabilir", code: "IPTAL_SEBEP_UZUN" }` |
| Görev tamamlanmış / iptal edilmiş | 409 | `{ ok: false, error: "Görev zaten X durumunda — iptal edilemez", code: "IPTAL_EDILEMEZ" }` |
| Görev başkasına atanmış | 403 | `{ ok: false, error: "Bu görev size atanmış değil" }` |
| Token geçersiz | 401 | `{ ok: false, error: "Geçersiz cihaz token" }` |
| Kullanıcı pasif | 403 | `{ ok: false, error: "Pasif durumdasınız!", code: "USER_PASIF" }` |

### İptal edilebilen durumlar

Sadece şu durumlardaki görevler iptal edilebilir:
- `ACIK`
- `ISLEMDE`
- `BEKLEMEDE`

`TAMAMLANDI`, `IPTAL`, `ZAMANI_GECMIS`, `ZAMANINDA_YAPILAMAYAN` vs. **iptal edilemez** (409 dönülür).

---

## 3. Mobil tarafında yapılması gerekenler

1. **Görev kartına "İptal Et" butonu ekle** — sadece `ACIK / ISLEMDE / BEKLEMEDE` görevlerde göster.
2. **Butona basınca modal aç** — `iptal_sebep` için **manuel metin girişi** (TextArea, min 3 char, max 500).
   - Cancel: modal kapansın
   - Onayla: endpoint'e POST at
3. **Başarılı yanıt → kullanıcıya toast** ("Görev iptal edildi") + listeyi yenile.
4. **`IPTAL_SEBEP_GEREKLI`** dönerse modal'da hata göster, modal kapanmasın.
5. **`IPTAL_EDILEMEZ`** dönerse listeyi yenile (görev zaten başka bir state'te).

---

## 4. Backend tarafında yapılanlar

- `gorevler`, `gorevler_arsiv`, `canli_gorevler`, `canli_gorevler_arsiv` tablolarına `iptal_sebep TEXT NULL` kolonu eklendi.
- Yeni endpoint: [app/api/app/gorev-iptal/route.ts](../app/api/app/gorev-iptal/route.ts)
- Genel Rapor → Kayıp Frekanslar tablosunda **KAYIP NEDENİ** kolonu artık manuel iptallerde kullanıcının yazdığı metni gösteriyor (otomatik iptallerde eski "Manuel iptal edildi" / "Süre aşıldı" etiketleri devam eder).
- Audit log: her manuel iptal `audit_log` tablosuna `tip='gorev_iptal_manuel'` kaydı olarak yazılır (kullanıcı, görev, sebep, lokasyon).

---

## 5. Test senaryoları

| # | Senaryo | Beklenen |
|---|---|---|
| 1 | ISLEMDE görev + sebep "Müşteri talebi" | 200, durum=IPTAL, raporda KAYIP NEDENİ='Müşteri talebi' |
| 2 | ACIK görev + sebep boş | 400, IPTAL_SEBEP_GEREKLI |
| 3 | TAMAMLANDI görev + sebep "X" | 409, IPTAL_EDILEMEZ |
| 4 | Başka kullanıcının görevi | 403 |
| 5 | Geçersiz device token | 401 |
| 6 | 600 karakter sebep | 400, IPTAL_SEBEP_UZUN |
