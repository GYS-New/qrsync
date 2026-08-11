# Yeni Modüller Yol Haritası — Temizlik / Güvenlik / Teknik

**Versiyon:** 2026-07-17 v1 (planlama aşaması, kod yazımı yok)
**Durum:** 🟡 Onay bekliyor — mobile ekip incelemesi + tüm ekiplerden OK sonrası start
**Sahibi:** Backend + Mobile ekip birlikte

---

## 1. Amaç ve kapsam

ATALIAN firması için mevcut GYS + Oto Yıkama + FMS sistemine 3 yeni hizmet modülü eklenecek:

- **TEMİZLİK** — planlanmış temizlik işleri, ekipman takibi, saha personeli yönetimi
- **GÜVENLİK** — vardiya kayıtları, olay bildirimleri, denetim raporları
- **TEKNİK** — arıza kaydı, bakım planı, teknik personel takibi

**Kritik kısıtlar:**
1. Mevcut sistem (GYS/Oto Yıkama/FMS) HİÇ etkilenmemeli
2. Tek kullanıcı havuzu — her modül kendi bünyesinde yönetebilecek
3. Tek çatı altında ama role-bazlı arayüz değişkenliği
4. Şu an tek firma (ATALIAN) — ama multi-tenant kod yolu bozulmayacak
5. Bir kullanıcı birden fazla modülde farklı rollerde olabilir

---

## 2. Mimari — Seçenek D (Hibrit)

**Aynı Next.js repo, ayrı Postgres schema'ları.**

```
Supabase DB (tek project)
├── public schema (MEVCUT — dokunulmaz)
│   ├── users, firmalar, lokasyonlar (ORTAK — READ)
│   ├── canli_gorevler, gorevler, oto_yikama_* vb.
│   └── kullanici_modul_yetkileri (yeni modüller de kullanır)
│
├── temizlik schema (YENİ)
├── guvenlik schema (YENİ)
└── teknik   schema (YENİ)
```

**Kod tarafında:**
```
app/portal/              # Ana giriş — yetkili modül kartları
app/temizlik/            # Yeni modül
app/guvenlik/            # Yeni modül
app/teknik/              # Yeni modül
app/api/temizlik/, api/guvenlik/, api/teknik/
components/shared/       # Ortak UI (Topbar, tablo, form)
components/temizlik/, guvenlik/, teknik/
lib/modul/yeniModulYetki.ts
```

**Neden bu?**
- Mevcut sistemi bozma riski minimum
- Ortak kullanıcı doğal (aynı Supabase Auth)
- Deploy tek nokta, feature flag ile modül aç/kapa
- Cross-modül raporlama mümkün

---

## 3. Backend yol haritası

### 🟢 FAZ 1 — Temel altyapı (1-2 hafta)

| # | Adım | Etki | Süre |
|---|---|---|---|
| B1 | Migration 108: `temizlik`, `guvenlik`, `teknik` schema'ları oluştur | Sıfır (boş schema) | 30 dk |
| B2 | Migration 108: `modul_kodu_enum`'a 3 yeni değer ekle | Sıfır | 5 dk |
| B3 | Migration 108: `firmalar` tablosuna 3 aktif flag ekle | ATALIAN için `false` default | 15 dk |
| B4 | Migration 108: `modul_rolleri` tablosu (esnek rol tanımı) | Yeni tablo, sıfır etki | 30 dk |
| B5 | `lib/modul/yeniModulYetki.ts` — yeni yetki middleware | Sıfır (kullanılmayan) | 2 sa |
| B6 | `app/portal/page.tsx` — kullanıcının yetkili modül kartları | Yeni sayfa | 1 gün |
| B7 | `app/portal/layout.tsx` — minimal ortak layout | Yeni sayfa | 2 sa |
| B8 | `components/shared/` — mevcut ortak component'leri buraya taşı (opsiyonel) | Kodda düzenleme, davranış aynı | 4 sa |

