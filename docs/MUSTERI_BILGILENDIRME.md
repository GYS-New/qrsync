# İO-GYS — Müşteri Bilgilendirme

**Sistem:** Görev Yönetim Sistemi (GYS)
**Kullanım:** Web Paneli + Mobil Uygulama

---

## 1. Sistem nedir?

İO-GYS, frekansiyel temizlik/kontrol görevlerinin **planlama, takip ve raporlama**sını sağlayan bir yönetim platformudur.

- **Görev tanımları** kural bazlı oluşturulur (örn: "WC Temizliği — günde 9 kez")
- **Personel** mobil uygulamadan QR/NFC okutarak işleri yapar
- **Yönetici** web panelinden anlık takip + denetim raporları alır
- **Müşteri** kendi lokasyonlarındaki görev başarı oranlarını görür

---

## 2. Web Paneli

### Yetki seviyeleri

| Rol | Yetki | Tipik kullanıcı |
|---|---|---|
| **Süper Admin (SA)** | Tüm firmalar | Sistem sağlayıcı |
| **Tenant Admin (TA)** | Bir firmanın tüm projeleri | Hizmet sağlayıcı yöneticisi |
| **Müşteri Kullanıcısı** | Kendi yetkili lokasyonları | Müşteri (denetim) |

### Ana sayfalar

| Sayfa | İçerik |
|---|---|
| **Gösterge Paneli** | Vardiya kartları, KPI özetleri, canlı aktivite |
| **Frekansiyel Görevler → Tüm Görevler** | Tüm görev kayıtları (filtreli, sıralı tablo) |
| **Frekansiyel Görevler → Canlı Akış** | Anlık olarak yapılan işler (saniye saniye) |
| **Rapor Merkezi → Genel Rapor** | Aylık özet: tamamlanan/sapma/kayıp/ekstra |
| **Rapor Merkezi → Personel Değerlendirme** | Personel başına performans |
| **Rapor Merkezi → Hakediş** | Birim fiyat × tamamlanan = fatura kalemi |
| **Lokasyonlar / Görev Kuralları** | Kural ve lokasyon tanımları |

### Filtreler
Her rapor sayfasında:
- **Tarih aralığı** (gün/ay/yıl)
- **Vardiya** (V1 / V2 / V3)
- **Üst lokasyon** (departman/bölge)
- **Personel** (tek kişi seçimi)

Filtre seçimleri Excel ve CSV export'larına da yansır.

---

## 3. Mobil Uygulama (Personel)

### Genel akış

```
1. Giriş → Firma Kodu + Şifre
2. İş başı: Mesai QR okut (vardiya başlangıcı)
3. Görev anı:
   a. Lokasyondaki QR/NFC etiketini okut
   b. "Başlat" tuşuna bas
   c. İşi yap
   d. Bitirince tekrar QR okut + "Tamamla"
4. İş çıkışı: Mesai QR okut (vardiya bitişi)
```

### QR/NFC nasıl çalışır?

Her lokasyonun yanında **kalıcı bir QR kod / NFC etiketi** vardır. Personel cep telefonuyla okuttuğunda sistem hangi lokasyonda olduğunu bilir.

### Min/Max süre

- **Min süre**: Lokasyona göre belirlenen en kısa çalışma süresi (örn 10 dk). Bundan önce tamamlama denenirse sistem reddeder, kalan süreyi gösterir.
- **Max süre**: En uzun çalışma süresi. Aşılırsa sistem uyarı gönderir; tamamlanmayan görev otomatik iptal edilir ("Görev Zaman Aşımı").

### Ekstra Görev

Frekansiyel kuralın dışında ek bir iş yapıldığında (örn "yağ döküldü, müdahale ettim"):
- Personel QR okutur → "Ekstra Görev Yap" butonu
- Gerekçe yazar (min 10 karakter)
- "Başlat" → işi yapar → "Tamamla"
- Backend süreyi otomatik hesaplar; gerekçe rapora yansır

### Mesai takibi

- İş başı/çıkış QR okutması mesai kaydını oluşturur
- Mesai açık değilse görev tamamlama engellenir

---

## 4. Raporlar

