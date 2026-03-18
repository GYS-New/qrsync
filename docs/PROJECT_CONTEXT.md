# QRSync - Project Context

## Proje Tanımı
QRSync, çok kiracılı (multi-tenant) bir SaaS saha operasyon yönetim sistemidir.

Amaç:
- QR / NFC ile lokasyon doğrulama
- görev tamamlama
- checklist doldurma
- saha operasyonlarının izlenmesi

---

# Teknoloji Stack

Frontend
- Next.js 14 (App Router)
- TypeScript
- TailwindCSS

Backend
- Supabase
- PostgreSQL

Auth
- Supabase Auth

Depolama
- Supabase Storage

---

# Roller

## SUPER_ADMIN
- tüm tenantları yönetir
- lisans yönetimi
- tenant oluşturma

## TENANT_ADMIN
- kendi firması içindeki kullanıcıları yönetir
- lokasyon yönetimi
- görev oluşturma
- checklist şablonu yönetimi

## EMPLOYEE
- QR/NFC ile görev tamamlama
- checklist doldurma

---

# Tenant Yapısı

Her firma ayrı tenant olarak çalışır.

Tablolar tenant_id ile izole edilir.

Örnek:


users
tenant_id

lokasyonlar
tenant_id

gorevler
tenant_id


---

# Lokasyon Sistemi

Lokasyonlar 3 seviyeli hiyerarşiye sahiptir.


Lokasyon
└ Alt Lokasyon
└ Alt Alt Lokasyon


Her lokasyonda:


qr_token
nfc_token
checklist_sablon_id


---

# Görev Türleri

## 1 Canlı Görev

Sistem tarafından oluşturulur.

Durum akışı:


HAZIR
↓
ACIK
↓
TAMAMLANDI


QR/NFC yalnızca **ACIK görevleri bulabilir**.

---

## 2 Manuel Görev

TA tarafından oluşturulur.

Kullanıcıya atanır.

Bildirim gönderilir.

Bildirim davranışı:


Görev tamamlanırsa
bildirim otomatik okundu yapılır


---

# Bildirim Kuralları

Bildirimler sadece **manuel görevler** için oluşturulur.

Canlı görevler:


BİLDİRİM ÜRETMEZ


Manuel görev tamamlanınca:


bildirim → okundu


---

# Checklist Sistemi

Checklist lokasyon bazlı değil, **şablon bazlıdır**.


checklist_sablonlari
checklist_sablon_maddeleri
checklist_results


---

## Checklist Şablonu

Şablon içeriği:

- başlık
- tanım
- maddeler

Madde özellikleri:


dropdown cevap
zorunlu/opsiyonel
açıklama
görsel ekleme


---

# QR / NFC Akışı


QR okut
↓
token çöz
↓
lokasyon bul
↓
ACIK görevleri getir
↓
checklist varsa doldur
↓
task completion
↓
checklist_results kayıt


---

# Görev Tamamlama Kuralları

Görev tamamlanamaz eğer:


durum != ACIK


Eğer görev kullanıcıya atanmışsa:


sadece o kullanıcı tamamlayabilir


---

# Profil Ayarları

Profil ekranında:

- ad soyad
- telefon
- adres
- TC no
- profil foto

Ek özellikler:

## Email değiştirme

Kullanıcı:


yeni email
mevcut şifre


girmek zorundadır.

Kontroller:


email format
email kullanımda mı
şifre doğrulama


---

## Şifre değiştirme

Kurallar:


minimum 6 karakter


---

# Son Stabil Sürüm


QRSYNC_revize_email_fix_v4.zip


---

# Kritik Kararlar

1. Checklist sistemi **şablon bazlıdır**
2. QR/NFC yalnızca **ACIK görevleri görür**
3. Canlı görevler **bildirim üretmez**
4. Manuel görev tamamlanınca bildirim **otomatik okundu olur**

---

# Açık Geliştirme Alanları

- checklist sonuç snapshot sistemi
- template_version kullanımı
- checklist media yönetimi
- audit log sistemi
- güvenlik logları
- cihaz doğrulama

---

# Geliştirme Kuralı

Yeni değişiklik yapılırken:

- mevcut mimari bozulmamalı
- checklist sistemi korunmalı
- QR/NFC görev motoru değiştirilmemeli

## Son eklenen modül
- Lokasyon Grupları: SA ve TA için yeni yönetim sayfası. Lokasyon grupları oluşturulabiliyor, grup içine lokasyonlar çoklu seçilebiliyor ve kayıtlar üst/alt lokasyon yolları ile listeleniyor. Yeni tablo ihtiyacı: lokasyon_gruplari + lokasyon_grup_uyeleri.
