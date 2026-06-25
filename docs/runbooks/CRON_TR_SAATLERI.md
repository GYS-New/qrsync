# Cron Schedule'ları — TR Saati Haritası

## Durum

Supabase pg_cron 1.6.4 çalışıyor, `cron.timezone='GMT'` (varsayılan). pg_cron schedule expression'ları UTC olarak yorumlanır.

Türkiye'de DST yok (2016'dan beri sabit UTC+3) → **TR = UTC + 3 saat**, yıl boyu sabit.

Mevcut tüm schedule'lar UTC olarak yazılmış ama doğru TR saatlerine denk gelecek şekilde çevrilmiş. Sistem zaten doğru tetikleniyor; bu doküman okuma/yönetim netliği içindir.

## Aktif cron job'lar (canlı DB)

| Job | UTC Schedule | TR Karşılığı | Açıklama |
|---|---|---|---|
| `qrsync-gece-dongu` | `30 20 * * *` | **23:30 TR** her gün | `gece_tam_dongu()` — durum geçişleri + arşivleme + ertesi günün kural-bazlı görevlerini üretir (mig 095 sonrası proje override destekli) |
| `qrsync-duraklatma-temizle` | `5 21 * * *` | **00:05 TR** her gün | Geçmiş tarihli `kural_duraklatmalari` kayıtlarını siler |
| `qrsync-gun-ici-durum` | `*/1 * * * *` | **her dakika** | `gun_ici_durum_guncelle()` — HAZIR→ACIK→BEKLEMEDE→ZAMANI_GECMIS geçişleri (görev başına override süreleriyle) |
| `qrsync-vardiya-bildirim` | `*/5 * * * *` | **her 5 dk** | Vardiya bitiminden 10-20dk sonra performans push'u (proje vardiya saatlerine göre dinamik tetikleme penceresi) |
| `oto-yikama-gorev-uret` | `55 20 * * *` | **23:55 TR** her gün | Ertesi gün için yıkama görevleri üret |
| `oto-yikama-yapilamadi` | `0 21 * * *` | **00:00 TR** her gün | ACIK kalan dünün yıkama görevlerini YAPILAMADI'ya çek |
| `oto-yikama-hazir-acik` | `1 21 * * *` | **00:01 TR** her gün | Bugünün HAZIR yıkama görevlerini ACIK'a geçir |
| `oto-yikama-arsiv` | `30 21 * * *` | **00:30 TR** her gün | Tamamlanan yıkama görevlerini arşive taşı |
| `oto-yikama-islemde-iptal` | `0 * * * *` | **her saat başı** | Uzun süre ISLEMDE kalan yıkama görevlerini iptal et |
| `oto-yikama-rapor-gonder` | `*/15 * * * *` | **her 15 dk** | Yıkama günlük raporu gönder (rapor saati gelince) |
| `mobil_anket_cevap_temizlik` | `30 3 1 * *` | **her ayın 1'i 06:30 TR** | 180 günden eski mobil anketleri sil |
| `mobil_hata_log_temizlik` | `0 3 * * *` | **06:00 TR** her gün | 30 günden eski mobil hata loglarını sil |

## Çanakkale Projesi (V1=00-08, V2=08-16, V3=16-24) İçin Vardiya Bildirimi Tetikleme Saatleri

`qrsync-vardiya-bildirim` her 5dk çalışır; bitiş + 10-20dk penceresinde tek tetikleme:

| Vardiya | Bitiş (TR) | Bildirim Penceresi (TR) |
|---|---|---|
| V1 (00:00 – 08:00) | 08:00 | **08:10 – 08:20** |
| V2 (08:00 – 16:00) | 16:00 | **16:10 – 16:20** |
| V3 (16:00 – 24:00) | 24:00 | **00:10 – 00:20** (ertesi gün) |

OYAK RENAULT (V1 23:30-07:30 sarkan) bağımsız tetiklenir.

## TR Timezone'a Geçiş (Opsiyonel — Cluster Restart Gerekli)

pg_cron 1.6+ `cron.timezone` GUC desteğine sahip ama `PGC_POSTMASTER` seviyesi → değişiklik için **Postgres restart şart**.

### Adımlar

1. **Bakım penceresi seç** — düşük trafik (örn Pazar gecesi 04:00 TR). Web + mobil ~30sn etkilenir (ekran 500, otomatik retry'lar başarılı olur).
2. **Supabase Dashboard → Project Settings → Restart project** (veya MCP `mcp__claude_ai_Supabase__pause_project` + bekle + `restore_project`).
3. **Restart tamamlandıktan sonra** [docs/migrations/096_cron_timezone_tr.sql](../migrations/096_cron_timezone_tr.sql) migration'ını apply et.

### Restart Sonrası

- Tüm 12 cron job'unun schedule'ı TR saatinde okunur olur (`30 23 * * *` = 23:30 TR doğrudan)
- Tetiklenme saatleri **DEĞİŞMEZ** — sadece schedule expression görsel olarak TR'ye geçer
- `cron.timezone='Europe/Istanbul'` set edilir, gelecek `cron.schedule()` çağrıları da TR olarak yorumlanır

### Restart YAPMAMA Sonucu

Sıfır risk. Sistem zaten doğru saatlerde tetikleniyor (UTC schedule'lar TR'ye doğru çevrilmiş).
Sadece DB admin'in cron schedule'ları okurken kafa karışıklığı yaşaması — operasyonel maliyet düşük.

## Önemli Notlar

- TR'de DST yok → UTC ↔ TR çevrimi yıl boyu sabit, aynı schedule sürekli aynı TR saatine denk gelir
- `cron.timezone` cluster-wide; her job için ayrı timezone (pg_cron'da) yok
- pg_cron yeni job eklerken `cron.timezone='Europe/Istanbul'` varsa yeni schedule otomatik TR olarak yorumlanır
