# İO Asistan İyileştirmeleri — 2026-04-17 gecesi

Kullanıcı uykusuz olduğu için otonom çalışıldı. Bu not sabah incelemek içindir.
Yapılan tüm değişiklikler geri alınabilir (sadece `app/api/io-asistan/route.ts` +
bir migration + iki doküman). Sorun çıkarsa `git revert eae9e95..HEAD`.

## 1. Yapılanlar

### ✅ #4 — Aktif firma/proje context'i prompt'a eklendi
Prompt artık kullanıcının firma_adi, proje_adi ve id'lerini görüyor.
SA dışı roller için "tool çağırırken kendi firma_id'nle sabitle" kuralı eklendi.

**Değişen:** `buildSystemPrompt` imzası genişletildi; route handler firma/proje
adını DB'den çekip prompt'a iletiyor.

### ✅ #2 — Tool kullanım zorunluluk kuralları
Prompt'a `## TOOL KULLANIM ZORUNLULUĞU` bölümü. Sayı/isim/tarih içeren
sorularda tahmin etme → önce tool çağır şart.

### ✅ #5 — Yanıt uzunluk ve ton
Prompt'a `## YANIT UZUNLUK ve TON` bölümü.
- Varsayılan 2-4 cümle
- Selam 1-2 satır, menü kusma yok
- Liste max 5 madde
- "Başka bir şey?" gibi kalıplar yasak
- Emoji max 1

### ✅ #3 — Tool scope audit + kritik düzeltmeler

**Bulunan sorunlar:**

| Sorun | Önem | Durum |
|---|---|---|
| `checklist_ozeti` tamamen kırık (`skor` ve `created_at` kolonları yok) | 🔴 Bug | Düzeltildi |
| `checklist_ozeti` firma scope yok | 🔴 Güvenlik | Düzeltildi (lokasyonlar üzerinden filtre) |
| `arsiv_ozeti` firma scope yok | 🔴 Güvenlik | Düzeltildi (her count'a firma_id filtresi) |
| `veritabani_sorgula` firma_id blind apply ediliyor | 🟡 Bug | Düzeltildi (firma_id'siz tablolar beyaz liste) |
| `veritabani_sorgula` TA firma-scoped olmayan tabloyu sorgulayabiliyordu | 🔴 Güvenlik | Düzeltildi (kapsam aşımı engellendi) |
| Diğer tool'lar (bugunku_mesai, gorev_ozeti, canli_gorev_durumu, musteri_degerlendirmeleri, personel_listesi, lokasyon_bilgisi, personel_basari_analizi, projeleri_listele) | ✅ | Scope filtreleri doğru |

**Önemli not:** `checklist_ozeti` artık `skor` metrikleri vermiyor (tabloda
skor yok); sadece toplam sayı + kanal dağılımı. Gerçek skor hesabı eklenmek
istenirse `checklist_sonuc_maddeleri`'nden türetilmeli — ayrı iş.

### ✅ #6 — Hata logging altyapısı

**Yeni tablo:** `io_asistan_hata_log`
- Kolonlar: id, user_id, firma_id, proje_id, tip, mesaj, detay (jsonb), tarih
- Indeksler: tarih DESC, user_id, tip

**Log edilen olaylar:**
- `rate_limit` — kullanıcı rate limit aşımı
- `tool_error` — tool çıktısı "Hata:" ile başlıyorsa (tool adı + input detayda)
- `max_iter` — 3 iterasyonda hâlâ tool_use (yanıt kesildi)
- `api_error` — catch bloğundaki genel hata (stack dahil)

**Kullanıcıya görünmüyor** — tamamen sessiz; log başarısız olursa da akış bozulmuyor.

**İnceleme:** Supabase SQL Editor veya ileride bir admin sayfası üzerinden.
Örnek:
```sql
SELECT tarih, tip, mesaj, detay->>'tool' AS tool
FROM io_asistan_hata_log
WHERE tarih > now() - interval '24 hours'
ORDER BY tarih DESC
LIMIT 50;
```

## 2. Yapılmayanlar (bilinçli)

- **#7 Metrik/gözlem sayfası** — UI kararı senin, dokunmadım.
- **#8 Feedback butonları** — UI dokunuşu, bırakıldı.
- **#9 Model router** — cost/kalite dengesi senin kararın.
- **#1 Regression testler** — canlı İO testleri senin elinle.
- **`checklist_ozeti` gerçek skor hesabı** — ek DB mantığı, ayrı iş.

## 3. Sabah doğrulama listesi

Önerilen test akışı:

1. [ ] İO'ya "Kaç kullanıcı var?" — tool çağırıyor mu? (Selam + menü listesi kusmamalı)
2. [ ] İO'ya "Bugün tamamlanan görev sayısı?" — sayı doğru mu?
3. [ ] İO'ya "Support emaili nedir?" — halüsinasyon önleme çalışıyor mu? (uydurmamalı)
4. [ ] Bir TA hesabıyla giriş: "Kaç firma var?" → başka firmaları görmemeli (scope)
5. [ ] Farklı projelere sahip kullanıcıyla test: aktif proje prompt'ta mı görünüyor?
6. [ ] Supabase'de `io_asistan_hata_log` tablosunu aç — kayıtlar geliyor mu?

## 4. Geri alma

Her şey tek commit serisi — `git revert HASH` ile geri alınır.
DB tablosu kalabilir (veri taşımıyor, silmek kolay):
```sql
DROP TABLE IF EXISTS public.io_asistan_hata_log CASCADE;
```

## 5. Gece testte çıkan ek olay (commit e179068)

Kullanıcı `357b88d` sonrası Atalian TA hesabıyla test etti, "sistemde
hangi firmalar var" sorusuna İO **5 firma** listeledi. Gerçekte DB'de
sadece **2 firma var** (ATALİAN, EKOL). KOÇAK/ACAR TEMIZLIK/PALMET ÇELİK/
ŞAKAR TESİSLER **uydurma** (halüsinasyon).

**Nedeni:** Haiku tool çağırmadan direkt isim listesi ürettiyse, prompt
kuralları bunu durduramadı.

**Fix (commit e179068):**
- Prompt'a açık "KAPSAM KURALLARI" — TA/U başka firma isimlerini asla
  listelemez, "size sadece kendi firmanız görünür" der.
- Halüsinasyon kuralları sertleştirildi — isim/liste üretmeden önce
  MUTLAKA tool şart.
- `veritabani_sorgula` içinde `firmalar` tablosu özel case
  (.eq('id', firmaId), .eq('firma_id', ...) değil).

**Sabah mutlaka test et:**
- TA hesabıyla tekrar "sistemde hangi firmalar" sor → sadece ATALİAN
  yanıtı gelmeli.
- Haiku kurallara uymuyorsa uzun vadede model routing (önerim:
  Sonnet 4.6'ya fallback kritik sorularda) veya post-processing sanitizer
  gerekebilir.

---

İyi sabahlar. Sorun varsa hepsi reversible.