### Genel Rapor (aylık/dönemsel)
Müşterinin gördüğü ana rapor:
- **Hedef** — kural tarafından planlanan görev sayısı
- **Tamamlanan** — başarılı bitirilen
- **Sapma** — geç ama yapılmış (ZAMANINDA_YAPILAMAYAN)
- **Kayıp** — hiç yapılmamış (ZAMANI_GECMIS, IPTAL)
- **Frekans Dışı (Ekstra)** — kural fazlası, gerekçe ile

Excel + PDF dışa aktarım mevcut.

### Personel Değerlendirme
- Personel başına tamamlanan, iptal, ortalama süre
- Aktif gün sayısı
- Başarı kategorisi (BAŞARILI / NORMAL / YETERSİZ / BAŞARISIZ)

### Hakediş
- Birim fiyat × tamamlanan görev = fatura kalemi
- Lokasyon bazında detay

### Sapma & Kayıp Analizi
- Hangi gün, vardiya, lokasyon en çok sapma yaşıyor?
- Yapılamayanın nedeni nedir? (vardiya sonu, manuel iptal, vs.)

---

## 5. Müşterinin gördükleri (önemli)

Müşteri kullanıcısı kendi yetkili lokasyonlarında şunları takip edebilir:

✅ Görev başarı yüzdeleri (hedef-tamamlanan oranı)
✅ Ekstra yapılan işler ve gerekçeleri
✅ Saat/dakika hassasiyetiyle her görevin saatleri
✅ Kim, ne zaman, hangi işi yaptı (personel + lokasyon eşleşmesi)
✅ Çeklist sonuçları (varsa)
✅ İptal edilen görevlerin sebebi
✅ Aylık fatura kalemleri (hakediş)

---

## 6. Güvenlik ve Denetim

- **QR/NFC zorunluluğu**: Personel fiziksel olarak lokasyonda olmadan görev yapamaz
- **Wall-clock süre**: Çalışma süresi sunucu saatiyle hesaplanır, manipüle edilemez
- **Audit log**: Tüm kritik işlemler (giriş, görev iptal, ekstra kayıt, vs.) kayıt altında
- **Yetki sınırı**: Müşteri kullanıcısı sadece kendi lokasyonlarını görür
- **Defense in depth**: Mobil + backend iki katmanlı kontrol (min süre, max süre, mükerrer engelleme)

---

## 7. Sık karşılaşılan sorular

**S: Personel QR okutmayı unutursa ne olur?**
C: Görev "yapılmamış" sayılır, raporda Kayıp/Sapma kategorisinde görünür.

**S: Aynı görevi iki personel okutabilir mi?**
C: Lokasyonda aktif bir görev varsa ikinci personel "devam eden görev var" uyarısı alır.

**S: Mobil offline çalışıyor mu?**
C: Frekansiyel görev tamamlama offline da çalışır (kuyrukta bekler, internet gelince sync). Ekstra görev için online zorunlu.

**S: Min süre dolmadan tamamlama yapılabilir mi?**
C: Hayır. Sistem reddeder ve kalan süreyi mobil ekranda gösterir.

**S: Vardiya saatleri değişirse?**
C: TA sistem ayarlarından vardiya planını güncelleyebilir. Sonraki vardiyalar yeni saatlerle üretilir.

**S: Personel başkasının başlattığı görevi tamamlayabilir mi?**
C: Şu anda mümkün ama denetim için (başlatan ≠ tamamlayan) kayıtta görünür. Bu davranış proje ekibiyle gözden geçiriliyor.

---

## 8. Teknik destek

- **Web panel hatası**: Sistem yöneticisine iletilir
- **Mobil hata**: Uygulamadan otomatik log atılır, destek ekibi inceler
- **Veri sorgulama**: Müşteri kullanıcısı kendi yetkisi dahilinde Excel/CSV indirebilir

İletişim için Atalian müşteri temsilcisi: _[firma iletişim bilgisi]_

---

*Bu doküman 2026-06 itibariyle güncel sistem davranışını yansıtır. Sistem sürekli geliştirilmekte olup yeni özellikler eklenmektedir.*
