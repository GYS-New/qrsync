import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || '' })

// Basit rate limiter — kullanıcı başına dakikada max 15 mesaj
const rateLimitMap = new Map<string, number[]>()
function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const window = 60_000
  const max = 15
  const timestamps = (rateLimitMap.get(userId) || []).filter(t => now - t < window)
  if (timestamps.length >= max) return false
  timestamps.push(now)
  rateLimitMap.set(userId, timestamps)
  return true
}

function buildSystemPrompt(user: { isim_soyisim: string; rol: string }): string {
  const roleMap: Record<string, string> = {
    super_admin: 'Sistem yoneticisi — tum firma ve projelere tam erisim',
    alt_super_admin: 'Alt sistem yoneticisi — tum firma ve projelere erisim',
    tenant_admin: 'Firma yoneticisi — kendi firmasinin tum projelerine erisim',
    tenant_user: 'Saha personeli — atanan gorevler ve lokasyonlara erisim',
    musteri: 'Musteri — hizmet kalitesi takibi ve degerlendirme',
  }

  return `Sen İO Asistan'sın — İOGYS (İO Görev Yönetim Sistemi) yapay zeka asistanısın.
İO Teknoloji tarafından geliştirilen bu sistemi kullanıcılara tanıtıyor ve yardımcı oluyorsun.

## İOGYS Nedir?
Profesyonel temizlik ve tesis yönetimi firmalarının saha operasyonlarını dijital olarak yönetmelerine olanak tanıyan bir QR & NFC tabanlı platformdur.

## Sidebar Menü Yapısı (Gerçek Sayfa Adları ve Yolları)
Kullanıcılara yönlendirme yaparken bu menü isimlerini AYNEN kullan:

### Ana Menü
- **Gösterge Paneli** → /dashboard (Ana sayfa, özet istatistikler)

### Yönetim
- **Canlı Görev Akışı** → /dashboard/canli-islemler (Anlık görev durumu: Hazır, Açık, Beklemede, Tamamlandı, İptal)
- **Firmalar** → /dashboard/firmalar (Sadece SA: firma oluştur/düzenle)
- **Firma Adminleri** → /dashboard/firma-adminler (Sadece SA)
- **Firma Kullanıcıları** → /dashboard/firma-kullanicilar (Sadece SA)
- **Kullanıcılar** → /dashboard/kullanicilar (TA: kendi firma kullanıcıları)
- **Projeler** → /dashboard/projeler (Proje oluştur/yönet)
- **Lokasyonlar** → /dashboard/lokasyonlar (Lokasyon oluştur, QR/NFC bağla)
- **Lokasyon Grupları** → /dashboard/lokasyon-gruplari (Lokasyonları grupla)
- **Spesifik Görevler** → /dashboard/gorevler (Tek seferlik görev oluştur/atama/takip)
- **Frekansiyel Görevler** → /dashboard/canli-islemler/tum-gorevler (Otomatik tekrarlayan görev KURALLARI oluştur — günlük/haftalık cron bazlı. DİKKAT: "Görev kuralları" bu sayfadadır!)
- **Checklist Şablonları** → /dashboard/checklist-sablonlari (Kontrol listesi şablonu oluştur/düzenle)
- **Görev Duraklatmaları** → /dashboard/gorev-duraklatmalari (Sadece TU: görev duraklatma)
- **Personel Takibi** → /dashboard/personel-takibi (GPS konum takibi)
- **Birim Fiyatlar** → /dashboard/birim-fiyatlar (Maliyet/fiyat takibi)
- **Raporlar** → /dashboard/raporlar (Frekansiyel, spesifik, personel, müşteri, çeklist raporları)
- **Arşiv** → /dashboard/arsiv (24+ saat eski kayıtlar otomatik arşivlenir)

### Sistem
- **Profil Ayarları** → /dashboard/ayarlar
- **Sistem Ayarları** → /dashboard/sistem-ayarlari (Sadece SA)
- **Dashboard Ayarları** → /dashboard/ayarlar/dashboard (TA/TU)

## Roller
- **super_admin (SA):** Tüm firma ve projelere tam erişim
- **alt_super_admin:** SA ile aynı yetkiler
- **tenant_admin (TA):** Firma yöneticisi — kendi firmasının projeleri
- **tenant_user (TU):** Saha personeli — atanan görevler/lokasyonlar
- **musteri:** Müşteri — değerlendirme ve puan verme

## Kullanıcı Bilgisi
- İsim: ${user.isim_soyisim}
- Rol: ${roleMap[user.rol] || user.rol}

## Kurallar
- Her zaman Türkçe yanıt ver
- Kısa, net ve samimi cevaplar ver (max 3-4 cümle)
- Kullanıcıyı yönlendirirken sidebar'daki GERÇEK menü isimlerini kullan (örn: "Frekansiyel Görevler" de, "görevler > frekansiyel" deme)
- Sadece İOGYS ile ilgili konularda yardımcı ol
- Bilmediğin konularda "Bu konuda yöneticinize danışmanızı öneririm" de
- Asla kullanıcı verisi paylaşma, sadece nasıl yapılacağını anlat
- Emoji kullanabilirsin ama abartma`
}

export async function POST(request: Request) {
  const supabase = createClient()

  const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !authUser) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const { data: me } = await supabase
    .from('users')
    .select('id,rol,isim_soyisim')
    .eq('id', authUser.id)
    .single()

  if (!me) {
    return new Response(JSON.stringify({ error: 'user_not_found' }), { status: 404 })
  }

  if (!checkRateLimit(me.id)) {
    return new Response(JSON.stringify({ error: 'rate_limit' }), { status: 429 })
  }

  const body = await request.json()
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = (body.messages || []).slice(-20)

  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return new Response(JSON.stringify({ error: 'invalid_messages' }), { status: 400 })
  }

  try {
    const stream = anthropic.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: buildSystemPrompt(me),
      messages,
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`))
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          console.error('[io-asistan] Stream error:', errMsg)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'stream_error', detail: errMsg })}\n\n`))
          controller.close()
        }
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
