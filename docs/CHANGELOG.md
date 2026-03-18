
## 2026-03-10 — rev37
- Excel indirme hatası çözüldü: Python/execFile bağımlılığı tamamen kaldırıldı.
- Yeni lib: `lib/reports/fill-excel.ts` — saf TypeScript, sıfır dış bağımlılık.
  - Node.js built-in `zlib` ile xlsx (ZIP) dosyasını parse eder, XML'leri değiştirir, yeni ZIP buffer üretir.
  - CRC32, deflate/inflate, ZIP local header + central directory hepsi TypeScript ile implement edildi.
  - Python3 binary olmayan Vercel/serverless ortamlarında da çalışır.
- `app/api/reports/genel-rapor-excel/route.ts` güncellendi: Python script çağrısı kaldırıldı, fillGenelRaporExcel() kullanılıyor.


## 2026-03-10 — rev36
- TemplateReportsClient Giriş sekmesi Excel şablonuyla birebir hizalandı.
- PARAMETRELER: Sol kenar dikey yeşil etiket, sarı (FFC000) zemin ile Firma/Üst Lokasyon/Alt Lokasyon/Rapor Tarihi/Gün Sayısı/Raporu Alan satırları.
- Üç kolonlu layout: Parametreler | Genel Durum Bar Grafiği (recharts) | Hakediş Faktörleri tablosu.
- İkinci satır: Grup Frekans Göstergeleri tablosu (sol) + 3 istatistik kutusu yan yana (Frekans Göstergeleri / Frekans Sapmaları / Kayıp Frekans Göstergeleri).
- Üç grafik yan yana: Başarılı İşlem Oranı (bar), Frekans Göstergeleri (çizgi), Sapma/Kayıp Frekans (çizgi).
- Alt satır: Frekans Sapmaları + Kayıp Frekans detay tabloları yan yana.
- Excel İndir butonu /api/reports/genel-rapor-excel endpoint'ine bağlandı (şablon doldurma).


## 2026-03-10 — rev35
- Rapor Özelleştirme modülü tamamen yeniden yazıldı.
- Excel şablonu (QR-Sync_Genel_Rapor.xlsx) analiz edilerek 4 sekme (Giriş, Tamamlanan Frekanslar, Sapmalar, Gruplar) HTML/CSS tablo olarak projeye entegre edildi.
- Yeni API: `app/api/reports/genel-rapor/route.ts` - Supabase'den frekans, lokasyon, grup verilerini çekip işler.
- Yeni lib: `lib/reports/genel-rapor-data.ts` - Veri işleme katmanı.
- `components/reports/TemplateReportsClient.tsx` yeniden yazıldı: 4 sekmeli gerçek veri görünümü, filtreler (firma, lokasyon, tarih, raporu alan), Excel renk paleti korundu.
- Sekme başlıkları Excel sekmeleriyle birebir eşleşiyor.
- SA ve TA ozellestir sayfaları aktif hale getirildi.

