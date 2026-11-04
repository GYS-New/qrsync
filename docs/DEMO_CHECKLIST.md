# DEMO CHECKLIST — Müşteri Sunumundan Önce

Her müşteri demo/sunum **öncesi** gerçek bir müşteri hesabı ile aşağıdaki sayfalar gezilir; her sayfada DevTools **Network** sekmesi açık, `4xx`/`5xx` cevap veya "fetch failed" olmadığı doğrulanır. Süre: ~5 dakika.

## Hangi hesapla test?

**Admin hesabıyla değil, gerçek müşteri hesabıyla** test edin. Admin hesabı `yetkiliLokIds = null` döner → yetki filtresi hiç çağrılmaz → bir sürü bug gizlenir. Müşteri hesapları URL-long senaryolarını doğal olarak tetikler.

- En iyi aday: **tüm üst lokasyonlara yetkili** bir müşteri hesabı (ör. ATALIAN'da Aydın Vatansever). Bu profil 2000+ yetkili lokasyon çıkarır ve Cloudflare 8 KB URL limitini zorlar; bu kez bulunursa, aynı pattern'in başka yerinde olup olmadığını erken yakalarsınız.

## Zorunlu 5 sayfa (sırayla)

### 1) Dashboard (Gösterge Paneli)
- `/u/dashboard`
- Kontrol:
  - 4 KPI kartı (Frekansiyel / Spesifik / Kullanıcılar / Lokasyonlar) **sayı gösteriyor**, hiçbiri `0` kalmıyor (müşteride veri varsa).
  - "Frekansiyel Görev Akışı" tablosu dolu.
  - "Online Kullanıcılar" bloğu dolu (son 10 dk aktif kullanıcılar varsa).
  - Grafikler yükleniyor.
- Network: `/api/online-users`, `/api/sidebar-counts` → 200.

### 2) Raporlar hub + Frekansiyel Rapor
- `/u/dashboard/raporlar`
- Oradan **Frekansiyel Raporlar** → `/u/dashboard/raporlar/ozellestir/frekansiyel`
- Kontrol:
  - Üst sağda "Bağlantı sorunu" veya kırmızı "TypeError: fetch failed" banner'ı **yok**.
  - "Üst Lokasyon" dropdown'u: "Tümü" + gerçek üst lokasyonlar listeleniyor (sadece "Tümü" varsa `/api/lokasyonlar-list` patlamış demektir).
  - KPI kartları dolu (Hedef, Tamamlanan, Sapma, Frekans Dışı, Kayıp).
  - Departman analizi barları çiziliyor.
- Network: `/api/reports/genel-rapor`, `/api/lokasyonlar-list` → 200.

### 3) Canlı İşlemler → Tüm Görevler
- `/u/dashboard/canli-islemler` → "Tüm Görevler"
- Kontrol:
  - Görev listesi yükleniyor (boş değil, "Bağlantı sorunu" ekranı yok).
  - Arşiv tabına geç → arşiv listesi yükleniyor.
  - Bir üst lokasyon seç → filtre uygulanıyor, görevler güncelleniyor.
- Network: `/api/arsiv/frekansiyel` (GET veya POST, her ikisi de 200).

### 4) Lokasyon Grupları
- `/u/dashboard/lokasyon-gruplari`
- Kontrol:
  - Üst lokasyon başlıkları "—" yerine gerçek isimle görünüyor.
  - Grup sayıları doğru.

### 5) Müşteri Değerlendirmeleri + Süre Analiz
- `/u/dashboard/raporlar/musteri-degerlendirme` — "TypeError: fetch failed" yok, liste yükleniyor.
- `/u/dashboard/raporlar/sure-analiz` — "yükleniyor…" sonsuza takılmıyor, sonuçlar geliyor.

## Opsiyonel (varsa zaman kalmıştır)

- Süre Analizi raporu detay sekmeleri
- Grafiksel Raporlar (`/u/dashboard/raporlar/grafiksel`) — her type: locations / users / live_tasks / manual_tasks / location_groups
- Ham Veri Raporları
- Excel/PDF indir butonları çalışıyor mu (`/api/reports/export`, `/api/reports/genel-rapor-excel`)

## Bir şey patlarsa ne yapılır?

1. **Demo'yu iptal etme**. Çoğu "fetch failed" tek bir API'den gelir, diğer sayfalar çalışır.
2. Network sekmesinde patlayan endpoint'in URL'sinin uzunluğuna bak:
   - `?lokasyon_id=in.(uuid,uuid,uuid,...)` gibi uzun ise → Cloudflare 8 KB limit → chunking eksik.
3. Patlayan endpoint'i commit geçmişinden "chunk" içeren son commit'lerle karşılaştır — muhtemelen aynı pattern'in yakalanmamış bir kopyası.

## Neden bu çeklist var?

2026-11-04'te ATALIAN/OYAK Renault müşteri profili Aydın Vatansever için 2000+ üst lokasyon yetkisi açıldı. Bu profil 8 ayrı endpoint'i aynı anda bozdu (dashboard KPI'lar 0, Frekansiyel Rapor üst lokasyon dropdown boş, Raporlar sayfası "fetch failed" vb.). Root cause: `.in('lokasyon_id', [...2000 UUID])` → URL ~74 KB → Cloudflare reject.

Bug kod incelemesiyle görünmüyor çünkü mantık doğru. Ancak **gerçek müşteri profiliyle** 5 dk'lık bu çeklist patlamaları anında yakalardı.
