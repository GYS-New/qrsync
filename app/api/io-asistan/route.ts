import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })

// Rate limiter
const rateLimitMap = new Map<string, number[]>()
function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const timestamps = (rateLimitMap.get(userId) || []).filter(t => now - t < 60_000)
  if (timestamps.length >= 15) return false
  timestamps.push(now)
  rateLimitMap.set(userId, timestamps)
  return true
}

// ── Tool tanımları ──
// Ortak proje parametresi — tüm tool'larda kullanılır
const PROJE_PARAM = {
  proje_adi: { type: 'string', description: 'Proje adı (örn: "Oyak Renault"). Proje adından ID otomatik çözümlenir.' },
}

const tools: Anthropic.Tool[] = [
  {
    name: 'projeleri_listele',
    description: 'Kullanıcının erişebildiği projelerin listesini getirir. Proje adı, firma adı ve ID bilgileri. Kullanıcı hangi proje için sorduğunu belirtmediğinde önce bu tool ile projeleri listele ve kullanıcıya sor.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'bugunku_mesai',
    description: 'Bugün mesaiye giriş yapan personellerin listesini getirir. Giriş/çıkış saatleri ve süreleri ile birlikte.',
    input_schema: {
      type: 'object' as const,
      properties: { ...PROJE_PARAM },
      required: [],
    },
  },
  {
    name: 'gorev_ozeti',
    description: 'Spesifik görevlerin durum özetini getirir. Oluşturulan ve tamamlanan görev sayıları (AÇIK, İŞLEMDE, TAMAMLANDI, İPTAL).',
    input_schema: {
      type: 'object' as const,
      properties: {
        tarih: { type: 'string', description: 'Tarih filtresi YYYY-MM-DD formatında (varsayılan: bugün)' },
        ...PROJE_PARAM,
      },
      required: [],
    },
  },
  {
    name: 'canli_gorev_durumu',
    description: 'Frekansiyel (canlı) görevlerin durum özetini getirir. Kaç tanesi tamamlandı, işlemde, beklemede, gecikmiş vs. Tamamlanamayan görevleri de gösterir.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tarih: { type: 'string', description: 'Tarih filtresi YYYY-MM-DD (varsayılan: bugün)' },
        durum: { type: 'string', description: 'Belirli durum filtresi: TAMAMLANDI, ACIK, ISLEMDE, BEKLEMEDE, IPTAL, ZAMANINDA_YAPILAMAYAN, ZAMANI_GECMIS (opsiyonel)' },
        ...PROJE_PARAM,
      },
      required: [],
    },
  },
  {
    name: 'musteri_degerlendirmeleri',
    description: 'Son müşteri değerlendirmelerini getirir. Yıldız puanı, yorum, tarih bilgisi.',
    input_schema: {
      type: 'object' as const,
      properties: {
        limit: { type: 'number', description: 'Kaç kayıt getirilsin (varsayılan: 10)' },
        ...PROJE_PARAM,
      },
      required: [],
    },
  },
  {
    name: 'personel_listesi',
    description: 'Aktif personel listesini getirir. İsim, rol, email bilgileri.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sadece_aktif: { type: 'boolean', description: 'Sadece aktif kullanıcıları getir (varsayılan: true)' },
        ...PROJE_PARAM,
      },
      required: [],
    },
  },
  {
    name: 'lokasyon_bilgisi',
    description: 'Lokasyonların listesini veya detayını getirir.',
    input_schema: {
      type: 'object' as const,
      properties: {
        arama: { type: 'string', description: 'Lokasyon adıyla arama (opsiyonel)' },
        ...PROJE_PARAM,
      },
      required: [],
    },
  },
  {
    name: 'checklist_ozeti',
    description: 'Çeklist sonuçlarının özetini getirir. Ortalama skor, tamamlanma oranı.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tarih: { type: 'string', description: 'Tarih filtresi YYYY-MM-DD (varsayılan: bugün)' },
        ...PROJE_PARAM,
      },
      required: [],
    },
  },
  {
    name: 'arsiv_ozeti',
    description: 'Arşiv tablolarındaki kayıt sayılarını getirir.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tablo: { type: 'string', description: 'Belirli arşiv tablosu (opsiyonel): personel_mesai, musteri, gorevler, checklist.' },
      },
      required: [],
    },
  },
]

// ── Tool çalıştırıcılar ──
type ToolContext = { firmaId: string | null; projeId: string | null; isSA: boolean }