**Onay noktası:** Faz 1 sonunda `/portal` çalışıyor, kullanıcı login → kart görünümü → henüz aktif modül yok, sadece mevcut GYS/Oto Yıkama/FMS'e yönlendirme.

### 🟡 FAZ 2 — İlk modül: TEMİZLİK (2-4 hafta)

**Neden Temizlik önce?** GYS'e en yakın domain (görev yönetimi mantığı). Pattern buradan çıkacak, diğer 2 modül kopyalayarak paralel gelişir.

| # | Adım | Süre |
|---|---|---|
| T1 | Temizlik domain modelini tasarla (isler, ekipmanlar, planlar, sarf) | 1 gün |
| T2 | Migration 109 — `temizlik` schema tabloları | 4 sa |
| T3 | Migration 110 — `temizlik` RLS policy'leri (firma-scope, modül-rol) | 4 sa |
| T4 | `modul_rolleri`'e temizlik rolleri seed: `supervisor`, `saha`, `goruntuleyici` | 30 dk |
| T5 | `app/api/temizlik/isler/` route (CRUD) | 1 gün |
| T6 | `app/api/temizlik/planlar/` route | 1 gün |
| T7 | `app/api/temizlik/kullanicilar/` route (modül-scope kullanıcı yönetimi) | 1 gün |
| T8 | `app/temizlik/dashboard/` UI | 1 gün |
| T9 | `app/temizlik/isler/` UI | 2 gün |
| T10 | `app/temizlik/planlar/` UI | 1 gün |
| T11 | `app/temizlik/kullanicilar/` UI | 1 gün |
| T12 | `app/temizlik/layout.tsx` — modül-rol'a göre sidebar | 4 sa |
| T13 | Feature flag testi: `firmalar.temizlik_aktif=false` iken modül gözükmesin | 2 sa |

**Onay noktası:** Faz 2 sonunda Temizlik modülü tam çalışır, portal'dan erişilebilir, rol bazlı arayüz varyasyonu doğrulanmış.

### 🟠 FAZ 3 — Güvenlik + Teknik paralel (4-6 hafta)

Faz 2'den çıkan pattern kopyalanır. İki modül paralel gelişebilir (farklı ekip/geliştirici).

| # | Adım | Süre |
|---|---|---|
| G1-G12 | Güvenlik: T1-T12 adımlarının analogu | ~2-3 hafta |
| K1-K12 | Teknik: T1-T12 adımlarının analogu | ~2-3 hafta |

### 🔵 FAZ 4 — Cross-modül raporlama (opsiyonel, sonra)

