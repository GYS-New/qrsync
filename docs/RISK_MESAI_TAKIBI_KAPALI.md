# Risk Değerlendirmesi — Mesai Takibi Kapalı Durumu

**Tarih:** 2026-06-04
**Etkilenen proje:** ATALIAN × OYAK RENAULT
**Etkilenen ayar:** `projeler.personel_takibi_aktif = false`
**Karar:** Şimdilik dokunulmuyor, risk belgeleniyor.

---

## 1. Mevcut durum

OYAK RENAULT projesi için sistem **mesai takibi yapmıyor**:

| Alan | Değer |
|---|---|
| `projeler.personel_takibi_aktif` | **false** |
| Son 7 günde mesai kaydı (`personel_mesai_kayitlari`) | **0** |
| Etkilenen kullanıcı sayısı | ~340 (firma aktif `tenant_user`/`musteri`) |

**Anlamı:** Personel:
- İş başında "iş başı QR" okutmadan da görev yapabilir
- Mesai bitiminde "iş çıkışı QR" okutmasına gerek yok
- Sistem hangi personelin sahada (mesai içi) olduğunu bilemez
- Çalışma saatleri raporlanamaz

---

## 2. Etkilenen sistem davranışları

### 2.1 Bildirim cron'ları
Sistem **mesai-bağımsız** olarak çalışıyor:

| Cron / Endpoint | Mesai kontrolü |
|---|---|
| `/api/tasks/max-sure-kontrol` | ❌ Yapmıyor — max süreye yaklaşan herkese FCM atar |
| `/api/app/gorev-basladi` setTimeout zinciri | ❌ Yapmıyor — saatler arasında bildirim atar |
| `/api/cron/vardiya-performans-bildirim` | ❌ Yapmıyor — sadece yöneticilere atar, etkisi yok |

### 2.2 Görev başlat/tamamla
Endpoint'ler şu kodla mesai kontrolü yapıyor:
```js
if (personelTakibiAktif) {
  // mesai kontrolü
} else {
  // atla (mevcut durum)
}
```

Yani **proje ayarı kapalı** olduğu için kontrol her zaman atlanır. Personel ne zaman olursa olsun QR okutup görev yapabilir.

### 2.3 Personel Değerlendirme raporu
- "Aktif gün sayısı" hesaplanır (tamamlanma tarihlerine bakarak)
- Ama "kaç saat çalıştı" hesaplanmaz (mesai başı/çıkışı yok)
- "Günlük görev süresi" sadece tamamlanma sürelerinin toplamı (ayrı bug)

---

## 3. Spesifik riskler

### Risk A — Alakasız bildirim spam'i 🔴 **YÜKSEK** (rapor edilmiş)

**Senaryo:**
- Personel sahada görev başlattı (örn 15:00, 8 saat max süre)
- Mesai bitiminde tamamlamayı unuttu (16:30)
- Saat 22:50'de cron çalışır, görev hâlâ ISLEMDE
- Personel evde, akşam yemeğinde — **bildirim alır**: "Lokasyon X için göreviniz hâlâ aktif. Lütfen tamamlayın."

**Etkilenen kullanıcılar:** Görev tamamlamayı unutan tüm personel (günde 5-20 personel olası)

**Müşteri etkisi:** Personel "bu sistem alakasız bildirim atıyor" şikayet eder. Atalian saha yöneticisinin sürekli açıklama yapması gerekir.

**Çözüm seçenekleri:**
1. Bildirim cron'lara vardiya saati kontrolü ekle (mesai açmadan)
2. Mesai takibini aç → mesai-dışı bildirim engellenir
3. Şu anki: cron 5dk pencerede 1 kez atar, sürekli spam değil ama yine de mesai dışı

### Risk B — Vardiya dışı tamamlama 🟡 ORTA

**Senaryo:**
- Sabah 02:00 (V1 23:30-07:30 içinde ama personel mesaide değil)
- Personel evde, başkasının QR fotoğrafıyla okutuyor
- Sistem "QR doğru, lokasyon mevcut" → kayıt eder
- Fatura kaleminde görünür