// Proje adından ID çözümle
async function resolveProjeId(
  supabase: ReturnType<typeof createClient>,
  projeAdi: string | undefined,
  ctx: ToolContext
): Promise<string | null> {
  if (!projeAdi) return ctx.projeId
  const { data } = await supabase
    .from('projeler')
    .select('id,ad')
    .ilike('ad', `%${projeAdi}%`)
    .limit(5)
  if (!data?.length) return null
  if (data.length === 1) return data[0].id
  // Tam eşleşme ara
  const exact = data.find(p => p.ad.toLowerCase() === projeAdi.toLowerCase())
  return exact ? exact.id : data[0].id
}

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  const today = new Date().toISOString().split('T')[0]
  // Proje çözümle (tool'dan gelen proje_adi parametresi)
  const projeAdi = input.proje_adi as string | undefined
  const projeId = await resolveProjeId(supabase, projeAdi, ctx)
  if (projeAdi && !projeId) return `"${projeAdi}" adında bir proje bulunamadı.`
  const projeLabel = projeAdi ? ` (${projeAdi})` : ''

  try {
    switch (name) {
      case 'projeleri_listele': {
        let q = supabase.from('projeler').select('id,ad,firmalar!firma_id(firma_adi)').order('ad')
        if (!ctx.isSA && ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
        const { data, error } = await q
        if (error) return `Hata: ${error.message}`
        if (!data?.length) return 'Erişebileceğiniz proje bulunamadı.'
        return `Projeler (${data.length}):\n` +
          data.map((p: Record<string, unknown>) => {
            const firma = p.firmalar as Record<string, unknown> | null
            return `• ${p.ad}${firma?.firma_adi ? ` — ${firma.firma_adi}` : ''}`
          }).join('\n') +
          '\n\nHangi proje için bilgi almak istediğinizi belirtin.'
      }
      case 'bugunku_mesai': {
        // TRT bugün hesapla (UTC+3)
        const trtNow = new Date(Date.now() + 3 * 60 * 60 * 1000)
        const bugun = trtNow.toISOString().split('T')[0]
        let q = supabase
          .from('personel_mesai_kayitlari')
          .select('id,user_id,giris_saati,cikis_saati,giris_tipi,cikis_tipi,arsivlendi,users!user_id(isim_soyisim)')
          .eq('kayit_tarihi', bugun)
          .eq('arsivlendi', false)
          .order('giris_saati', { ascending: true })
          .limit(50)
        if (!ctx.isSA && ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
        if (projeId) q = q.eq('proje_id', projeId)
        const { data, error } = await q
        if (error) return `Hata: ${error.message}`
        if (!data?.length) return `Bugün henüz mesaiye giriş yapan personel yok${projeLabel}.`
        return `Bugün (${bugun}) Mesai Kayıtları${projeLabel} (${data.length} kişi):\n` +
          data.map((r: Record<string, unknown>) => {
            const user = r.users as Record<string, unknown> | null
            const isim = user?.isim_soyisim || 'Bilinmiyor'
            const giris = r.giris_saati ? new Date(r.giris_saati as string).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '-'
            const cikis = r.cikis_saati ? new Date(r.cikis_saati as string).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : 'Henüz çıkış yapmadı'
            return `• ${isim}: Giriş ${giris} (${r.giris_tipi}), Çıkış: ${cikis}`
          }).join('\n')
      }

      case 'gorev_ozeti': {
        const tarih = (input.tarih as string) || today
        // Oluşturulan görevler
        let qOlusturulan = supabase
          .from('gorevler')
          .select('durum')
          .gte('olusturma_tarihi', `${tarih}T00:00:00`)
          .lte('olusturma_tarihi', `${tarih}T23:59:59`)
        if (!ctx.isSA && ctx.firmaId) qOlusturulan = qOlusturulan.eq('firma_id', ctx.firmaId)
        if (projeId) qOlusturulan = qOlusturulan.eq('proje_id', projeId)
        // Tamamlanan görevler (farklı günde oluşturulmuş olabilir)
        let qTamamlanan = supabase
          .from('gorevler')
          .select('id')
          .gte('tamamlanma_tarihi', `${tarih}T00:00:00`)
          .lte('tamamlanma_tarihi', `${tarih}T23:59:59`)
        if (!ctx.isSA && ctx.firmaId) qTamamlanan = qTamamlanan.eq('firma_id', ctx.firmaId)
        if (projeId) qTamamlanan = qTamamlanan.eq('proje_id', projeId)

        const [olusRes, tamRes] = await Promise.all([qOlusturulan, qTamamlanan])
        if (olusRes.error) return `Hata: ${olusRes.error.message}`
        const data = olusRes.data ?? []
        const tamamlananBugun = tamRes.data?.length ?? 0
        if (!data.length && !tamamlananBugun) return `${tarih} tarihinde spesifik görev kaydı yok${projeLabel}.`
        const counts: Record<string, number> = {}
        data.forEach((r: { durum: string }) => { counts[r.durum] = (counts[r.durum] || 0) + 1 })
        const total = data.length
        return `${tarih} Spesifik Görev Özeti${projeLabel}:\n` +
          `• Toplam oluşturulan: ${total}\n` +
          Object.entries(counts).map(([k, v]) => `• ${k}: ${v}`).join('\n') +
          `\n• Bugün tamamlanan: ${tamamlananBugun}`
      }

      case 'canli_gorev_durumu': {
        const tarih = (input.tarih as string) || today
        // Bugünkü frekansiyel görevler (aktif_olma_tarihi ile — görevler gece oluşturulup gündüz aktif olur)
        let qOlusturulan = supabase
          .from('canli_gorevler')
          .select('durum')
          .gte('aktif_olma_tarihi', `${tarih}T00:00:00`)
          .lte('aktif_olma_tarihi', `${tarih}T23:59:59`)
        if (!ctx.isSA && ctx.firmaId) qOlusturulan = qOlusturulan.eq('firma_id', ctx.firmaId)
        if (projeId) qOlusturulan = qOlusturulan.eq('proje_id', projeId)
        const durumFiltre = input.durum as string | undefined
        if (durumFiltre) qOlusturulan = qOlusturulan.eq('durum', durumFiltre)
        // Tamamlanan frekansiyel görevler
        let qTamamlanan = supabase
          .from('canli_gorevler')
          .select('id')
          .gte('tamamlanma_tarihi', `${tarih}T00:00:00`)
          .lte('tamamlanma_tarihi', `${tarih}T23:59:59`)
        if (!ctx.isSA && ctx.firmaId) qTamamlanan = qTamamlanan.eq('firma_id', ctx.firmaId)
        if (projeId) qTamamlanan = qTamamlanan.eq('proje_id', projeId)

        const [olusRes, tamRes] = await Promise.all([qOlusturulan, qTamamlanan])
        if (olusRes.error) return `Hata: ${olusRes.error.message}`
        const frekData = olusRes.data ?? []
        const frekTamamlananBugun = tamRes.data?.length ?? 0
        if (!frekData.length && !frekTamamlananBugun) return `${tarih} tarihinde frekansiyel görev kaydı yok${projeLabel}.`
        const frekCounts: Record<string, number> = {}
        frekData.forEach((r: { durum: string }) => { frekCounts[r.durum] = (frekCounts[r.durum] || 0) + 1 })
        const frekTotal = frekData.length
        // Tamamlanamayan = AÇIK + GECİKMİŞ + ZAMANINDA_YAPILMAYAN
        const tamamlanamayan = (frekCounts['ACIK'] ?? 0) + (frekCounts['ZAMANI_GECMIS'] ?? 0) + (frekCounts['ZAMANINDA_YAPILAMAYAN'] ?? 0)
        return `${tarih} Frekansiyel Görev Durumu${projeLabel}:\n` +
          `• Toplam aktif görev: ${frekTotal}\n` +
          Object.entries(frekCounts).map(([k, v]) => `• ${k}: ${v}`).join('\n') +
          `\n• Bugün tamamlanan: ${frekTamamlananBugun}` +
          (tamamlanamayan > 0 ? `\n• Tamamlanamayan: ${tamamlanamayan}` : '')
      }

      case 'musteri_degerlendirmeleri': {
        const limit = (input.limit as number) || 10
        let q = supabase
          .from('musteri_degerlendirmeleri')
          .select('yildiz,yorum,ad_soyad,olusturma_tarihi,lokasyonlar!lokasyon_id(tanim)')
          .order('olusturma_tarihi', { ascending: false })
          .limit(limit)
        if (!ctx.isSA && ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
        if (projeId) q = q.eq('proje_id', projeId)
        const { data, error } = await q
        if (error) return `Hata: ${error.message}`
        if (!data?.length) return `Henüz müşteri değerlendirmesi yok${projeLabel}.`
        const avg = data.reduce((s: number, r: Record<string, unknown>) => s + (r.yildiz as number || 0), 0) / data.length
        return `Son ${data.length} Değerlendirme${projeLabel} (Ort: ${avg.toFixed(1)}/5):\n` +
          data.map((r: Record<string, unknown>) => {
            const lok = r.lokasyonlar as Record<string, unknown> | null
            const tarih = r.olusturma_tarihi ? new Date(r.olusturma_tarihi as string).toLocaleDateString('tr-TR') : ''
            return `• ${'⭐'.repeat(r.yildiz as number || 0)} ${r.ad_soyad || 'Anonim'} — ${lok?.tanim || ''} (${tarih})${r.yorum ? ': "' + r.yorum + '"' : ''}`
          }).join('\n')
      }

      case 'personel_listesi': {
        const sadece_aktif = input.sadece_aktif !== false
        let q = supabase
          .from('users')
          .select('isim_soyisim,email,rol,aktif')
          .in('rol', ['tenant_user', 'tenant_admin'])
          .order('isim_soyisim')
          .limit(50)
        if (!ctx.isSA && ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
        if (projeId) q = q.eq('proje_id', projeId)
        if (sadece_aktif) q = q.eq('aktif', true)
        const { data, error } = await q
        if (error) return `Hata: ${error.message}`
        if (!data?.length) return `Kayıtlı personel bulunamadı${projeLabel}.`
        return `Personel Listesi${projeLabel} (${data.length} kişi):\n` +
          data.map((r: Record<string, unknown>) => `• ${r.isim_soyisim} (${r.rol === 'tenant_admin' ? 'Yönetici' : 'Personel'}) — ${r.email}`).join('\n')
      }

      case 'lokasyon_bilgisi': {
        const arama = input.arama as string | undefined
        let q = supabase
          .from('lokasyonlar')
          .select('id,tanim,aktif,ust_lokasyon_id')
          .eq('aktif', true)
          .order('tanim')
          .limit(30)
        if (!ctx.isSA && ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
        if (projeId) q = q.eq('proje_id', projeId)
        if (arama) q = q.ilike('tanim', `%${arama}%`)
        const { data, error } = await q
        if (error) return `Hata: ${error.message}`
        if (!data?.length) return arama ? `"${arama}" ile eşleşen lokasyon bulunamadı${projeLabel}.` : `Kayıtlı lokasyon yok${projeLabel}.`
        return `Lokasyonlar${projeLabel} (${data.length}):\n` +
          data.map((r: Record<string, unknown>) => `• ${r.tanim}${r.ust_lokasyon_id ? ' (alt lokasyon)' : ''}`).join('\n')
      }

      case 'checklist_ozeti': {
        const tarih = (input.tarih as string) || today
        const { data, error } = await supabase
          .from('checklist_sonuc_basliklari')
          .select('skor')
          .gte('created_at', `${tarih}T00:00:00`)
          .lte('created_at', `${tarih}T23:59:59`)
        if (error) return `Hata: ${error.message}`
        if (!data?.length) return `${tarih} tarihinde tamamlanmış çeklist yok.`
        const skorlar = data.map((r: { skor: number | null }) => r.skor).filter((s): s is number => s !== null)
        const avg = skorlar.length ? skorlar.reduce((a, b) => a + b, 0) / skorlar.length : 0
        return `${tarih} Çeklist Özeti:\n• Toplam: ${data.length}\n• Ortalama Skor: %${avg.toFixed(0)}\n• En Düşük: %${Math.min(...skorlar)}\n• En Yüksek: %${Math.max(...skorlar)}`
      }

      case 'arsiv_ozeti': {
        const tablo = input.tablo as string | undefined
        const results: string[] = []

        if (!tablo || tablo === 'personel_mesai') {
          const { count } = await supabase.from('personel_mesai_kayitlari_arsiv').select('id', { count: 'exact', head: true })
          results.push(`• Mesai Arşivi: ${count ?? 0} kayıt`)
        }
        if (!tablo || tablo === 'musteri') {
          const { count } = await supabase.from('musteri_degerlendirmeleri_arsiv').select('id', { count: 'exact', head: true })
          results.push(`• Müşteri Değerlendirme Arşivi: ${count ?? 0} kayıt`)
        }
        if (!tablo || tablo === 'gorevler') {
          const { count } = await supabase.from('gorevler_arsiv').select('id', { count: 'exact', head: true })
          results.push(`• Spesifik Görev Arşivi: ${count ?? 0} kayıt`)
        }
        if (!tablo || tablo === 'checklist') {
          const { count: baslikCount } = await supabase.from('checklist_sonuc_basliklari_arsiv').select('id', { count: 'exact', head: true })
          const { count: maddeCount } = await supabase.from('checklist_sonuc_maddeleri_arsiv').select('id', { count: 'exact', head: true })
          results.push(`• Çeklist Arşivi: ${baslikCount ?? 0} başlık, ${maddeCount ?? 0} madde`)
        }

        // canli_gorevler arşivi (ana arşiv tablosu olmayabilir, gorevler_arsiv zaten var)
        return results.length ? `Arşiv Özeti:\n${results.join('\n')}` : 'Arşiv verisi bulunamadı.'
      }

      default:
        return 'Bilinmeyen tool.'
    }
  } catch (err) {
    return `Sorgu hatası: ${err instanceof Error ? err.message : String(err)}`
  }
}

// ── System Prompt ──
function buildSystemPrompt(user: { isim_soyisim: string; rol: string }): string {
  const roleMap: Record<string, string> = {
    super_admin: 'Sistem yöneticisi — tüm firma ve projelere tam erişim',
    alt_super_admin: 'Alt sistem yöneticisi — tüm firma ve projelere erişim',
    tenant_admin: 'Firma yöneticisi — kendi firmasının tüm projelerine erişim',
    tenant_user: 'Saha personeli — atanan görevler ve lokasyonlara erişim',
    musteri: 'Müşteri — hizmet kalitesi takibi ve değerlendirme',
  }

  return `Sen İO Asistan'sın — İOGYS (İO Görev Yönetim Sistemi) yapay zeka asistanısın.
İO Teknoloji tarafından geliştirilen bu sistemi kullanıcılara tanıtıyor ve yardımcı oluyorsun.
Veritabanına erişim tool'ların var — kullanıcı veri sorusu sorduğunda ilgili tool'u çağır.

## PROJE BAZLI SORGULAMA (ÇOK ÖNEMLİ)
- Tüm veri sorguları PROJE BAZLI yapılmalıdır.
- Kullanıcı bir proje adı belirtmişse (örn: "Oyak Renault"), tool'a proje_adi parametresi olarak gönder.
- Kullanıcı proje belirtmemişse ve birden fazla proje varsa, ÖNCE projeleri_listele tool'unu çağır ve kullanıcıya "Hangi proje için bilgi almak istiyorsunuz?" diye sor.
- Kullanıcının tek projesi varsa veya önceki mesajlarda proje belirtilmişse, o projeyi kullan.
- "Dün tamamlanamayan görevler" gibi sorularda tarih parametresini dünün tarihi olarak ayarla.

## İOGYS Nedir?
Profesyonel temizlik ve tesis yönetimi firmalarının saha operasyonlarını dijital olarak yönetmelerine olanak tanıyan bir QR & NFC tabanlı platformdur.

## Sidebar Menü Yapısı
Kullanıcılara yönlendirme yaparken bu menü isimlerini AYNEN kullan:

### Ana Menü
- **Gösterge Paneli** → /dashboard — Ana sayfa. KPI blokları: canlı işlemler, aktivite grafiği, frekansiyel görev analizi, lokasyon görev analizi, son görevler, aktif kullanıcılar, günlük performans, personel başarı analizi.

### Yönetim Sayfaları
- **Canlı Görev Akışı** → /dashboard/canli-islemler — Frekansiyel görevlerin anlık durumu. Filtreler: Tümü, Tamamlandı, İşlemde, Beklemede, İptal, Gecikmiş.
- **Firmalar** → /dashboard/firmalar — Sadece SA. Firma oluştur/düzenle.
- **Firma Adminleri** → /dashboard/firma-adminler — Sadece SA.
- **Firma Kullanıcıları** → /dashboard/firma-kullanicilar — Sadece SA.
- **Kullanıcılar** → /dashboard/kullanicilar — TA/TU. Kullanıcı oluştur/düzenle/sil. Excel import/export.
- **Projeler** → /dashboard/projeler — Proje oluştur/yönet.
- **Lokasyonlar** → /dashboard/lokasyonlar — Hiyerarşik ağaç. QR/NFC bağlama, Excel import/export, QR kod indirme.
- **Lokasyon Grupları** → /dashboard/lokasyon-gruplari — Grupla, fiyatlandırma/raporlama için.
- **Spesifik Görevler** → /dashboard/gorevler — Tek seferlik görev oluştur/atama/takip. Durum: AÇIK→İŞLEMDE→TAMAMLANDI/İPTAL.
- **Frekansiyel Görevler** → /dashboard/canli-islemler/tum-gorevler — Tekrarlayan görev KURALLARI. Cron ile otomatik görev üretir.
- **Checklist Şablonları** → /dashboard/checklist-sablonlari — Kontrol listesi oluştur/düzenle, skor hesaplama.
- **Görev Duraklatmaları** → /dashboard/gorev-duraklatmalari — Sadece TU.
- **Personel Takibi** → /dashboard/personel-takibi — GPS takip, QR kod üretme, mesai kaydı.
- **Birim Fiyatlar** → /dashboard/birim-fiyatlar — Lokasyon/grup bazlı fiyat. Hakedis raporunda kullanılır.
- **Raporlar** → /dashboard/raporlar — Çeklist, Grafiksel, Hakedis, Ham Veri, Müşteri, Özelleştir, Süre Analiz, Hızlı Rapor, Şablon Yönetimi.
- **Arşiv** → /dashboard/arsiv — 24+ saat eski kayıtlar otomatik arşivlenir.

### Sistem
- **Profil Ayarları** → /dashboard/ayarlar
- **Sistem Ayarları** → /dashboard/sistem-ayarlari — SA/TA. Yetkililer, SMTP, konfigurasyon, dashboard düzeni.
- **Dashboard Ayarları** → /dashboard/ayarlar/dashboard

## Kullanıcı: ${user.isim_soyisim} | Rol: ${roleMap[user.rol] || user.rol}

## Kurallar
- Türkçe yanıt ver, kısa ve net
- Veri sorusu gelince tool çağır, tahmin etme
- Sidebar menü isimlerini AYNEN kullan
- Adım adım rehberlik et
- Kullanıcının rolüne uygun öneriler ver
- Emoji az kullan`
}

// ── API Route ──
export async function POST(request: Request) {
  const supabase = createClient()

  const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !authUser) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const { data: me } = await supabase
    .from('users')
    .select('id,rol,isim_soyisim,firma_id,proje_id')
    .eq('id', authUser.id)
    .single()

  if (!me) {
    return new Response(JSON.stringify({ error: 'user_not_found' }), { status: 404 })
  }

  if (!checkRateLimit(me.id)) {
    return new Response(JSON.stringify({ error: 'rate_limit' }), { status: 429 })
  }

  const body = await request.json()
  const messages: Anthropic.MessageParam[] = (body.messages || []).slice(-20)

  if (!messages.length) {
    return new Response(JSON.stringify({ error: 'invalid_messages' }), { status: 400 })
  }

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const toolCtx: ToolContext = { firmaId: me.firma_id, projeId: me.proje_id, isSA }

  try {
    // İlk çağrı — tool use olabilir
    let response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: buildSystemPrompt(me),
      tools,
      messages,
    })

    // Tool use döngüsü (max 3 iterasyon)
    const allMessages: Anthropic.MessageParam[] = [...messages]
    let iterations = 0

    while (response.stop_reason === 'tool_use' && iterations < 3) {
      iterations++
      const toolBlocks = response.content.filter(
        (b): b is Anthropic.ContentBlock & { type: 'tool_use' } => b.type === 'tool_use'
      )

      // Assistant mesajını ekle
      allMessages.push({ role: 'assistant', content: response.content })

      // Tool sonuçlarını çalıştır
      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolBlocks.map(async (tb) => ({
          type: 'tool_result' as const,
          tool_use_id: tb.id,
          content: await executeTool(tb.name, tb.input as Record<string, unknown>, toolCtx, supabase),
        }))
      )

      allMessages.push({ role: 'user', content: toolResults })

      // Tekrar Claude'a gönder
      response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: buildSystemPrompt(me),
        tools,
        messages: allMessages,
      })
    }

    // Son cevabı çıkar
    const textBlock = response.content.find(b => b.type === 'text')
    const finalText = textBlock && 'text' in textBlock ? textBlock.text : 'Yanıt oluşturulamadı.'

    // SSE formatında döndür (frontend uyumu için)
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: finalText })}\n\n`))
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[io-asistan] API error:', errMsg)
    return new Response(JSON.stringify({ error: 'api_error', detail: errMsg }), { status: 500 })
  }
}
