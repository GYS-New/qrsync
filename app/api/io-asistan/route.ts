import Anthropic from '@anthropic-ai/sdk'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getSistemKonfig } from '@/lib/config/getSistemKonfig'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getYetkiliLokasyonIds } from '@/lib/yetki/getLokasyonYetki'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'

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
    description: 'Aktif personel listesini getirir. İsim, rol, email bilgileri. Görev oluşturma akışında kullanıcının atanacak personel seçimi yapması gerektiğinde de bu tool çağırılır — yanıtına [SECENEKLER]isim1|isim2|...[/SECENEKLER] marker\'ı ekleyerek tıklanabilir buton göster. Kullanıcı bayan/erkek filtresi isterse cinsiyet parametresini kullan (K/E). İsim arıyorsa arama parametresini kullan.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sadece_aktif: { type: 'boolean', description: 'Sadece aktif kullanıcıları getir (varsayılan: true)' },
        cinsiyet: { type: 'string', description: 'Cinsiyet filtresi: "K" (kadın/bayan) veya "E" (erkek). Boş bırakılırsa hepsi.' },
        arama: { type: 'string', description: 'İsim içinde arama (ilike). Örn: "nur" → NUR DEMİREL, NURCAN, ONUR...' },
        limit: { type: 'number', description: 'Maks sonuç sayısı (varsayılan: 200)' },
        ...PROJE_PARAM,
      },
      required: [],
    },
  },
  {
    name: 'lokasyon_bilgisi',
    description: 'Lokasyonların listesini veya detayını getirir. SA/TA tüm lokasyonları, U/M sadece atandığı (kullanici_lokasyon_yetkileri) üst lokasyonlar ve onların altlarını görür. "Kaç lokasyonum var" sorusunda sadece_say=true kullan. Kullanıcı görev oluşturma akışında lokasyon seçmek istediğinde de bu tool çağırılır — yanıtına [SECENEKLER]lokasyon1|lokasyon2|...[/SECENEKLER] marker\'ı ekleyerek tıklanabilir buton göster (max 10 seçenek).',
    input_schema: {
      type: 'object' as const,
      properties: {
        arama: { type: 'string', description: 'Lokasyon adıyla arama — kelime bazlı ilike (opsiyonel)' },
        limit: { type: 'number', description: 'Maks sonuç sayısı (varsayılan: 100, max: 500)' },
        sadece_say: { type: 'boolean', description: 'true ise sadece toplam sayıyı döner' },
        sadece_ust: { type: 'boolean', description: 'true ise sadece üst lokasyonları (parent_id = null) getirir' },
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
    name: 'personel_basari_analizi',
    description: 'Personel başarı analizi — belirtilen tarihte görev tamamlayan personelleri sıralar. "en başarılı" için siralama="desc", "en başarısız/en az tamamlayan" için siralama="asc" kullan. Hiç görev tamamlamamış personelleri de gösterebilir.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tarih: { type: 'string', description: 'Tarih YYYY-MM-DD (varsayılan: bugün)' },
        limit: { type: 'number', description: 'Kaç personel gösterilsin (varsayılan: 10)' },
        siralama: { type: 'string', description: '"desc" = en çok tamamlayan (varsayılan), "asc" = en az tamamlayan / başarısız' },
        hic_tamamlamayan: { type: 'boolean', description: 'true ise hiç görev tamamlamamış personelleri de göster (başarısız analiz için)' },
        ...PROJE_PARAM,
      },
      required: [],
    },
  },
  {
    name: 'gorev_sure_analizi',
    description: 'Görev tamamlanma sürelerini analiz eder. "En uzun süren görev", "en kısa süren görev", "dün en uzun süren" gibi sorularda mutlaka bu tool\'u kullan. canli_gorevler (frekansiyel) + gorevler (spesifik) + arşiv tablolarını birlikte tarar, görev adı, lokasyon, yapan kişi ve süre bilgisini döndürür.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tarih_baslangic: { type: 'string', description: 'Başlangıç tarihi YYYY-MM-DD (varsayılan: bugün)' },
        tarih_bitis: { type: 'string', description: 'Bitiş tarihi YYYY-MM-DD (varsayılan: tarih_baslangic)' },
        siralama: { type: 'string', description: '"desc" = en uzun süren (varsayılan), "asc" = en kısa süren' },
        limit: { type: 'number', description: 'Kaç görev gösterilsin (varsayılan: 5, max: 20)' },
        gorev_tipi: { type: 'string', description: '"frekansiyel" / "spesifik" / "hepsi" (varsayılan: hepsi)' },
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
  {
    name: 'yonetici_iletisim',
    description: 'Sistem yöneticisi (SA/Alt SA) veya firma yöneticisi (TA) iletişim bilgilerini (isim, e-posta, telefon) döndürür. Kullanıcı "destek / sistem yöneticisi / firma admin / yönetici iletişim" gibi ifadeler kullandığında bu tool\'u çağır.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tip: {
          type: 'string',
          enum: ['sistem', 'firma'],
          description: '"sistem" = İO Teknoloji sistem yöneticileri (SA/Alt SA). "firma" = kullanıcının kendi firmasının TA yöneticileri.',
        },
      },
      required: ['tip'],
    },
  },
  {
    name: 'gorev_olustur',
    description: 'Spesifik (tek seferlik) görev oluşturur. Yetki kontrolü yapılır — "ekleyebilir" yetkisi yoksa reddedilir. Çok adımlı akış: önce kullanıcıya görev tipi, tanım, lokasyon vb. sorulur. Kullanıcı onaylayana kadar onayla=false ile çağır (özet gösterir). Son onayda onayla=true ile çağırınca kayıt eklenir. Frekansiyel görev oluşturma için bu tool kullanılmaz — sadece spesifik.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tanim: { type: 'string', description: 'Görev tanımı/adı (zorunlu)' },
        lokasyon_adi: { type: 'string', description: 'Lokasyon adı — firma kapsamında aranır (zorunlu)' },
        atanan_isim: { type: 'string', description: 'Görevi atayacağınız kullanıcının adı (opsiyonel)' },
        aciklama: { type: 'string', description: 'Görev açıklaması (opsiyonel)' },
        onayla: { type: 'boolean', description: 'false = özet göster + onay iste, true = kaydet' },
        ...PROJE_PARAM,
      },
      required: ['tanim', 'lokasyon_adi', 'onayla'],
    },
  },
  {
    name: 'veritabani_sorgula',
    description: 'Herhangi bir veritabanı tablosunu sorgular. Filtre, sıralama, limit ve count destekler. Tablo şemasını system prompt\'ta bulabilirsin. Diğer tool\'ların kapsamadığı sorular için kullan.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tablo: { type: 'string', description: 'Sorgulanacak tablo adı (örn: canli_gorevler, users, firmalar, projeler, lokasyonlar vb.)' },
        select: { type: 'string', description: 'Seçilecek kolonlar, virgülle ayrılmış (varsayılan: *). Örn: "id,tanim,durum"' },
        filtreler: {
          type: 'array',
          description: 'Filtre dizisi. Her filtre: { kolon, operator, deger }. Operatörler: eq, neq, gt, gte, lt, lte, like, ilike, in, is',
          items: {
            type: 'object',
            properties: {
              kolon: { type: 'string' },
              operator: { type: 'string' },
              deger: { type: 'string' },
            },
          },
        },
        siralama: { type: 'string', description: 'Sıralama kolonu (varsayılan: id). Başına - koyarak DESC yapılır (örn: "-olusturma_tarihi")' },
        limit: { type: 'number', description: 'Maksimum kayıt sayısı (varsayılan: 20, max: 100)' },
        sadece_say: { type: 'boolean', description: 'true ise sadece kayıt sayısını döner (count)' },
        ...PROJE_PARAM,
      },
      required: ['tablo'],
    },
  },
]

// ── Tool çalıştırıcılar ──
type ToolContext = { firmaId: string | null; projeId: string | null; isSA: boolean; userId: string; rol: string }