**Etkilenen iş süreci:** Hakediş / fatura denetimi

**Müşteri etkisi:** OYAK ileri bir denetimde "personel X gerçekten o saatte sahada miydi?" sorgular, kanıt olmaz.

**Çözüm:** Mesai takibi açılırsa: "önce iş başı QR okut" zorunlu olur. Vardiya dışı görev kabul edilmez.

### Risk C — Personel çalışma süresi raporu YOK 🟡 ORTA

**Eksik metrik:**
- Personel X dün 09:15'te başladı, 17:30'da çıktı = 8sa 15dk
- Bu veri sistem yok

**Etkilenen rapor:**
- Personel Değerlendirme: sadece görev sayısı + tamamlanma süresi toplamı
- Hakediş: sadece tamamlanan görev sayısı × birim fiyat

**Müşteri etkisi:** Atalian'a "personel başı saat raporu" sunulamaz. OYAK fatura yaparken sadece görev başına ödüyor.

### Risk D — Uzaktan görev kaydetme manipülasyon 🟡 ORTA

**Senaryo:**
- Personel sahada değil, evde
- QR kodun fotoğrafı / screenshot'ı telefonunda var
- Uygulamaya yapıştırır → backend doğrular → kabul eder
- Sistem fiziksel varlığı doğrulayamaz

**Mevcut koruma:**
- Hiçbir koruma yok — sadece QR kod doğrulanıyor, fiziksel konum değil

**Çözüm seçenekleri (mesai açmadan):**
- Mesai başı QR'ı sahanın bir yerine asılı tut (yöneticinin gözetiminde)
- Gelecek: GPS / IP coğrafyası kontrolü (yeni özellik, mevcut değil)

### Risk E — Müşteri denetim boşluğu 🟡 ORTA

**Senaryo:**
- OYAK auditör "06 Haziran V2 vardiyasında MONTAJ'da kim çalıştı?" sorar
- Sistem cevap veremez (mesai kayıt yok)
- Sadece "kim görev tamamladı" cevabı verilir
- Eksik personeller görünmez (gelmedi ama görev yapan başkası adına okuttu olabilir)

**Müşteri etkisi:** İleri seviye denetimde "personel devam" kanıtı zayıf

### Risk F — Görev başlatan vs tamamlayan farkı 🟡 ORTA

**Geçen analizimizde tespit edildi:**
- Erol başlattı 13:21, Abdullah tamamladı 17:30
- Süre Erol'dan beri hesaplandı (4 saat) → yanıltıcı

**Mesai takibi açık olsaydı:**
- Erol mesaisini bitirip çıkış yapmış olurdu (16:30)
- Sistem 17:30'da "Erol mesai dışı, görev devredilmiş" tespit edebilirdi
- Abdullah'ın gerçek çalışma süresi hesaplanabilirdi

**Şu anki etki:** Personel Değerlendirme'de süre/aktif gün rakamları çarpıcı şekilde yanlış olabilir.

---

## 4. Risk öncelikleri

