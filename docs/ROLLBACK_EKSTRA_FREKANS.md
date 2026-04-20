# GERİ YÜKLEME NOKTASI — Ekstra Frekansiyel Tasarımı

**Oluşturuldu:** 2026-04-20
**Tag:** `pre-ekstra-frekans-v1`
**Commit:** `e6fbb40` (feat: Mobil görev iptali — manuel sebep + Kayıp Frekanslar entegrasyonu)

## Ne için?

Ekstra frekansiyel görev sistemi (frekans dışı / mobilden eklenen ekstra görevler) entegrasyonundan önceki stabil sürüm. Rapor hesaplarının veya mobil akışın bozulması durumunda bu noktaya dönülecek.

## Kapsam

Tag bu noktaya kadar olan tüm geliştirmeleri içerir:

- Dashboard border-glow animasyonu (tüm bloklar)
- Mobil manuel görev iptali endpoint'i + Kayıp Frekanslar entegrasyonu
- Sistem Logları + Uyarılar (sekmeli yapı)
- Push bildirim sistemi, bildirim izni takibi
- Veri güvenliği (atomik arşivleme, audit_log)
- Haftalık frekans kuralları, süre ayarları
- İOGYS rebrand
- Railway cron (arşiv) sistemi

## Nasıl geri dönülür?

### Git (Kod)

```bash
# Mevcut uncommitted değişiklikleri kontrol et
git status

# Ekstra frekansiyel uygulama sonrası bir sorun çıkarsa:
git reset --hard pre-ekstra-frekans-v1

# Remote'a bu state'i zorla (DİKKAT: sadece acil durumda)
git push origin main --force-with-lease
```

### Supabase (DB Schema)

Ekstra frekansiyel için planlanan değişiklikler:
- (Muhtemelen) `canli_gorevler.kaynak text` kolonu — migration uygulanırsa
- Rapor tarafında `kural_id` filtresi — sadece kod, DB'ye dokunmaz

**Rollback SQL (eğer `kaynak` kolonu eklendiyse):**

```sql
ALTER TABLE canli_gorevler        DROP COLUMN IF EXISTS kaynak;
ALTER TABLE canli_gorevler_arsiv  DROP COLUMN IF EXISTS kaynak;
```

**NOT:** Eğer yaklaşım migration-less (sadece `kural_id IS NULL` filtresi) ise DB rollback gerekmez.

### Veri geri yükleme (ekstra görev kayıtları silinirse)

Mobilden eklenen ekstra görev kayıtları (`canli_gorevler WHERE kural_id IS NULL`) hatalı oluşursa:

```sql
-- ÖNCE BACKUP ALIN!
-- Etkilenen kayıtları görüntüle
SELECT id, tanim, lokasyon_id, tamamlanma_tarihi, olusturan_id
FROM canli_gorevler
WHERE kural_id IS NULL
  AND tamamlanma_tarihi >= '2026-04-20T00:00:00Z';

-- Gerekirse sil (WHERE şartını daraltarak)
-- DELETE FROM canli_gorevler WHERE kural_id IS NULL AND ...;
```

## Değişikliklerin etkilediği dosyalar (beklenen)

- `lib/reports/genel-rapor-data.ts` — rapor hesaplama
- `components/reports/GenelRaporKarti.tsx` — UI
- `app/api/app/ekstra-frekans/route.ts` — yeni endpoint
- `app/api/app/aktif-gorev/route.ts` — "ekstra_eklenebilir" flag'i eklenirse
- Mobil dokümanı: `docs/MOBIL_EKIBE_EKSTRA_FREKANS.md` (yeni)

## Kontrol listesi (rollback öncesi)

- [ ] Uncommitted değişiklikler stash'landı mı?
- [ ] Neden rollback yapılıyor, sebep dokümante edildi mi?
- [ ] Supabase migration uygulandıysa rollback SQL hazır mı?
- [ ] Railway deployment durduruldu mu (rollback süresince)?
- [ ] Sorun mobil tarafta mı backend tarafında mı tespit edildi?