// Proje adından ID çözümle
async function resolveProjeId(
  supabase: ReturnType<typeof createClient>,
  projeAdi: string | undefined,
  ctx: ToolContext
): Promise<string | null> {
  if (!projeAdi) return ctx.projeId
  let q = supabase
    .from('projeler')
    .select('id,ad')
    .ilike('ad', `%${projeAdi}%`)
    .limit(5)
  if (ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
  const { data } = await q
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
        if (ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
        // TU/U gibi belirli proje'ye atanmış kullanıcılar sadece kendi projelerini görmeli
        if (!ctx.isSA && ctx.projeId) q = q.eq('id', ctx.projeId)
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
        if (ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
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
        if (ctx.firmaId) qOlusturulan = qOlusturulan.eq('firma_id', ctx.firmaId)
        if (projeId) qOlusturulan = qOlusturulan.eq('proje_id', projeId)
        // Tamamlanan görevler (farklı günde oluşturulmuş olabilir)
        let qTamamlanan = supabase
          .from('gorevler')
          .select('id')
          .gte('tamamlanma_tarihi', `${tarih}T00:00:00`)
          .lte('tamamlanma_tarihi', `${tarih}T23:59:59`)
        if (ctx.firmaId) qTamamlanan = qTamamlanan.eq('firma_id', ctx.firmaId)
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
        if (ctx.firmaId) qOlusturulan = qOlusturulan.eq('firma_id', ctx.firmaId)
        if (projeId) qOlusturulan = qOlusturulan.eq('proje_id', projeId)
        const durumFiltre = input.durum as string | undefined
        if (durumFiltre) qOlusturulan = qOlusturulan.eq('durum', durumFiltre)
        // Tamamlanan frekansiyel görevler
        let qTamamlanan = supabase
          .from('canli_gorevler')
          .select('id')
          .gte('tamamlanma_tarihi', `${tarih}T00:00:00`)
          .lte('tamamlanma_tarihi', `${tarih}T23:59:59`)
        if (ctx.firmaId) qTamamlanan = qTamamlanan.eq('firma_id', ctx.firmaId)
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
        if (ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
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
        const cinsiyet = (input.cinsiyet as string | undefined)?.toUpperCase()
        const arama = (input.arama as string | undefined)?.trim()
        const limit = Math.min((input.limit as number) || 200, 500)
        let q = supabase
          .from('users')
          .select('isim_soyisim,email,rol,aktif,cinsiyet')
          .in('rol', ['tenant_user', 'tenant_admin'])
          .order('isim_soyisim')
          .limit(limit)
        if (ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
        if (projeId) q = q.eq('proje_id', projeId)
        if (sadece_aktif) q = q.eq('aktif', true)
        if (cinsiyet === 'K' || cinsiyet === 'E') q = q.eq('cinsiyet', cinsiyet)
        if (arama) {
          // Kelime bazlı: her kelime ayrı ilike
          const kelimeler = arama.split(/\s+/).filter(k => k.length > 0)
          for (const k of kelimeler) q = q.ilike('isim_soyisim', `%${k}%`)
        }
        const { data, error } = await q
        if (error) return `Hata: ${error.message}`
        if (!data?.length) return `${arama ? `"${arama}" ile eşleşen personel yok${projeLabel}.` : `Kayıtlı personel bulunamadı${projeLabel}.`}`
        const cinsiyetEtiket = cinsiyet === 'K' ? ' (Bayan)' : cinsiyet === 'E' ? ' (Bay)' : ''
        return `Personel Listesi${projeLabel}${cinsiyetEtiket} (${data.length} kişi):\n` +
          data.map((r: Record<string, unknown>) => `• ${r.isim_soyisim} (${r.rol === 'tenant_admin' ? 'Yönetici' : 'Personel'}) — ${r.email}`).join('\n')
      }

      case 'lokasyon_bilgisi': {
        const arama = (input.arama as string | undefined)?.trim()
        const limit = Math.min((input.limit as number) || 100, 500)
        const sadeceSay = input.sadece_say === true
        const sadeceUst = input.sadece_ust === true

        // Sadece say → count(*) döner
        if (sadeceSay) {
          let cq = supabase.from('lokasyonlar').select('id', { count: 'exact', head: true }).eq('aktif', true)
          if (ctx.firmaId) cq = cq.eq('firma_id', ctx.firmaId)
          if (projeId) cq = cq.eq('proje_id', projeId)
          if (sadeceUst) cq = cq.is('parent_id', null)
          if (arama) {
            const kelimeler = arama.split(/\s+/).filter(k => k.length > 0)
            for (const k of kelimeler) cq = cq.ilike('tanim', `%${k}%`)
          }
          if (!ctx.isSA && ctx.firmaId) {
            const yetkiliIds = await getYetkiliLokasyonIds(supabase, ctx.firmaId, ctx.projeId)
            if (yetkiliIds !== null) {
              if (yetkiliIds.length === 0) return `Size atanmış lokasyon yok${projeLabel}.`
              cq = cq.in('id', yetkiliIds)
            }
          }
          const { count, error } = await cq
          if (error) return `Hata: ${error.message}`
          return `${projeLabel ? projeLabel.trim() + ' ' : ''}${arama ? `"${arama}" içeren ` : ''}${sadeceUst ? 'üst ' : ''}lokasyon sayısı: ${count ?? 0}`
        }

        let q = supabase
          .from('lokasyonlar')
          .select('id,tanim,aktif,parent_id')
          .eq('aktif', true)
          .order('tanim')
          .limit(limit)
        if (ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
        if (projeId) q = q.eq('proje_id', projeId)
        if (sadeceUst) q = q.is('parent_id', null)
        if (arama) {
          const kelimeler = arama.split(/\s+/).filter(k => k.length > 0)
          for (const k of kelimeler) q = q.ilike('tanim', `%${k}%`)
        }
        // U/M için kullanici_lokasyon_yetkileri tablosundan yetkili lokasyon id'lerini al
        if (!ctx.isSA && ctx.firmaId) {
          const yetkiliIds = await getYetkiliLokasyonIds(supabase, ctx.firmaId, ctx.projeId)
          if (yetkiliIds !== null) {
            if (yetkiliIds.length === 0) return `Size atanmış lokasyon bulunamadı${projeLabel}.`
            q = q.in('id', yetkiliIds)
          }
        }
        const { data, error } = await q
        if (error) return `Hata: ${error.message}`
        if (!data?.length) return arama ? `"${arama}" ile eşleşen lokasyon bulunamadı${projeLabel}.` : `Kayıtlı lokasyon yok${projeLabel}.`
        return `Lokasyonlar${projeLabel} (${data.length}):\n` +
          data.map((r: Record<string, unknown>) => `• ${r.tanim}${r.parent_id ? ' (alt lokasyon)' : ''}`).join('\n')
      }

      case 'checklist_ozeti': {
        const tarih = (input.tarih as string) || today
        // Not: checklist_sonuc_basliklari tablosunda firma_id/skor kolonu yok;
        // Firma scope'u lokasyonlar üzerinden sağlıyoruz.
        let lokasyonIds: string[] | null = null
        if (ctx.firmaId) {
          let lokQ = supabase.from('lokasyonlar').select('id').eq('firma_id', ctx.firmaId)
          if (projeId) lokQ = lokQ.eq('proje_id', projeId)
          const { data: loks } = await lokQ
          lokasyonIds = (loks ?? []).map((l: { id: string }) => l.id)
          if (!lokasyonIds.length) return `Bu kriterle lokasyon yok — çeklist özeti hesaplanamaz${projeLabel}.`
        } else if (projeId) {
          let lokQ = supabase.from('lokasyonlar').select('id').eq('proje_id', projeId)
          const { data: loks } = await lokQ
          lokasyonIds = (loks ?? []).map((l: { id: string }) => l.id)
          if (!lokasyonIds.length) return `Bu projede lokasyon yok — çeklist özeti hesaplanamaz${projeLabel}.`
        }

        let q = supabase
          .from('checklist_sonuc_basliklari')
          .select('id,kanal', { count: 'exact' })
          .gte('kayit_tarihi', `${tarih}T00:00:00`)
          .lte('kayit_tarihi', `${tarih}T23:59:59`)
        if (lokasyonIds) q = q.in('lokasyon_id', lokasyonIds)
        const { data, count, error } = await q
        if (error) return `Hata: ${error.message}`
        const toplam = count ?? 0
        if (!toplam) return `${tarih} tarihinde tamamlanmış çeklist yok${projeLabel}.`
        const kanalDagilim: Record<string, number> = {}
        for (const r of (data ?? []) as { kanal?: string }[]) {
          const k = r.kanal || 'diğer'
          kanalDagilim[k] = (kanalDagilim[k] || 0) + 1
        }
        const kanalStr = Object.entries(kanalDagilim).map(([k, v]) => `• ${k}: ${v}`).join('\n')
        return `${tarih} Çeklist Özeti${projeLabel}:\n• Toplam tamamlanan: ${toplam}${kanalStr ? `\n\nKanal dağılımı:\n${kanalStr}` : ''}`
      }

      case 'personel_basari_analizi': {
        const tarih = (input.tarih as string) || today
        const topN = Math.min((input.limit as number) || 10, 30)

        // Frekansiyel + Spesifik tamamlanan görevleri birleştir
        let qFrek = supabase
          .from('canli_gorevler')
          .select('tamamlayan_kullanici_id,tamamlanma_suresi_saniye')
          .gte('tamamlanma_tarihi', `${tarih}T00:00:00`)
          .lte('tamamlanma_tarihi', `${tarih}T23:59:59`)
          .not('tamamlayan_kullanici_id', 'is', null)
        if (ctx.firmaId) qFrek = qFrek.eq('firma_id', ctx.firmaId)
        if (projeId) qFrek = qFrek.eq('proje_id', projeId)

        let qSpesifik = supabase
          .from('gorevler')
          .select('islemi_yapan_id,tamamlanma_suresi_saniye')
          .eq('durum', 'TAMAMLANDI')
          .gte('tamamlanma_tarihi', `${tarih}T00:00:00`)
          .lte('tamamlanma_tarihi', `${tarih}T23:59:59`)
        if (ctx.firmaId) qSpesifik = qSpesifik.eq('firma_id', ctx.firmaId)
        if (projeId) qSpesifik = qSpesifik.eq('proje_id', projeId)

        const [frekRes, spRes] = await Promise.all([qFrek, qSpesifik])

        // Personel bazlı gruplama
        const personelMap = new Map<string, { frek: number; spesifik: number; toplamSure: number }>()
        for (const r of (frekRes.data ?? []) as Record<string, unknown>[]) {
          const uid = r.tamamlayan_kullanici_id as string
          const entry = personelMap.get(uid) ?? { frek: 0, spesifik: 0, toplamSure: 0 }
          entry.frek++
          entry.toplamSure += (r.tamamlanma_suresi_saniye as number) || 0
          personelMap.set(uid, entry)
        }
        for (const r of (spRes.data ?? []) as Record<string, unknown>[]) {
          const uid = r.islemi_yapan_id as string
          if (!uid) continue
          const entry = personelMap.get(uid) ?? { frek: 0, spesifik: 0, toplamSure: 0 }
          entry.spesifik++
          entry.toplamSure += (r.tamamlanma_suresi_saniye as number) || 0
          personelMap.set(uid, entry)
        }

        const siralamaTipi = (input.siralama as string) || 'desc'
        const hicTamamlamayan = input.hic_tamamlamayan as boolean

        // Hiç tamamlamayan personelleri de ekle
        if (hicTamamlamayan || siralamaTipi === 'asc') {
          let qUsers = supabase
            .from('users')
            .select('id,isim_soyisim')
            .in('rol', ['tenant_user', 'tenant_admin'])
            .eq('aktif', true)
          if (ctx.firmaId) qUsers = qUsers.eq('firma_id', ctx.firmaId)
          if (projeId) qUsers = qUsers.eq('proje_id', projeId)
          const { data: allUsers } = await qUsers
          for (const u of (allUsers ?? []) as Record<string, unknown>[]) {
            const uid = u.id as string
            if (!personelMap.has(uid)) {
              personelMap.set(uid, { frek: 0, spesifik: 0, toplamSure: 0 })
            }
          }
        }

        if (!personelMap.size) return `${tarih} tarihinde personel bulunamadı${projeLabel}.`

        // Sıralama
        const sorted = [...personelMap.entries()]
          .map(([uid, d]) => ({ uid, toplam: d.frek + d.spesifik, ...d }))
          .sort((a, b) => siralamaTipi === 'asc' ? a.toplam - b.toplam : b.toplam - a.toplam)
          .slice(0, topN)

        // Personel isimlerini çek
        const userIds = sorted.map(s => s.uid)
        const { data: users } = await supabase
          .from('users')
          .select('id,isim_soyisim')
          .in('id', userIds)
        const nameMap = new Map<string, string>()
        for (const u of (users ?? []) as Record<string, unknown>[]) {
          nameMap.set(u.id as string, u.isim_soyisim as string)
        }

        const baslik = siralamaTipi === 'asc' ? 'En Az Tamamlayan' : 'En Çok Tamamlayan'
        return `${tarih} Personel ${baslik} Analizi${projeLabel} (${sorted.length} kişi):\n` +
          sorted.map((s, i) => {
            const isim = nameMap.get(s.uid) || 'Bilinmiyor'
            const ortSure = s.toplam > 0 ? Math.round(s.toplamSure / s.toplam / 60) : 0
            return `${i + 1}. ${isim}: ${s.toplam} görev (${s.frek} frek + ${s.spesifik} spesifik)${s.toplam > 0 ? ` — ort. ${ortSure} dk` : ' — hiç tamamlamadı'}`
          }).join('\n')
      }

      case 'yonetici_iletisim': {
        const tip = input.tip as 'sistem' | 'firma'
        if (tip === 'sistem') {
          // SA/Alt SA — firma_id null, her role açık
          const { data, error } = await supabase
            .from('users')
            .select('isim_soyisim,email,telefon,rol')
            .in('rol', ['super_admin', 'alt_super_admin'])
            .eq('aktif', true)
            .order('rol', { ascending: true })
          if (error) return `Hata: ${error.message}`
          if (!data?.length) return 'Sistem yöneticisi bulunamadı.'
          return `İO Teknoloji Sistem Yöneticileri:\n` +
            data.map((u: Record<string, unknown>) => {
              const etiket = u.rol === 'super_admin' ? 'Sistem Yöneticisi' : 'Alt Sistem Yöneticisi'
              const lines = [`• ${u.isim_soyisim} (${etiket})`]
              if (u.email)   lines.push(`  E-posta: ${u.email}`)
              if (u.telefon) lines.push(`  Telefon: ${u.telefon}`)
              return lines.join('\n')
            }).join('\n\n') +
            `\n\nGenel iletişim: info@iogys.com.tr | www.iogys.com.tr`
        } else if (tip === 'firma') {
          if (!ctx.firmaId) return 'Firma kapsamınız yok; firma yöneticisi bilgisi gösterilemiyor.'
          let q = supabase
            .from('users')
            .select('isim_soyisim,email,telefon,proje_id')
            .eq('rol', 'tenant_admin')
            .eq('firma_id', ctx.firmaId)
            .eq('aktif', true)
            .order('isim_soyisim')
          // U/M/TU rolleri: sadece firma geneli (proje_id null) VEYA kendi projesine atanmış TA'lar
          if (!ctx.isSA && ctx.projeId) {
            q = q.or(`proje_id.is.null,proje_id.eq.${ctx.projeId}`)
          }
          const { data, error } = await q
          if (error) return `Hata: ${error.message}`
          if (!data?.length) return 'Firmanızın aktif yöneticisi bulunamadı.'
          return `Firma Yöneticileri (Sistem Yöneticileri):\n` +
            data.map((u: Record<string, unknown>) => {
              const lines = [`• ${u.isim_soyisim}`]
              if (u.email)   lines.push(`  E-posta: ${u.email}`)
              if (u.telefon) lines.push(`  Telefon: ${u.telefon}`)
              return lines.join('\n')
            }).join('\n\n')
        }
        return 'Geçersiz tip. "sistem" veya "firma" olmalı.'
      }

      case 'gorev_sure_analizi': {
        const tarihBas = (input.tarih_baslangic as string) || today
        const tarihBit = (input.tarih_bitis as string) || tarihBas
        const siralama = ((input.siralama as string) || 'desc').toLowerCase()
        const topN = Math.min((input.limit as number) || 5, 20)
        const gorevTipi = ((input.gorev_tipi as string) || 'hepsi').toLowerCase()
        const ascending = siralama === 'asc'

        // Kaynaklar: frekansiyel canlı+arşiv, spesifik canlı+arşiv
        type Row = { id: string; tanim: string | null; tamamlanma_suresi_saniye: number | null; tamamlanma_tarihi: string | null; lokasyon_id: string | null; userId: string | null; kaynak: string }
        const toplananlar: Row[] = []

        const frekTablolar = gorevTipi === 'spesifik' ? [] : ['canli_gorevler', 'canli_gorevler_arsiv']
        const spesifikTablolar = gorevTipi === 'frekansiyel' ? [] : ['gorevler', 'gorevler_arsiv']

        for (const t of frekTablolar) {
          let q = supabase
            .from(t)
            .select('id,tanim,tamamlanma_suresi_saniye,tamamlanma_tarihi,lokasyon_id,tamamlayan_kullanici_id,islemi_yapan_id')
            .gte('tamamlanma_tarihi', `${tarihBas}T00:00:00`)
            .lte('tamamlanma_tarihi', `${tarihBit}T23:59:59`)
            .not('tamamlanma_suresi_saniye', 'is', null)
            .gt('tamamlanma_suresi_saniye', 0)
            .order('tamamlanma_suresi_saniye', { ascending })
            .limit(topN)
          if (ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
          if (projeId) q = q.eq('proje_id', projeId)
          const { data } = await q
          for (const r of (data ?? []) as Record<string, any>[]) {
            toplananlar.push({
              id: r.id, tanim: r.tanim, tamamlanma_suresi_saniye: r.tamamlanma_suresi_saniye,
              tamamlanma_tarihi: r.tamamlanma_tarihi, lokasyon_id: r.lokasyon_id,
              userId: r.tamamlayan_kullanici_id ?? r.islemi_yapan_id ?? null,
              kaynak: t.includes('arsiv') ? 'frek-arşiv' : 'frek',
            })
          }
        }

        for (const t of spesifikTablolar) {
          let q = supabase
            .from(t)
            .select('id,tanim,tamamlanma_suresi_saniye,tamamlanma_tarihi,lokasyon_id,islemi_yapan_id')
            .eq('durum', 'TAMAMLANDI')
            .gte('tamamlanma_tarihi', `${tarihBas}T00:00:00`)
            .lte('tamamlanma_tarihi', `${tarihBit}T23:59:59`)
            .not('tamamlanma_suresi_saniye', 'is', null)
            .gt('tamamlanma_suresi_saniye', 0)
            .order('tamamlanma_suresi_saniye', { ascending })
            .limit(topN)
          if (ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
          if (projeId) q = q.eq('proje_id', projeId)
          const { data } = await q
          for (const r of (data ?? []) as Record<string, any>[]) {
            toplananlar.push({
              id: r.id, tanim: r.tanim, tamamlanma_suresi_saniye: r.tamamlanma_suresi_saniye,
              tamamlanma_tarihi: r.tamamlanma_tarihi, lokasyon_id: r.lokasyon_id,
              userId: r.islemi_yapan_id ?? null,
              kaynak: t.includes('arsiv') ? 'sp-arşiv' : 'sp',
            })
          }
        }

        if (!toplananlar.length) {
          return `${tarihBas === tarihBit ? tarihBas : `${tarihBas} — ${tarihBit}`} arasında tamamlanmış görev (süre bilgili) bulunamadı${projeLabel}.`
        }

        // Toplu sıralama (global top N)
        toplananlar.sort((a, b) => {
          const av = a.tamamlanma_suresi_saniye ?? 0
          const bv = b.tamamlanma_suresi_saniye ?? 0
          return ascending ? av - bv : bv - av
        })
        const top = toplananlar.slice(0, topN)

        // İsim ve lokasyon çözümle
        const userIds = Array.from(new Set(top.map(r => r.userId).filter(Boolean))) as string[]
        const lokIds = Array.from(new Set(top.map(r => r.lokasyon_id).filter(Boolean))) as string[]
        const [{ data: users }, { data: loks }] = await Promise.all([
          userIds.length ? supabase.from('users').select('id,isim_soyisim').in('id', userIds) : Promise.resolve({ data: [] as Record<string, any>[] }),
          lokIds.length ? supabase.from('lokasyonlar').select('id,tanim').in('id', lokIds) : Promise.resolve({ data: [] as Record<string, any>[] }),
        ])
        const userMap = new Map((users ?? []).map((u: Record<string, any>) => [u.id, u.isim_soyisim]))
        const lokMap = new Map((loks ?? []).map((l: Record<string, any>) => [l.id, l.tanim]))

        const fmt = (sn: number) => {
          const dk = Math.floor(sn / 60)
          const kalanSn = sn % 60
          const sa = Math.floor(dk / 60)
          const kalanDk = dk % 60
          if (sa > 0) return `${sa}sa ${kalanDk}dk ${kalanSn}sn`
          return `${dk}dk ${kalanSn}sn`
        }

        const etiket = ascending ? 'en kısa süren' : 'en uzun süren'
        const tarihEtiket = tarihBas === tarihBit ? tarihBas : `${tarihBas} — ${tarihBit}`
        const satirlar = top.map((r, i) => {
          const isim = r.userId ? (userMap.get(r.userId) ?? '—') : '—'
          const lok = r.lokasyon_id ? (lokMap.get(r.lokasyon_id) ?? '—') : '—'
          const sure = r.tamamlanma_suresi_saniye ? fmt(r.tamamlanma_suresi_saniye) : '—'
          return `${i + 1}. ${r.tanim ?? 'İsimsiz görev'} — ${lok} — ${isim} — ${sure}`
        })
        return `${tarihEtiket} ${etiket} görev${top.length > 1 ? 'ler' : ''}${projeLabel}:\n${satirlar.join('\n')}`
      }

      case 'arsiv_ozeti': {
        const tablo = input.tablo as string | undefined
        const results: string[] = []
        // Firma scope uygulanabilen tablolar için filter helper
        const applyScope = (q: any) => {
          if (ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
          return q
        }

        if (!tablo || tablo === 'personel_mesai') {
          const { count } = await applyScope(supabase.from('personel_mesai_kayitlari_arsiv').select('id', { count: 'exact', head: true }))
          results.push(`• Mesai Arşivi: ${count ?? 0} kayıt`)
        }
        if (!tablo || tablo === 'musteri') {
          const { count } = await applyScope(supabase.from('musteri_degerlendirmeleri_arsiv').select('id', { count: 'exact', head: true }))
          results.push(`• Müşteri Değerlendirme Arşivi: ${count ?? 0} kayıt`)
        }
        if (!tablo || tablo === 'gorevler') {
          const { count } = await applyScope(supabase.from('gorevler_arsiv').select('id', { count: 'exact', head: true }))
          results.push(`• Spesifik Görev Arşivi: ${count ?? 0} kayıt`)
        }
        if (!tablo || tablo === 'checklist') {
          const { data: basliklar, count: baslikCount } = await applyScope(
            supabase.from('checklist_sonuc_basliklari_arsiv').select('id', { count: 'exact' })
          )
          // maddeleri_arsiv tablosunda firma_id yok — firma'nın başlık_id'lerine göre say
          let maddeCount = 0
          const baslikIds = (basliklar ?? []).map((b: { id: string }) => b.id)
          if (baslikIds.length) {
            const { count: mc } = await supabase
              .from('checklist_sonuc_maddeleri_arsiv')
              .select('id', { count: 'exact', head: true })
              .in('sonuc_id', baslikIds)
            maddeCount = mc ?? 0
          } else if (ctx.isSA) {
            const { count: mc } = await supabase
              .from('checklist_sonuc_maddeleri_arsiv')
              .select('id', { count: 'exact', head: true })
            maddeCount = mc ?? 0
          }
          results.push(`• Çeklist Arşivi: ${baslikCount ?? 0} başlık, ${maddeCount} madde`)
        }

        return results.length ? `Arşiv Özeti:\n${results.join('\n')}` : 'Arşiv verisi bulunamadı.'
      }

      case 'gorev_olustur': {
        // 1) Firma kapsamı zorunlu
        if (!ctx.firmaId) return 'Firma kapsamınız yok; görev oluşturamazsınız.'

        // 2) Yetki kontrolü — "gorevler" sayfasında ekleyebilir?
        const yetki = await sayfaYetkileri(ctx.rol, 'gorevler', ctx.firmaId)
        if (!yetki.ekleyebilir) {
          // Audit log
          const admin = createAdminClient()
          await admin.from('io_asistan_islem_log').insert({
            user_id: ctx.userId, firma_id: ctx.firmaId, proje_id: ctx.projeId,
            islem_tipi: 'gorev_olustur', sonuc: 'yetki_yok',
            input: input as any, mesaj: 'Spesifik görev ekleme yetkisi yok',
          })
          return 'Bu işlemi yapmak için yetkiniz yok. Spesifik görev ekleyebilmek için yöneticinizin yetki tanımlaması gerekir.'
        }

        const tanim = (input.tanim as string || '').trim()
        const lokasyonAdi = (input.lokasyon_adi as string || '').trim()
        const atananIsim = (input.atanan_isim as string || '').trim()
        const aciklama = (input.aciklama as string || '').trim()
        const onayla = input.onayla === true

        if (!tanim) return 'Görev tanımı boş olamaz. Lütfen görev adını belirtin.'
        if (!lokasyonAdi) return 'Lokasyon belirtmelisiniz.'

        // 3) Lokasyon çözümle (firma + proje scope) — ilk olarak tam substring
        let lokQ = supabase.from('lokasyonlar').select('id,tanim').ilike('tanim', `%${lokasyonAdi}%`).eq('firma_id', ctx.firmaId).eq('aktif', true).limit(10)
        if (projeId) lokQ = lokQ.eq('proje_id', projeId)
        let { data: loks } = await lokQ
        // Eşleşme yoksa: kelime bazlı arama (tüm kelimelerin tanim'da geçmesi)
        if (!loks?.length) {
          const kelimeler = lokasyonAdi.split(/\s+/).filter(k => k.length > 1)
          if (kelimeler.length >= 2) {
            let kQ = supabase.from('lokasyonlar').select('id,tanim').eq('firma_id', ctx.firmaId).eq('aktif', true).limit(30)
            if (projeId) kQ = kQ.eq('proje_id', projeId)
            for (const k of kelimeler) kQ = kQ.ilike('tanim', `%${k}%`)
            const { data: kData } = await kQ
            loks = kData
          }
        }
        if (!loks?.length) {
          // Alternatif liste ver (ilk kelimeyle)
          const ilk = lokasyonAdi.split(/\s+/)[0]
          let altQ = supabase.from('lokasyonlar').select('id,tanim').ilike('tanim', `%${ilk}%`).eq('firma_id', ctx.firmaId).eq('aktif', true).limit(10)
          if (projeId) altQ = altQ.eq('proje_id', projeId)
          const { data: altData } = await altQ
          if (altData?.length) {
            return `"${lokasyonAdi}" ile tam eşleşen lokasyon bulunamadı. Benzer lokasyonlar:\n${altData.map((l: any) => `• ${l.tanim}`).join('\n')}\nLütfen tam lokasyon adını seçip belirtin.`
          }
          return `"${lokasyonAdi}" ile eşleşen lokasyon bulunamadı. Farklı bir isim deneyin veya önce "lokasyonları listele" dedirterek mevcut listeyi görün.`
        }
        if (loks.length > 1) {
          const exact = loks.find((l: any) => l.tanim.toLowerCase() === lokasyonAdi.toLowerCase())
          if (!exact) {
            return `Birden fazla lokasyon eşleşti:\n${loks.map((l: any) => `• ${l.tanim}`).join('\n')}\nTam adı belirtir misiniz?`
          }
        }
        const lokasyon = loks.find((l: any) => l.tanim.toLowerCase() === lokasyonAdi.toLowerCase()) ?? loks[0]

        // 4) Atanan kullanıcı çözümle (opsiyonel) — kelime bazlı fuzzy
        let atananId: string | null = null
        let atananLabel = '—'
        if (atananIsim) {
          const kelimeler = atananIsim.split(/\s+/).filter(k => k.length > 0)
          let uQ = supabase.from('users').select('id,isim_soyisim').eq('firma_id', ctx.firmaId).eq('aktif', true).limit(10)
          if (projeId) uQ = uQ.eq('proje_id', projeId)
          for (const k of kelimeler) uQ = uQ.ilike('isim_soyisim', `%${k}%`)
          let { data: users } = await uQ
          // Eşleşme yoksa sadece ilk kelimeyle dene (soyadı olmayabilir)
          if (!users?.length && kelimeler.length > 0) {
            let fbQ = supabase.from('users').select('id,isim_soyisim').ilike('isim_soyisim', `%${kelimeler[0]}%`).eq('firma_id', ctx.firmaId).eq('aktif', true).limit(10)
            if (projeId) fbQ = fbQ.eq('proje_id', projeId)
            const { data: fbData } = await fbQ
            users = fbData
          }
          if (!users?.length) return `"${atananIsim}" ile eşleşen kullanıcı bulunamadı. "personelleri listele" diyerek geçerli isimleri görebilirsiniz.`
          if (users.length > 1) {
            const exactU = users.find((u: any) => u.isim_soyisim.toLowerCase() === atananIsim.toLowerCase())
            if (!exactU) {
              const opts = users.slice(0, 8).map((u: any) => u.isim_soyisim).join('|')
              return `Birden fazla kullanıcı eşleşti, hangisini atamak istersiniz?\n[SECENEKLER]${opts}[/SECENEKLER]`
            }
          }
          const picked = users.find((u: any) => u.isim_soyisim.toLowerCase() === atananIsim.toLowerCase()) ?? users[0]
          atananId = picked.id
          atananLabel = picked.isim_soyisim
        }

        // 5) onayla=false ise özet göster
        if (!onayla) {
          return `Görev oluşturulacak, onaylıyor musunuz?\n\n` +
            `• Tanım: ${tanim}\n` +
            `• Lokasyon: ${lokasyon.tanim}\n` +
            `• Atanan: ${atananLabel}\n` +
            (aciklama ? `• Açıklama: ${aciklama}\n` : '') +
            `• Durum: AÇIK\n\n` +
            `Onaylıyorsanız "evet, onaylıyorum" deyin.`
        }

        // 6) onayla=true → kayıt
        const admin = createAdminClient()
        const payload: Record<string, any> = {
          firma_id: ctx.firmaId,
          tanim, lokasyon_id: lokasyon.id,
          durum: 'ACIK',
          olusturan_id: ctx.userId,
          islemi_yapan_id: ctx.userId,
          olusturma_tarihi: new Date().toISOString(),
        }
        if (projeId) payload.proje_id = projeId
        if (atananId) payload.atanan_kullanici_id = atananId
        if (aciklama) payload.aciklama = aciklama

        const { data: inserted, error: insErr } = await admin.from('gorevler').insert(payload).select('id').maybeSingle()
        if (insErr) {
          await admin.from('io_asistan_islem_log').insert({
            user_id: ctx.userId, firma_id: ctx.firmaId, proje_id: ctx.projeId,
            islem_tipi: 'gorev_olustur', sonuc: 'hata',
            input: input as any, mesaj: insErr.message,
          })
          return `Görev kaydedilirken hata oluştu: ${insErr.message}`
        }

        await admin.from('io_asistan_islem_log').insert({
          user_id: ctx.userId, firma_id: ctx.firmaId, proje_id: ctx.projeId,
          islem_tipi: 'gorev_olustur', hedef_tablo: 'gorevler', hedef_id: inserted?.id ?? null,
          sonuc: 'basarili', input: input as any,
          mesaj: `Spesifik görev oluşturuldu: ${tanim} @ ${lokasyon.tanim}`,
        })

        return `✓ Görev başarıyla oluşturuldu.\n\n• Tanım: ${tanim}\n• Lokasyon: ${lokasyon.tanim}\n• Atanan: ${atananLabel}\n• Durum: AÇIK`
      }

      case 'veritabani_sorgula': {
        const tablo = input.tablo as string
        if (!tablo) return 'Tablo adı belirtilmedi.'
        // UUID doğrulayıcı
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        // Filtreleri önden doğrula — _id kolonlarına UUID olmayan değer gelirse AI'a yol tarif et
        const rawFiltreler = (input.filtreler as Array<{ kolon: string; operator: string; deger: string }>) || []
        for (const f of rawFiltreler) {
          if (!f.kolon || !f.operator) continue
          const isIdCol = f.kolon === 'id' || f.kolon.endsWith('_id')
          const isEqualityOp = f.operator === 'eq' || f.operator === 'neq'
          if (isIdCol && isEqualityOp && typeof f.deger === 'string' && !uuidRegex.test(f.deger)) {
            // Tipik hata: AI isim yazmış UUID yerine
            const refTablo =
              f.kolon === 'firma_id'       ? 'firmalar'        :
              f.kolon === 'proje_id'       ? 'projeler'        :
              f.kolon === 'lokasyon_id'    ? 'lokasyonlar'     :
              f.kolon === 'kullanici_id' ||
              f.kolon === 'user_id'        ? 'users'           :
              f.kolon === 'sablon_id'      ? 'checklist_sablonlari' :
              null
            const refKolon =
              f.kolon === 'firma_id'       ? 'firma_adi veya ticari_unvan' :
              f.kolon === 'proje_id'       ? 'ad' :
              f.kolon === 'lokasyon_id'    ? 'tanim' :
              f.kolon === 'kullanici_id' ||
              f.kolon === 'user_id'        ? 'isim_soyisim veya email' :
              f.kolon === 'sablon_id'      ? 'baslik' :
              'ilgili isim kolonu'
            const hint = refTablo
              ? `"${f.kolon}" UUID beklediği için "${f.deger}" çalışmaz. ÖNCE ${refTablo} tablosundan ilike filtresiyle ${refKolon} üzerinden id'yi bul, SONRA o id'yi ${f.kolon} filter'ına koy.`
              : `"${f.kolon}" UUID olmalı; "${f.deger}" UUID değil.`
            return `Hata: ${hint}`
          }
        }
        // Güvenlik: sadece izin verilen tablolar
        const izinliTablolar = [
          'users','firmalar','projeler','lokasyonlar','lokasyon_gruplari','lokasyon_grup_uyeleri',
          'gorevler','canli_gorevler','gorev_kurallari','kural_duraklatmalari',
          'checklist_sablonlari','checklist_sablon_maddeleri','checklist_madde_secenekleri',
          'checklist_sonuc_basliklari','checklist_sonuc_maddeleri',
          'personel_mesai_kayitlari','musteri_degerlendirmeleri','birim_fiyatlar',
          'bildirimler','device_tokens','dashboard_bloklar','cron_log',
          'canli_gorevler_arsiv','gorevler_arsiv','personel_mesai_kayitlari_arsiv',
          'musteri_degerlendirmeleri_arsiv','checklist_sonuc_basliklari_arsiv','checklist_sonuc_maddeleri_arsiv',
          'simulasyon_ayarlari','simulasyon_grup_ayarlari','simulasyon_personeller',
          'rapor_zamanlama','rapor_sablonlari','kullanici_grubu_yetkileri',
          'kullanici_lokasyon_yetkileri','personel_gorev_destegi','personel_destek_personeller',
          'mesai_qr_kodlari','firma_rapor_turleri','personel_takip_alicilar',
        ]
        if (!izinliTablolar.includes(tablo)) return `"${tablo}" tablosuna erişim izni yok.`

        // firma_id/proje_id kolonu OLMAYAN tablolar (blind filter uygulanırsa hata/kapsam dışı dönüş)
        // NOT: 'firmalar' burada DEĞİL çünkü özel işlenir (scope: .eq('id', firmaId))
        const firmaIdsizTablolar = new Set([
          'lokasyon_grup_uyeleri', 'checklist_madde_secenekleri', 'checklist_sablon_maddeleri',
          'checklist_sonuc_basliklari', 'checklist_sonuc_maddeleri',
          'checklist_sonuc_basliklari_arsiv', 'checklist_sonuc_maddeleri_arsiv',
          'personel_destek_personeller',
        ])
        const projeIdsizTablolar = new Set([
          'firmalar', 'users', 'dashboard_bloklar', 'cron_log', 'projeler',
          ...firmaIdsizTablolar,
        ])
        const tabloFirmaIdsiz = firmaIdsizTablolar.has(tablo)
        const tabloProjeIdsiz = projeIdsizTablolar.has(tablo)
        // Firmalar tablosu özel: TA sadece kendi firmasını görebilir (filter: id = firmaId)
        const isFirmalarTable = tablo === 'firmalar'
        // Projeler tablosu özel: TU/U sadece kendi projesini görebilir (filter: id = projeId)
        const isProjelerTable = tablo === 'projeler'
        // Lokasyonlar tablosu özel: U/M kullanici_lokasyon_yetkileri ile sınırlı
        const isLokasyonlarTable = tablo === 'lokasyonlar'
        // Güvenlik: TA/U firma_id içermeyen tabloları sorgulayamasın (scope aşımı riski)
        if (!ctx.isSA && tabloFirmaIdsiz) {
          return `"${tablo}" tablosunda firma kapsamı olmadığı için sadece sistem yöneticisi sorgulayabilir.`
        }

        // U/M için lokasyonlar tablosunda yetki scope'u (kullanici_lokasyon_yetkileri)
        let yetkiliLokIds: string[] | null = null
        if (isLokasyonlarTable && !ctx.isSA && ctx.firmaId) {
          yetkiliLokIds = await getYetkiliLokasyonIds(supabase, ctx.firmaId, ctx.projeId)
          if (yetkiliLokIds !== null && yetkiliLokIds.length === 0) {
            return 'Size atanmış lokasyon bulunamadı.'
          }
        }

        const selectCols = (input.select as string) || '*'
        const limit = Math.min((input.limit as number) || 20, 100)
        const sadeceSay = input.sadece_say as boolean

        if (sadeceSay) {
          let q = supabase.from(tablo).select('id', { count: 'exact', head: true })
          if (ctx.firmaId && !tabloFirmaIdsiz) {
            // firmalar tablosu özel: id = firmaId (TA kendi firmasını görür)
            q = isFirmalarTable ? q.eq('id', ctx.firmaId) : q.eq('firma_id', ctx.firmaId)
          }
          // TU/U için projeler tablosunda id = projeId scope'u uygula
          if (isProjelerTable && !ctx.isSA && ctx.projeId) q = q.eq('id', ctx.projeId)
          // U/M için lokasyonlar tablosu yetki scope'u
          if (isLokasyonlarTable && yetkiliLokIds !== null) q = q.in('id', yetkiliLokIds)
          if (projeId && !tabloProjeIdsiz) q = q.eq('proje_id', projeId)
          // Filtreleri uygula
          const filtreler = (input.filtreler as Array<{ kolon: string; operator: string; deger: string }>) || []
          for (const f of filtreler) {
            switch (f.operator) {
              case 'eq': q = q.eq(f.kolon, f.deger); break
              case 'neq': q = q.neq(f.kolon, f.deger); break
              case 'gt': q = q.gt(f.kolon, f.deger); break
              case 'gte': q = q.gte(f.kolon, f.deger); break
              case 'lt': q = q.lt(f.kolon, f.deger); break
              case 'lte': q = q.lte(f.kolon, f.deger); break
              case 'like': q = q.like(f.kolon, f.deger); break
              case 'ilike': q = q.ilike(f.kolon, f.deger); break
              case 'is': q = q.is(f.kolon, f.deger === 'null' ? null : f.deger === 'true'); break
            }
          }
          const { count, error } = await q
          if (error) return `Hata: ${error.message}`
          return `${tablo}${projeLabel}: ${count ?? 0} kayıt`
        }

        let q = supabase.from(tablo).select(selectCols).limit(limit)
        if (ctx.firmaId && !tabloFirmaIdsiz) {
          q = isFirmalarTable ? q.eq('id', ctx.firmaId) : q.eq('firma_id', ctx.firmaId)
        }
        // TU/U için projeler tablosunda id = projeId scope'u uygula
        if (isProjelerTable && !ctx.isSA && ctx.projeId) q = q.eq('id', ctx.projeId)
        // U/M için lokasyonlar tablosu yetki scope'u
        if (isLokasyonlarTable && yetkiliLokIds !== null) q = q.in('id', yetkiliLokIds)
        if (projeId && !tabloProjeIdsiz) q = q.eq('proje_id', projeId)

        // Filtreleri uygula
        const filtreler = (input.filtreler as Array<{ kolon: string; operator: string; deger: string }>) || []
        for (const f of filtreler) {
          switch (f.operator) {
            case 'eq': q = q.eq(f.kolon, f.deger); break
            case 'neq': q = q.neq(f.kolon, f.deger); break
            case 'gt': q = q.gt(f.kolon, f.deger); break
            case 'gte': q = q.gte(f.kolon, f.deger); break
            case 'lt': q = q.lt(f.kolon, f.deger); break
            case 'lte': q = q.lte(f.kolon, f.deger); break
            case 'like': q = q.like(f.kolon, f.deger); break
            case 'ilike': q = q.ilike(f.kolon, f.deger); break
            case 'is': q = q.is(f.kolon, f.deger === 'null' ? null : f.deger === 'true'); break
          }
        }

        // Sıralama
        const siralama = (input.siralama as string) || ''
        if (siralama) {
          const desc = siralama.startsWith('-')
          const col = desc ? siralama.slice(1) : siralama
          q = q.order(col, { ascending: !desc })
        }

        const { data, error } = await q
        if (error) return `Hata: ${error.message}`
        if (!data?.length) return `${tablo}${projeLabel}: kayıt bulunamadı.`
        // Sonuçları okunabilir formata çevir
        return `${tablo}${projeLabel} (${data.length} kayıt):\n` +
          (data as unknown as Record<string, unknown>[]).map((r, i) => {
            const entries = Object.entries(r).filter(([, v]) => v !== null && v !== undefined)
            const summary = entries.slice(0, 8).map(([k, v]) => `${k}: ${typeof v === 'string' && v.length > 50 ? v.slice(0, 50) + '...' : v}`).join(', ')
            return `${i + 1}. ${summary}`
          }).join('\n')
      }

      default:
        return 'Bilinmeyen tool.'
    }
  } catch (err) {
    return `Sorgu hatası: ${err instanceof Error ? err.message : String(err)}`
  }
}

// ── System Prompt ──
function buildSystemPrompt(user: {
  isim_soyisim: string
  rol: string
  firma_id?: string | null
  proje_id?: string | null
  firma_adi?: string | null
  proje_adi?: string | null
}): string {
  const roleMap: Record<string, string> = {
    super_admin: 'Sistem yöneticisi — tüm firma ve projelere tam erişim',
    alt_super_admin: 'Alt sistem yöneticisi — tüm firma ve projelere erişim',
    tenant_admin: 'Firma yöneticisi — kendi firmasının tüm projelerine erişim',
    tenant_user: 'Saha personeli — atanan görevler ve lokasyonlara erişim',
    musteri: 'Müşteri — hizmet kalitesi takibi ve değerlendirme',
  }

  const trtNow = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const bugun = trtNow.toISOString().split('T')[0]
  const dun = new Date(trtNow.getTime() - 86400000).toISOString().split('T')[0]

  return `Sen İO Asistan'sın — İOGYS (İO Görev Yönetim Sistemi) yapay zeka asistanısın.
İO Teknoloji tarafından geliştirilen bu sistemi kullanıcılara tanıtıyor ve yardımcı oluyorsun.
Veritabanına erişim tool'ların var — kullanıcı veri sorusu sorduğunda ilgili tool'u çağır.

## TARİH BİLGİSİ (ÇOK ÖNEMLİ)
- Bugünün tarihi: ${bugun}
- Dünün tarihi: ${dun}
- "Bugün" dendiğinde tarih parametresi: ${bugun}
- "Dün" dendiğinde tarih parametresi: ${dun}
- Tarih belirtilmediğinde varsayılan: ${bugun}
- ASLA tarih tahmin etme veya uydurma — yukarıdaki değerleri kullan.

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

## VERİTABANI ŞEMASI (veritabani_sorgula tool'u için)
Aşağıdaki tablolar sorgulanabilir. Kolon adlarını AYNEN kullan:

### Kullanıcılar & Firmalar
- **users**: id, isim_soyisim, email, telefon, rol, firma_id, proje_id, aktif, profil_foto, last_seen_at, is_online, parent_id, cinsiyet, kayit_tarihi
- **firmalar**: id, firma_adi, ticari_unvan, vergi_no, yetkili_isim, yetkili_tel, aktif, logo_url, personel_takibi_aktif, qr_sistemi_aktif, nfc_sistemi_aktif, kayit_tarihi
- **projeler**: id, firma_id, ad, aciklama, aktif, personel_takibi_aktif, sureli_gorev_aktif, kayit_tarihi

### Görevler
- **gorevler** (spesifik): id, firma_id, proje_id, tanim, lokasyon_id, atanan_kullanici_id, durum (AÇIK/İŞLEMDE/TAMAMLANDI/İPTAL), olusturma_tarihi, tamamlanma_tarihi, tamamlanma_suresi_saniye
- **canli_gorevler** (frekansiyel): id, firma_id, proje_id, tanim, lokasyon_id, atanan_kullanici_id, durum, aktif_olma_tarihi, olusturma_tarihi, tamamlanma_tarihi, tamamlanma_suresi_saniye, kural_id, simule_tamamlandi
- **gorev_kurallari**: id, firma_id, proje_id, lokasyon_id, tanim, aktif_gunler, gunluk_frekans_sayisi, aktif_olma_saati, aktif, baslangic_tarihi, bitis_tarihi, atanan_kullanici_id

### Lokasyonlar
- **lokasyonlar**: id, firma_id, proje_id, parent_id, tanim, aktif, qr_veri, nfc_token, checklist_sablon_id, sureli_gorev_aktif, hedef_sure_dakika, min_sure_dakika, max_sure_dakika, gunluk_frekans_sayisi
- **lokasyon_gruplari**: id, firma_id, proje_id, ad, aktif, parent_id
- **lokasyon_grup_uyeleri**: id, grup_id, lokasyon_id

### Çeklist
- **checklist_sablonlari**: id, firma_id, proje_id, baslik, tanim, aktif, versiyon
- **checklist_sablon_maddeleri**: id, sablon_id, sira_no, baslik, zorunlu_cevap, gorsel_gerekli
- **checklist_sonuc_basliklari**: id, gorev_id, canli_gorev_id, lokasyon_id, sablon_id, kullanici_id, kayit_tarihi, kanal
- **checklist_sonuc_maddeleri**: id, sonuc_id, madde_id, secenek_degeri, aciklama, gorsel_url

### Mesai & Personel
- **personel_mesai_kayitlari**: id, user_id, firma_id, proje_id, giris_saati, cikis_saati, giris_tipi, cikis_tipi, kayit_tarihi, arsivlendi
- **device_tokens**: id, user_id, firma_id, isim_soyisim, aktif, son_kullanim (online personel tespiti için)
- **mesai_qr_kodlari**: id, firma_id, proje_id (QR kodları)

### Diğer
- **musteri_degerlendirmeleri**: id, firma_id, proje_id, lokasyon_id, yildiz, yorum, ad_soyad, olusturma_tarihi, arsivlendi
- **birim_fiyatlar**: id, firma_id, proje_id, grup_id, lokasyon_id, fiyat, para_birimi
- **bildirimler**: id, alici_id, baslik, mesaj, okundu, tarih, tip
- **kullanici_grubu_yetkileri**: id, firma_id, rol, sayfa_kodu, gorebilir, ekleyebilir, duzenleyebilir, silebilir
- **rapor_zamanlama**: id, firma_id, proje_id, tekrar_tipi, aktif, son_gonderim_tarihi
- **simulasyon_ayarlari**: id, firma_id, proje_id, aktif
- **cron_log**: id, tip, sonuc, tarih, firma_id, proje_id

### Arşiv Tabloları
- **canli_gorevler_arsiv**: canli_gorevler ile aynı + arsiv_tarihi, arsiv_nedeni
- **gorevler_arsiv**: gorevler ile aynı + arsiv_tarihi
- **personel_mesai_kayitlari_arsiv**: mesai kayıtları arşivi
- **musteri_degerlendirmeleri_arsiv**: müşteri değerlendirmeleri arşivi
- **checklist_sonuc_basliklari_arsiv**: çeklist başlık arşivi
- **checklist_sonuc_maddeleri_arsiv**: çeklist madde arşivi

## AKTİF KULLANICI VE BAĞLAM
- Kullanıcı: ${user.isim_soyisim}
- Rol: ${roleMap[user.rol] || user.rol}
- Firma: ${user.firma_adi ?? 'Belirtilmemiş'}${user.firma_id ? ` (id: ${user.firma_id})` : ''}
- Aktif Proje: ${user.proje_adi ?? 'Belirtilmemiş'}${user.proje_id ? ` (id: ${user.proje_id})` : ''}

Veri sorgularında:
- SA değilse → firma_id'yi mutlaka bu kullanıcının firma_id'sine sabitleyerek tool çağır.
- Kullanıcının birden fazla projesi olabilir; eğer soruda proje belirtilmediyse ve tek bir aktif proje varsa onu kullan, belirsizse önce "Hangi proje?" diye sor.
- Aktif proje bilgisi yukarıda varsa varsayılan olarak onu kullan, soru açıkça başka proje demiyorsa.

## İO TEKNOLOJİ RESMİ İLETİŞİM BİLGİLERİ (bu bilgiler doğrulandı, paylaşabilirsin)
- **E-posta:** info@iogys.com.tr
- **Web:** www.iogys.com.tr
- **Uygulama:** app.iogys.com.tr
- **Konum:** Türkiye

## YAZMA İŞLEMLERİ — ÇOK ÖNEMLİ KURALLAR
Kullanıcı bir şey "ekle / oluştur / yarat" dediğinde:

1. **Hangi tip olduğunu netleştir.** Şu an sadece SPESİFİK GÖREV destekleniyor. Frekansiyel görev, kullanıcı, lokasyon vs. ekleme desteklenmiyor — bunları isterse "Şu an bu tür kayıt İO üzerinden eklenemez, panel'den yapabilirsiniz" de.

2. **Eksik parametreleri TEK TEK sor**, hepsini aynı anda isteme:
   - Zorunlu: tanim, lokasyon_adi
   - Opsiyonel: atanan_isim, aciklama

3. **ÖZETİ ASLA KENDİN YAZMA.** Tüm zorunlu bilgiler toplanınca mutlaka gorev_olustur tool'unu **onayla=false** ile çağır. Tool'un döndürdüğü özet + onay sorusunu kullanıcıya AYNEN göster.
   - Tool eğer "lokasyon bulunamadı" / "kullanıcı bulunamadı" / "yetkiniz yok" gibi hata dönerse, bu mesajı AYNEN göster, ÖZET ÜRETME. Kullanıcıdan düzeltme iste.
   - Kullanıcının söylediği lokasyon/kullanıcı isimleri kendin uyduramazsın. Tool çağır, DB'den çözülsün.

4. Kullanıcı "evet / onaylıyorum / kaydet" deyince tool'u **onayla=true** ile çağır. Tool'un başarı/hata mesajını göster.

5. **Yetki yoksa** tool otomatik reddeder, mesajı KULLANICIYA AYNEN GÖSTER, tekrar denemeye çalışma.

6. **ASLA otomatik onayla=true ile çağırma.** Kullanıcının açık onayı şart.

7. Kullanıcı "lokasyonları listele" / "kullanıcıları göster" derse, yazma akışını duraklatıp ilgili listeleme tool'unu çağır (lokasyon_bilgisi, personel_listesi). Sonra kullanıcı lokasyon seçtiğinde yazma akışına devam et.

8. Bir lokasyon eşleşmediğinde kullanıcıya mevcut lokasyonları göstermek için lokasyon_bilgisi tool'unu çağır.

## SEÇİM BUTONLARI (UI İÇİN)
Kullanıcının bir listeden seçim yapması gerektiği anlarda (lokasyon seç, personel seç, görev tipi seç vs.) yanıtına aşağıdaki markeri ekle — UI bu markeri tespit edip tıklanabilir butonlar olarak gösterecek:

[SECENEKLER]Seçenek 1|Seçenek 2|Seçenek 3[/SECENEKLER]

Kurallar:
- Seçenekler | (pipe) ile ayrılır
- Her seçenek 1 satırda, kısa ve net olsun (lokasyon tanımı, kullanıcı ismi vs.)
- Maksimum 10 seçenek önerilir (daha fazlası için kullanıcıdan daralma iste)
- Marker satırı ayrı olsun, açıklama metninden sonra gelsin
- Örnek:
  "Hangi lokasyonda görev oluşturalım?
  [SECENEKLER]Zemin Kat WC|A Blok Kat 1|B Blok Kat 2[/SECENEKLER]"
- Kullanıcı butona tıklayınca seçim metni ham girdi gibi gelir, sen tool'u onunla çağırırsın.
- Liste çok uzunsa (30+) marker yerine ilk 10 seçeneği göster + "Daha fazla için arama yapabilirsin" de.

## YÖNETİCİ İLETİŞİMİ (DB sorgulu — yonetici_iletisim tool'u kullan)
Kullanıcı şu tip sorular sorduğunda yonetici_iletisim tool'unu çağır, UYDURMA:
- "İO Teknoloji destek / İO Teknoloji sistem yöneticisi / SA kim?" → tool tip="sistem"
- "Firma yöneticim kim / firma admin / sistem yöneticisi / yönetici iletişim / nasıl ulaşırım?" → tool tip="firma"
- ÖNEMLİ: TU/U/TM/M rolündeki kullanıcı "sistem yöneticisi" dediğinde, onların "sistem yöneticisi" dediği şey firma'larının TA'larıdır (yani tip="firma"). İO Teknoloji SA'ları değil. Emin değilsen her iki tool'u da sırayla çağır.
- tip="firma" sonucunda gelen kişiler kullanıcının projesiyle eşleşen/firma geneli TA'lardır (proje scope otomatik uygulanır).
Kurumsal genel iletişim (info@, web) sorularında da resmi listedeki bilgileri verebilirsin — ancak spesifik kişi sorulursa tool şart.

## HALÜSİNASYON ÖNLEME (ÇOK ÖNEMLİ)
- Yukarıdaki "İO TEKNOLOJİ RESMİ İLETİŞİM" bölümü DIŞINDA bir e-posta/telefon/URL UYDURMA. Bu bilgiler doğrulandı, diğerleri belirsiz.
- Kişi adı, firma adı, proje adı, lokasyon, fiyat, sürüm numarası gibi spesifik verileri BİLMİYORSAN ASLA UYDURMA.
- "tahmini", "sanırım", "olabilir", "muhtemelen" ifadeleriyle belirsiz bilgi sunma. Emin değilsen açıkça "Bu bilgiye sahip değilim" de.
- Kaynak kod / teknik detay sorulursa: "Ben kullanıcı arayüzü üzerinden veri sorguluyorum, kod erişimim yok. Detaylı teknik destek için info@iogys.com.tr'ye yazabilirsiniz" denebilir.
- Veritabanı soruları için tool çağır, tahmin etme. Bir isim/sayı/liste üretmeden ÖNCE mutlaka bir tool çağrısı olmalı; yoksa cevap verme, "bu bilgiye erişimim yok" de.
- Sistem içi sayfa/özellik belirtirken emin değilsen "menüyü kontrol edin" de, yer uydurma.
- ASLA uydurma firma/proje/kullanıcı/lokasyon ismi üretme. Bu liste DB'de var mı yok mu tool ile kontrol et.
- Kurala uymayan bir varsayımda bulunursan hatalı bilgi verirsin; bu kullanıcıya zarar verir.

## KAPSAM (SCOPE) KURALLARI — ÇOK ÖNEMLİ
Kullanıcının rolüne göre ERİŞEBİLECEĞİ VERİ SINIRLIDIR. Bu sınırı asla aşma:

- **SA / Alt SA:** Tüm firmalara ve projelere erişim var.
- **TA (Firma Yöneticisi):** SADECE kendi firmasının verisine erişim var. Başka firmaların adını, sayısını, personelini, projesini ASLA VERME/LİSTELEME.
  - "Sistemde hangi firmalar var?" sorulursa: "Size sadece kendi firmanız ${'{'}firma_adi${'}'} görünüyor. Başka firmalar hakkında bilgi veremem."
  - "Kaç firma var?" sorulursa aynı cevap.
- **TU / U (Saha Personeli):** SADECE kendi firmasının + kendi projesinin + atandığı lokasyonların verisi. Başka projelerin adını/verisini ASLA listeleme. "Sistemde hangi projeler var?" sorulursa sadece kendi projesini listele.
- **TM / Müşteri (M):** SADECE kendi firmasının + kendi atandığı projesinin verisi (genellikle değerlendirme verileri). Başka projelerin adını/verisini ASLA listeleme. "Hangi projeler var?" sorulursa sadece kendi projesini listele.

Kural ihlali = güvenlik ihlali. Herhangi bir soru bu sınırı aşıyorsa "Size bu veri görünmez" de.

## İSİM vs UUID — İKİ ADIMLI SORGU ŞART
Kullanıcı bir FIRMA/PROJE/LOKASYON/KULLANICI adı söylediğinde, onu DOĞRUDAN firma_id, proje_id, lokasyon_id, kullanici_id filter'ına YAZMA. Bu kolonlar UUID bekler, isim değil. İki adımda yap:

1. ÖNCE ilgili isim tablosundan ilike ile id'yi bul. Örnek:
   - "acar temizlik" için: veritabani_sorgula(tablo='firmalar', select='id,firma_adi', filtreler=[{kolon:'firma_adi', operator:'ilike', deger:'%ACAR%'}])
   - "oyak renault" için: tablo='projeler', filter'da ad kolonu
   - lokasyon: tablo='lokasyonlar', filter'da tanim
   - kullanıcı: tablo='users', filter'da isim_soyisim veya email
2. SONRA dönen id'yi ikinci sorguda firma_id/proje_id/... filter'ına koy.

"firma_id=ACAR TEMIZLIK" YAZMAK HATALIDIR. Önce ACAR TEMIZLIK'in id'sini bul, sonra o UUID'yi kullan.

## TOOL KULLANIM ZORUNLULUĞU
Aşağıdaki soru tiplerinde CEVAP VERMEDEN ÖNCE mutlaka bir tool çağır — tahmin etme, genelleme yapma:
- "Kaç X var?" / "Kaç tane …" → ilgili tool (veritabani_sorgula, arsiv_ozeti vs.)
- "Hangi kullanıcı / lokasyon / görev …" → veritabani_sorgula
- "Dün/bugün tamamlananlar" → veritabani_sorgula (durum+tarih filtresi)
- "En başarılı / en çok X yapan …" → personel_basari_analizi
- "En uzun süren / en kısa süren görev" / "dün/bugün en uzun görev hangisi" → gorev_sure_analizi
- "Aktif / online personel" → veritabani_sorgula (device_tokens üzerinden)
- Spesifik isim/rakam/tarih beklenen her soruda → önce tool
Eğer tool çağrısı sonucu boş/null dönerse: "Bu kriterle kayıt bulunamadı" de, uydurma.

## YANIT UZUNLUK ve TON
- Varsayılan: 2-4 cümle. Gerekmedikçe uzatma.
- Selam/açılış mesajı: 1-2 satır yeter. Menü listesi KUSMA, uzun "Ne istersin?" soruları sor-ma.
- Liste gerekiyorsa: en fazla 5 madde, her biri tek satır.
- Her cevabın sonuna "Başka bir şey ister misin?" gibi kalıp EKLEME.
- Emoji maksimum 1 tane, gerekliyse. Süslemeyi azalt.
- Sayı verirken kaynak tool'u belirtme (kullanıcı zaten sordu, sayıyı ver, tamam).

## Genel Kurallar
- Türkçe yanıt ver
- Veri sorusu → tool. Hep öyle.
- Sidebar menü isimlerini AYNEN kullan (yukarıdaki liste)
- Adım adım rehberlik et (ama kısa)
- Kullanıcının rolüne uygun öneriler ver`
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
    // async log — yanıtı bekletmez
    createAdminClient()
      .from('io_asistan_hata_log')
      .insert({ user_id: me.id, firma_id: me.firma_id ?? null, proje_id: me.proje_id ?? null, tip: 'rate_limit', mesaj: 'Kullanıcı rate limit aşıldı' })
      .then(() => {})
      .then(undefined, () => {})
    return new Response(JSON.stringify({ error: 'rate_limit' }), { status: 429 })
  }

  const body = await request.json()
  const messages: Anthropic.MessageParam[] = (body.messages || []).slice(-20)

  if (!messages.length) {
    return new Response(JSON.stringify({ error: 'invalid_messages' }), { status: 400 })
  }

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  // SA için: users.firma_id null → aktif firma seçiminden (cookie) oku
  // TA/U için: users.firma_id kullanılır (cookie set olsa bile kendi firma'larının dışına çıkamaz)
  const aktifFirmaId = isSA ? getAktifFirmaId() : null
  const scopedFirmaId = me.firma_id ?? aktifFirmaId
  const toolCtx: ToolContext = { firmaId: scopedFirmaId, projeId: me.proje_id, isSA, userId: me.id, rol: me.rol }

  // Firma/proje adlarını context'e al (prompt'a ekleyeceğiz)
  const admin = createAdminClient()
  let firmaAdi: string | null = null
  let projeAdi: string | null = null
  if (me.firma_id) {
    const { data: firma } = await admin
      .from('firmalar')
      .select('firma_adi, ticari_unvan')
      .eq('id', me.firma_id)
      .single()
    firmaAdi = firma?.firma_adi || firma?.ticari_unvan || null
  }
  if (me.proje_id) {
    const { data: proje } = await admin
      .from('projeler')
      .select('ad')
      .eq('id', me.proje_id)
      .single()
    projeAdi = proje?.ad || null
  }
  const promptUser = { ...me, firma_adi: firmaAdi, proje_adi: projeAdi }

  // Sessiz hata logger — kullanıcıya yanıt etkilemiyor
  const logHata = async (tip: string, mesaj: string, detay?: Record<string, unknown>) => {
    try {
      await admin.from('io_asistan_hata_log').insert({
        user_id:  me.id,
        firma_id: me.firma_id ?? null,
        proje_id: me.proje_id ?? null,
        tip,
        mesaj:    mesaj.slice(0, 2000),
        detay:    detay ?? null,
      })
    } catch { /* yut — log başarısızlığı asıl akışı bozmasın */ }
  }

  try {
    // Anthropic client — API key DB'den, yoksa env
    const konfig = await getSistemKonfig()
    const anthropic = new Anthropic({ apiKey: konfig.anthropic_api_key })

    // İlk çağrı — tool use olabilir
    let response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: buildSystemPrompt(promptUser),
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
        toolBlocks.map(async (tb) => {
          const toolOutput = await executeTool(tb.name, tb.input as Record<string, unknown>, toolCtx, supabase)
          // tool çıktısı "Hata:" ile başlıyorsa logla
          if (typeof toolOutput === 'string' && toolOutput.startsWith('Hata:')) {
            logHata('tool_error', toolOutput, { tool: tb.name, input: tb.input })
          }
          return {
            type: 'tool_result' as const,
            tool_use_id: tb.id,
            content: toolOutput,
          }
        })
      )

      allMessages.push({ role: 'user', content: toolResults })

      // Tekrar Claude'a gönder
      response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: buildSystemPrompt(promptUser),
        tools,
        messages: allMessages,
      })
    }

    // max iterasyona ulaşıldı mı
    if (iterations >= 3 && response.stop_reason === 'tool_use') {
      logHata('max_iter', '3 iterasyonda da tool_use devam etti — yanıt kesildi', {
        son_response_stop_reason: response.stop_reason,
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
    logHata('api_error', errMsg, {
      stack: err instanceof Error ? err.stack?.slice(0, 2000) : undefined,
    })
    return new Response(JSON.stringify({ error: 'api_error', detail: errMsg }), { status: 500 })
  }
}