| Risk | Öncelik | Mevcut etki | Çözüm zorluğu |
|---|---|---|---|
| A — Alakasız bildirim | 🔴 HIGH | Aktif şikayet | Düşük (cron'a saat kontrolü) |
| F — Başlat/tamamla farkı | 🟡 MID | Rapor doğruluğu zayıf | Orta (mesai takibi gerekli) |
| B — Vardiya dışı tamamlama | 🟡 MID | Denetim ihtiyacı yoksa görünmez | Mesai takibi gerekli |
| C — Çalışma saati raporu | 🟡 MID | Eksik özellik | Mesai takibi + UI |
| D — Uzaktan manipülasyon | 🟡 MID | Şu an istismar tespit edilmedi | Mesai takibi (+ ileride GPS) |
| E — Denetim boşluğu | 🟡 MID | Henüz OYAK auditör gelmedi | Mesai takibi gerekli |

---

## 5. Şimdiki karar — neden mesai takibini açmıyoruz?

Mesai takibi açmak operasyonel hazırlık gerektirir:

1. **Mesai QR kodları üretilmeli** (her departman/giriş için ayrı)
2. **Atalian saha yöneticileri eğitilmeli** ("personel her vardiya başında bunu okutmalı")
3. **İlk hafta operasyonel kayma olur** (personel unutur → giriş yapamaz → yöneticiye iletir)
4. **Müşteri ile koordinasyon** (OYAK bu değişiklikten haberdar olmalı)

Şu anda bu hazırlık yapılmadığı için **iş süreçlerini bozmama** kararı alındı. Riskler **kabul edildi** ve belgelendi.

---

## 6. Gelecek aksiyon eşikleri

Aşağıdaki durumlardan **biri** olduğunda mesai takibi tekrar değerlendirilecek:

| Tetikleyici | Aksiyon |
|---|---|
| Risk A şikayetleri devam ederse | Bildirim cron'una **vardiya saati kontrolü** ekle (mesai açmadan) |
| OYAK denetim talep ederse | Mesai takibini hızlıca aç (Atalian eğitim önceliği) |
| Hakediş tartışması çıkarsa | Mesai takibini aç + B/F risklerini bertaraf et |
| Yeni proje (başka müşteri) eklenirse | Yeni projede mesai takibi varsayılan AÇIK olarak başlatılır |

---

## 7. Hızlı kazanç (mesai açmadan)

Eğer Risk A (bildirim spam) şikayetleri yoğunlaşırsa, mesai takibini açmadan da çözebiliriz:

**Plan:** Bildirim cron'larına firma vardiya saatleri kontrolü ekle.
- Cron çalıştığında firma `vardiya_saatleri` JSON'una bak
- Şu an V1/V2/V3'ten herhangi birinin içinde miyiz?
- Hiçbirinde değilse: bildirim **atma**

**Avantaj:** Operasyonel maliyet sıfır. Sadece kod değişikliği.
**Dezavantaj:** Personelin "mesai bitti" bilgisi yine yok. Vardiya içinde de evde olabilir. Ama "gece 02:00'da uyuyan personel bildirim almaz" sorununu çözer.

---

## 8. Geçmişe yönelik bir not (Bug 2 vs Bug 1 ayrımı)

**Bug 1 — Tablo karışıklığı:** `/api/app/gorev-basladi` setTimeout zinciri yanlış tabloya bakıyordu. Düzeltildi: commit `91daebd`.

**Bug 2 — Mesai dışı bildirim:** Bu doküman, Bug 2'nin kök sebebini açıklar. Düzeltme **şimdilik ertelendi**. Mesai takibi açmak veya cron'a vardiya saati kontrolü ekleme — iki seçenek var, ikisi de gelecek aksiyon olarak duruyor.

---

## 9. İlgili dosyalar / fonksiyonlar

- [`app/api/scan/baslat/route.ts`](../app/api/scan/baslat/route.ts) — mesai kontrolü mantığı (atlanıyor)
- [`app/api/scan/tamamla/route.ts`](../app/api/scan/tamamla/route.ts) — mesai kontrolü mantığı (atlanıyor)
- [`app/api/app/gorev-tamamla/route.ts`](../app/api/app/gorev-tamamla/route.ts) — mesai kontrolü mantığı (atlanıyor)
- [`app/api/tasks/max-sure-kontrol/route.ts`](../app/api/tasks/max-sure-kontrol/route.ts) — Risk A kaynağı (cron, mesai bilmiyor)
- [`app/api/app/gorev-basladi/route.ts`](../app/api/app/gorev-basladi/route.ts) — Risk A kaynağı (setTimeout, mesai bilmiyor)

---

*Bu doküman 2026-06-04 itibariyle Atalian Saha + OYAK RENAULT işletme paydaşlarıyla paylaşılmak üzere yazılmıştır. Sistemi yeniden değerlendirme tarihinde güncellenecektir.*