- Personel bir günde hangi modüllerde ne yaptı
- Firma bazlı toplam performans
- Ortak dashboard (`/portal`'da genişletme)

---

## 4. Mobile yol haritası

**⚠️ Bu bölüm mobile ekip ile senkron olacak. Aşağıdaki taslak — mobile ekibin kararına göre revize edilecek.**

### Mobile ekibine sorulacaklar (BİLGİ TOPLAMA)

Aşağıdakileri netleştirmeden mobile roadmap kesinleşemez:

1. **Mevcut mobile app hangisi?**
   - `c:\io-mobil` (io-ats-saha, Capacitor+Next.js — Fluke akustik kaçak tespit APK)?
   - `c:\io-teknik` (Expo/React Native — io-teknik)?
   - Kullanıcılar `iogys.com.tr` mobil web mi kullanıyor yoksa native app mi?

2. **Yeni modüller mobile'de nasıl olacak?**
   - **Seçenek M1:** Mevcut app'e yeni sayfalar (tab/drawer) ← en hızlı
   - **Seçenek M2:** Ayrı bir "ATALIAN Modüller" app'i ← temiz ayrım
   - **Seçenek M3:** Progressive Web App (PWA) — mobile web, install edilebilir
   - **Seçenek M4:** Hiç mobile yok, sadece web (responsive) ← en kolay

3. **Offline-first mi?**
   - Saha personeli internet yokken görev alabilmeli mi?
   - Veri senkronizasyonu (upload sırasında) nasıl olacak?

4. **Push notification stratejisi**
   - Yeni modüllerde push bildirim gerekli mi?
   - FCM (Firebase) altyapısı mevcut — modül-bazlı topic segregation

5. **Auth**
   - Supabase Auth mobile'de nasıl entegre?
   - Aynı JWT web ve mobile'de geçerli mi?

6. **Ölçek**
   - Kaç kullanıcı mobile'den girecek?
   - Aynı anda kaç kişi (concurrent)?

### Mobile Faz 1 (backend Faz 1 ile paralel gelebilir)

- Yeni modüllerin mobile app'te hangi ekranları olacak (wireframe)
- Ana portal mobile karşılığı
- Modül-rol bazlı navigation

### Mobile Faz 2 (backend Faz 2 sonrası)

- Temizlik modülü mobile ekranları
- İş alma / iş tamamlama akışı
- Foto çekme / yükleme

---

## 5. Onay noktaları

| Aşama | Kim onaylıyor | Ne onaylanıyor |
|---|---|---|
| **Mimari** | Backend ekibi + kullanıcı | Seçenek D uygun mu? |
| **Mobile stratejisi** | Mobile ekibi + kullanıcı | Yeni app mi, mevcut app'e ilave mi? |
| **Faz 1 planı (backend)** | Kullanıcı | Migration + portal iskeleti başlasın mı? |
| **Faz 2 planı (Temizlik detay)** | Kullanıcı + domain sahibi | Temizlik iş modeli doğru mu? |

---

## 6. Şu ana kadar netleşen kararlar

- ✅ Mimari: Seçenek D (aynı Next.js repo, ayrı Postgres schema)
- ✅ Kullanıcı: multi-modül, multi-rol (`kullanici_modul_yetkileri` mevcut tablo)
- ✅ Firma: tek (ATALIAN), ama multi-tenant kod yolu korunacak
- ✅ Modül benzerliği: kısmen benzer → `components/shared/`, `lib/shared/`
- ✅ Auth: mevcut Supabase Auth
- ⏳ Mobile stratejisi: mobile ekip görüşmesi bekleniyor
- ⏳ Modüllerin domain modeli (hangi tablolar, hangi alanlar) — mobile+backend ortak tasarım
- ⏳ Modül-rol tanımları (`modul_rolleri` seed) — iş sahibi ile

---

## 7. Riskler (izlenecekler)

| Risk | Etki | Mitigation |
|---|---|---|
| Yeni modül DB'yi kilitler | Mevcut sistemi yavaşlatır | Realtime subscription'da zorunlu filter+debounce, statement_timeout 30s |
| Cross-modül veri sızıntısı | Güvenlik ihlali | RLS: `public.users`'a INSERT/UPDATE/DELETE yeni modüllerden yasak |
| Deploy tek nokta | Hepsi birlikte etkilenir | Feature flag (`firmalar.X_aktif`) ile modül-bazlı kapatma |
| Mobile ile senkron kaybı | Wireframe uyumsuzluğu | Faz 1'de mobile+backend ortak API tasarım toplantısı |
| Kod tabanı şişer | Build süresi artar | Next.js route-bazlı code splitting; endişe düşük |

---

## 8. Sonraki adım — start için gerekli 3 şey

1. ✅ Bu doküman + memory kaydı — HAZIR
2. ⏳ Mobile ekip incelemesi + mobile Faz 1 planı ekle
3. ⏳ Tüm ekipler + kullanıcı OK verince → **Migration 108** ile start

Start verildiğinde çalıştırılacak ilk komut:
```
Migration 108: yeni schema'lar + modül enum'ları + firma flag'leri
```
Bu tek migration çalıştıktan sonra DB'de yeni schema'lar boş oluşur — mevcut sistem etkilenmez.
