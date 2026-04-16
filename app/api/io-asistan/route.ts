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
const tools: Anthropic.Tool[] = [
  {
    name: 'bugunku_mesai',
    description: 'Bugün mesaiye giriş yapan personellerin listesini getirir. Giriş/çıkış saatleri ve süreleri ile birlikte.',
    input_schema: {
      type: 'object' as const,
      properties: {
        firma_id: { type: 'string', description: 'Firma ID (opsiyonel, belirtilmezse kullanıcının firması)' },
      },
      required: [],
    },
  },
  {
    name: 'gorev_ozeti',
    description: 'Spesifik görevlerin durum özetini getirir. Bugünkü veya belirtilen tarih aralığındaki görev sayıları (AÇIK, İŞLEMDE, TAMAMLANDI, İPTAL).',
    input_schema: {
      type: 'object' as const,
      properties: {
        tarih: { type: 'string', description: 'Tarih filtresi YYYY-MM-DD formatında (varsayılan: bugün)' },
      },
      required: [],
    },
  },
  {
    name: 'canli_gorev_durumu',
    description: 'Frekansiyel (canlı) görevlerin bugünkü durum özetini getirir. Kaç tanesi tamamlandı, işlemde, beklemede, gecikmiş vs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        tarih: { type: 'string', description: 'Tarih filtresi YYYY-MM-DD (varsayılan: bugün)' },
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
      },
      required: [],
    },
  },
]

// ── Tool çalıştırıcılar ──
type ToolContext = { firmaId: string | null; projeId: string | null; isSA: boolean }

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  const today = new Date().toISOString().split('T')[0]

  try {
    switch (name) {
      case 'bugunku_mesai': {
        let q = supabase
          .from('personel_mesai_kayitlari')
          .select('id,kullanici_id,giris_saati,cikis_saati,giris_tipi,cikis_tipi,users!kullanici_id(isim_soyisim)')
          .gte('giris_saati', `${today}T00:00:00`)
          .lte('giris_saati', `${today}T23:59:59`)
          .order('giris_saati', { ascending: false })
          .limit(50)
        if (!ctx.isSA && ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
        const { data, error } = await q
        if (error) return `Hata: ${error.message}`
        if (!data?.length) return 'Bugün henüz mesaiye giriş yapan personel yok.'
        return data.map((r: Record<string, unknown>) => {
          const user = r.users as Record<string, unknown> | null
          const isim = user?.isim_soyisim || 'Bilinmiyor'
          const giris = r.giris_saati ? new Date(r.giris_saati as string).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '-'
          const cikis = r.cikis_saati ? new Date(r.cikis_saati as string).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : 'Henüz çıkış yapmadı'
          return `• ${isim}: Giriş ${giris} (${r.giris_tipi}), Çıkış: ${cikis}`
        }).join('\n')
      }

      case 'gorev_ozeti': {
        const tarih = (input.tarih as string) || today
        let q = supabase
          .from('gorevler')
          .select('durum')
          .gte('kayit_tarihi', `${tarih}T00:00:00`)
          .lte('kayit_tarihi', `${tarih}T23:59:59`)
        if (!ctx.isSA && ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
        const { data, error } = await q
        if (error) return `Hata: ${error.message}`
        if (!data?.length) return `${tarih} tarihinde spesifik görev kaydı yok.`
        const counts: Record<string, number> = {}
        data.forEach((r: { durum: string }) => { counts[r.durum] = (counts[r.durum] || 0) + 1 })
        const total = data.length
        return `${tarih} Spesifik Görev Özeti (Toplam: ${total}):\n` +
          Object.entries(counts).map(([k, v]) => `• ${k}: ${v}`).join('\n')
      }

      case 'canli_gorev_durumu': {
        const tarih = (input.tarih as string) || today
        let q = supabase
          .from('canli_gorevler')
          .select('durum')
          .gte('olusturulma_tarihi', `${tarih}T00:00:00`)
          .lte('olusturulma_tarihi', `${tarih}T23:59:59`)
        if (!ctx.isSA && ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
        const { data, error } = await q
        if (error) return `Hata: ${error.message}`
        if (!data?.length) return `${tarih} tarihinde frekansiyel görev kaydı yok.`
        const counts: Record<string, number> = {}
        data.forEach((r: { durum: string }) => { counts[r.durum] = (counts[r.durum] || 0) + 1 })
        const total = data.length
        return `${tarih} Frekansiyel Görev Durumu (Toplam: ${total}):\n` +
          Object.entries(counts).map(([k, v]) => `• ${k}: ${v}`).join('\n')
      }

      case 'musteri_degerlendirmeleri': {
        const limit = (input.limit as number) || 10
        let q = supabase
          .from('musteri_degerlendirmeleri')
          .select('puan,yorum,musteri_adi,kayit_tarihi,lokasyonlar!lokasyon_id(tanim)')
          .order('kayit_tarihi', { ascending: false })
          .limit(limit)
        if (!ctx.isSA && ctx.firmaId) q = q.eq('firma_id', ctx.firmaId)
        const { data, error } = await q
        if (error) return `Hata: ${error.message}`
        if (!data?.length) return 'Henüz müşteri değerlendirmesi yok.'
        const avg = data.reduce((s: number, r: Record<string, unknown>) => s + (r.puan as number || 0), 0) / data.length
        return `Son ${data.length} Değerlendirme (Ort: ${avg.toFixed(1)}/5):\n` +
          data.map((r: Record<string, unknown>) => {
            const lok = r.lokasyonlar as Record<string, unknown> | null
            const tarih = r.kayit_tarihi ? new Date(r.kayit_tarihi as string).toLocaleDateString('tr-TR') : ''
            return `• ${'⭐'.repeat(r.puan as number || 0)} ${r.musteri_adi || 'Anonim'} — ${lok?.tanim || ''} (${tarih})${r.yorum ? ': "' + r.yorum + '"' : ''}`
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
        if (sadece_aktif) q = q.eq('aktif', true)
        const { data, error } = await q
        if (error) return `Hata: ${error.message}`
        if (!data?.length) return 'Kayıtlı personel bulunamadı.'
        return `Personel Listesi (${data.length} kişi):\n` +
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
        if (arama) q = q.ilike('tanim', `%${arama}%`)
        const { data, error } = await q
        if (error) return `Hata: ${error.message}`
        if (!data?.length) return arama ? `"${arama}" ile eşleşen lokasyon bulunamadı.` : 'Kayıtlı lokasyon yok.'
        return `Lokasyonlar (${data.length}):\n` +
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