## 2026-03-10 — rev34
- Rapor Özelleştirme modülü askıya alındı.
- `app/api/reports/template-export`, `template-meta`, `upload-template` API route'ları kaldırıldı.
- `lib/reports/template-export.ts` silindi.
- `components/reports/TemplateReportsClient.tsx` silindi.
- `scripts/xlsx_tool.py` silindi.
- `lib/import-export/xlsx.ts` içindeki `fillXlsxTemplate`, `inspectXlsxFile`, `inspectXlsxBuffer` ve `XlsxSheetModel` kaldırıldı.
- `sa/dashboard/raporlar/ozellestir` ve `ta/dashboard/raporlar/ozellestir` sayfaları "modül askıya alındı" mesajıyla boşaltıldı.
- `lib/reports/pdf.ts` korundu (`buildSimplePdf` ham-veri export route'u tarafından kullanılmaktadır).

## 2026-03-08
- Hızlı rapor XLSX export yapısı native Excel chart üretecek şekilde revize edildi.
- XLSX içinde artık tek sayfada Excel grafiği + veri tablosu birlikte oluşturuluyor.
- Hızlı rapor grafik export mantığı `lib/reports/quick-export.ts` altında ortaklaştırıldı.

# CHANGELOG

## Son Stabil Sürüm
QRSYNC_import_export_xlsx_v1.zip

## Son Yapılanlar
- SA ve TA için yeni Raporlar sayfası eklendi
- Lokasyon, Kullanıcılar, Frekansiyel Görevler, Manuel Görevler ve Checklist Şablonları için ayrı rapor kartları hazırlandı
- Rapor parametreleri kolon bazlı seçilebilir hale getirildi; tüm kolonlar seçilerek tam veri çıktısı alınabiliyor
- Rapor çıktıları için .xlsx ve PDF indirme endpointi eklendi
- Checklist şablonlarında madde açıklama alanı kaldırıldı; madde yapısı sadece başlık üzerinden ilerliyor
- Kullanıcı, lokasyon ve frekansiyel görev alanlarına gerçek .xlsx import/export desteği eklendi
- Her alan için .xlsx şablon indirme, Excel ile ekle ve Excel'e aktar butonları eklendi
- Yeni Excel butonları mevcut butonlarla aynı ölçüde olacak şekilde standartlaştırıldı
- Yeni Excel butonları üç alanda da sağ tarafa hizalandı
- Lokasyon importunda NFC token otomatik üretilir hale getirildi; QR token üretimi mevcut sistem akışına bırakıldı

## Çalışan Modüller
- Checklist şablonlarında madde açıklama alanı kaldırıldı; madde yapısı sadece başlık üzerinden ilerliyor
- Kullanıcı, lokasyon ve frekansiyel görev alanlarına gerçek .xlsx import/export desteği eklendi
- Her alan için .xlsx şablon indirme, Excel ile ekle ve Excel'e aktar butonları eklendi
- Yeni Excel butonları mevcut butonlarla aynı ölçüde olacak şekilde standartlaştırıldı
- Yeni Excel butonları üç alanda da sağ tarafa hizalandı
- Lokasyon importunda NFC token otomatik üretilir hale getirildi; QR token üretimi mevcut sistem akışına bırakıldı

## Çalışan Modüller
- Multi-tenant yapı
- QR görev tamamlama
- NFC görev tamamlama
- Checklist şablon sistemi
- Lokasyona checklist şablonu atama
- Manuel görev bildirimi
- Manuel görev tamamlanınca bildirimi otomatik okundu yapma

## Bir Sonraki Hedef
- Buraya yeni sohbette yapmak istediğimiz işi yazacağız

- Lokasyon bazlı süreli görev altyapısı eklendi: sureli_gorev_aktif, görev başlatma/tamamlama akışı ve süre alanları.
- Lokasyon import/export şablonlarına sureli_gorev_aktif kolonu eklendi.
- Lokasyonlar sayfasına, Ekle butonunun soluna tüm lokasyonlar için sureli_gorev_aktif alanını topluca açıp kapatan ikonlu bir `SG'leri AÇ-KAPAT` butonu eklendi.

- Raporlar sayfası header alanına "Hızlı Rapor Ver" butonu eklendi.
- SA/TA için görsel hızlı rapor altyapısı oluşturuldu. 4 rapor tipi (Lokasyonlar, Kullanıcılar, Frekansiyel Görevler, Spesifik Görevler) için tarih ve yardımcı filtrelerle grafik kartları eklendi.
- Yeni endpoint: /api/reports/quick

- Hızlı Raporlar modülü ana rapor sayfasından ayrılarak ayrı sayfaya taşındı.
- Quick rapor kullanıcı özetleri `users.last_seen_at` bağımlılığından çıkarıldı; mevcut şemayla uyumlu hale getirildi.
- Kullanıcılar export raporundan `Son Görülme` kolonu kaldırıldı.

- Lokasyon Grupları modülü eklendi: SA ve TA için yeni sayfa/sekme, grup oluşturma-düzenleme-silme, lokasyonların grup içine atanması, tam lokasyon yolu ile render.
- Canlı görev yaşam döngüsü revize edildi: HAZIR→ACIK otomatik açılma, 8 saat sonrası tamamlamada ZAMANINDA_YAPILAMAYAN, 12 saat ACIK sonrası BEKLEMEDE, 12 saat BEKLEMEDE sonrası ZAMANI_GECMIS. QR/NFC tarafında HAZIR canlı görevler gizlendi.


## 2026-03-10 — rev35
- Rapor Özelleştirme modülü tamamen yeniden yazıldı.
- Excel şablonu (QR-Sync_Genel_Rapor.xlsx) analiz edilerek 4 sekme (Giriş, Tamamlanan Frekanslar, Sapmalar, Gruplar) HTML/CSS tablo olarak projeye entegre edildi.
- Yeni API: `app/api/reports/genel-rapor/route.ts` - Supabase'den frekans, lokasyon, grup verilerini çekip işler.
- Yeni lib: `lib/reports/genel-rapor-data.ts` - Veri işleme katmanı.
- `components/reports/TemplateReportsClient.tsx` yeniden yazıldı: 4 sekmeli gerçek veri görünümü, filtreler (firma, lokasyon, tarih, raporu alan), Excel renk paleti korundu.
- Sekme başlıkları Excel sekmeleriyle birebir eşleşiyor.
- SA ve TA ozellestir sayfaları aktif hale getirildi.

## 2026-03-10 — rev34
- Rapor Özelleştirme modülü askıya alındı.
- `app/api/reports/template-export`, `template-meta`, `upload-template` API route'ları kaldırıldı.
- `lib/reports/template-export.ts` silindi.
- `components/reports/TemplateReportsClient.tsx` silindi.
- `scripts/xlsx_tool.py` silindi.
- `lib/import-export/xlsx.ts` içindeki `fillXlsxTemplate`, `inspectXlsxFile`, `inspectXlsxBuffer` ve `XlsxSheetModel` kaldırıldı.
- `sa/dashboard/raporlar/ozellestir` ve `ta/dashboard/raporlar/ozellestir` sayfaları "modül askıya alındı" mesajıyla boşaltıldı.
- `lib/reports/pdf.ts` korundu (`buildSimplePdf` ham-veri export route'u tarafından kullanılmaktadır).

## 2026-03-08
- Canlı görevlerde `islemi_yapan_id` alanı eklendi; web ve mobilde yapılan son işlem otomatik kaydediliyor.
- Frekansiyel görev listeleri, akış ekranı ve raporlar artık canlı görevlerde de gerçek `İşlemi Yapan` kullanıcısını gösteriyor.
- Hızlı rapor grafik yerleşimi revize edildi: 4 kart tek sıra yerine 2 üst + 2 alt olacak şekilde iki kolonlu düzene geçirildi.


## 2026-03-10 — rev35
- Rapor Özelleştirme modülü tamamen yeniden yazıldı.
- Excel şablonu (QR-Sync_Genel_Rapor.xlsx) analiz edilerek 4 sekme (Giriş, Tamamlanan Frekanslar, Sapmalar, Gruplar) HTML/CSS tablo olarak projeye entegre edildi.
- Yeni API: `app/api/reports/genel-rapor/route.ts` - Supabase'den frekans, lokasyon, grup verilerini çekip işler.
- Yeni lib: `lib/reports/genel-rapor-data.ts` - Veri işleme katmanı.
- `components/reports/TemplateReportsClient.tsx` yeniden yazıldı: 4 sekmeli gerçek veri görünümü, filtreler (firma, lokasyon, tarih, raporu alan), Excel renk paleti korundu.
- Sekme başlıkları Excel sekmeleriyle birebir eşleşiyor.
- SA ve TA ozellestir sayfaları aktif hale getirildi.

## 2026-03-10 — rev34
- Rapor Özelleştirme modülü askıya alındı.
- `app/api/reports/template-export`, `template-meta`, `upload-template` API route'ları kaldırıldı.
- `lib/reports/template-export.ts` silindi.
- `components/reports/TemplateReportsClient.tsx` silindi.
- `scripts/xlsx_tool.py` silindi.
- `lib/import-export/xlsx.ts` içindeki `fillXlsxTemplate`, `inspectXlsxFile`, `inspectXlsxBuffer` ve `XlsxSheetModel` kaldırıldı.
- `sa/dashboard/raporlar/ozellestir` ve `ta/dashboard/raporlar/ozellestir` sayfaları "modül askıya alındı" mesajıyla boşaltıldı.
- `lib/reports/pdf.ts` korundu (`buildSimplePdf` ham-veri export route'u tarafından kullanılmaktadır).

## 2026-03-08 - Hızlı rapor grafik revizyonu (rev3)
- Hızlı rapor yerleşiminde grafikler 2x2 düzen korunarak grafik alanları daha okunur hale getirildi.
- Tüm dar grafiklerde sağa-sola kaydırma desteği ve çok satırlı/kısaltılmış başlık gösterimi iyileştirildi.
- "En aktif lokasyonlar" grafiği sadece üst lokasyon toplamlarını gösterecek şekilde güncellendi.
- "En aktif alt / alt alt lokasyonlar" grafiğinde seçilen üst lokasyon adı başlıktan çıkarıldı; sadece alt/alt-alt lokasyon adları gösteriliyor.
- "En başarılı lokasyonlar" grafiği üst lokasyon filtreli ve alt lokasyon bazında bitişik "tamamlanan / diğer" sütunlu hale getirildi.
- "Görev durum grafiği" ve diğer dar grafiklerde sütun incelmesini azaltmak için yatay scroll alanı eklendi.
- "Başarısız görevler grafiği" pasta üstte, veri kartları altta 2 sütun olacak şekilde revize edildi.

- Hızlı rapor grafiklerinde görünür sütun sayısı 5 olarak revize edildi; 5'ten fazla veri olduğunda grafik içi sağ-sol gezinme butonları eklendi.

- Hızlı rapor grafik kartlarına metin açıklaması kaldırılarak PNG / SVG / CSV indirme butonları eklendi.

- Hızlı rapor grafik indirme alanı ikonlu hale getirildi; PNG/SVG/CSV butonları metinsiz ama tooltipli görünüme taşındı.
- İndirme alanı vurgulandı ve dosya adları grafik başlığını temel alacak şekilde güncellendi.

- Hızlı rapor grafik indirmelerine XLSX eklendi; her grafik artık PNG, SVG, CSV ve Excel olarak indirilebiliyor. Excel çıktısında özet sekmesi ve başlıklı veri tablosu yer alıyor.

- Hızlı rapor XLSX dışa aktarma yapısı tek sayfada grafik + veri olacak şekilde güncellendi. XLSX içine mevcut grafik görseli gömülüyor ve aynı sayfada veri tablosu da yer alıyor.

- XLSX hızlı rapor çıktılarında satır ve sütun dondurma tamamen kaldırıldı; dosya artık freeze pane olmadan açılır.

## 2026-03-09

- Rapor Merkezi genişletildi: yeni `Rapor Özelleştir` kartı eklendi ve şablon tabanlı rapor akışına yönlendirme sağlandı.
- `Rapor Özelleştir` sayfası builder mantığından çıkarılarak hazır şablonlar + özel şablon yükleme + parametre formu + web önizleme düzeniyle yeniden tasarlandı.
- Örnek şablon indirme alanı eklendi; sistemin named range / işaretli alan standardına göre ilerleyecek özel şablon altyapısı için ilk UI iskeleti kuruldu.

## 2026-03-10 — rev35
- Rapor Özelleştirme modülü tamamen yeniden yazıldı.
- Excel şablonu (QR-Sync_Genel_Rapor.xlsx) analiz edilerek 4 sekme (Giriş, Tamamlanan Frekanslar, Sapmalar, Gruplar) HTML/CSS tablo olarak projeye entegre edildi.
- Yeni API: `app/api/reports/genel-rapor/route.ts` - Supabase'den frekans, lokasyon, grup verilerini çekip işler.
- Yeni lib: `lib/reports/genel-rapor-data.ts` - Veri işleme katmanı.
- `components/reports/TemplateReportsClient.tsx` yeniden yazıldı: 4 sekmeli gerçek veri görünümü, filtreler (firma, lokasyon, tarih, raporu alan), Excel renk paleti korundu.
- Sekme başlıkları Excel sekmeleriyle birebir eşleşiyor.
- SA ve TA ozellestir sayfaları aktif hale getirildi.

## 2026-03-10 — rev34
- Rapor Özelleştirme modülü askıya alındı.
- `app/api/reports/template-export`, `template-meta`, `upload-template` API route'ları kaldırıldı.
- `lib/reports/template-export.ts` silindi.
- `components/reports/TemplateReportsClient.tsx` silindi.
- `scripts/xlsx_tool.py` silindi.
- `lib/import-export/xlsx.ts` içindeki `fillXlsxTemplate`, `inspectXlsxFile`, `inspectXlsxBuffer` ve `XlsxSheetModel` kaldırıldı.
- `sa/dashboard/raporlar/ozellestir` ve `ta/dashboard/raporlar/ozellestir` sayfaları "modül askıya alındı" mesajıyla boşaltıldı.
- `lib/reports/pdf.ts` korundu (`buildSimplePdf` ham-veri export route'u tarafından kullanılmaktadır).

## 2026-03-08
- Sidebar üzerindeki raporlar menüsü tek giriş olacak şekilde revize edildi; ayrı Hızlı Raporlar menüsü kaldırıldı.
- Raporlar sayfası artık görsel olarak güçlendirilmiş bir "Rapor Merkezi" karşılama ekranı açıyor.
- Rapor Merkezi içinde üç yönlendirme eklendi: Ham Veri Raporları, Grafiksel Raporlar ve başlık olarak Süre Analiz Raporları.
- Mevcut ham veri rapor ekranı `/dashboard/raporlar/ham-veri`, hızlı rapor ekranı ise `/dashboard/raporlar/grafiksel` altına taşındı.
- Eski `/dashboard/hizli-raporlar` rotaları yeni grafiksel rapor sayfasına yönlendirme yapacak şekilde korundu.
