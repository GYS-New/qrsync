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

## Temel Özellikler
- **Spesifik Görevler:** Tek seferlik görev oluşturma, atama ve takip
- **Frekansiyel Görevler:** Otomatik tekrarlayan görev kuralları (günlük/haftalık)
- **Canlı Görev Akışı:** Anlık görev durumu takibi (Hazır, Açık, Beklemede, Tamamlandı, İptal)
- **Checklist Şablonları:** Standart kontrol listesi oluşturma ve doldurma
- **Lokasyonlar & Gruplar:** Hiyerarşik lokasyon yönetimi, QR/NFC bağlama
- **Personel Takibi:** GPS tabanlı saha personeli konum takibi
- **Mesai Takibi:** QR/NFC ile giriş-çıkış kayıtları
- **Raporlar:** Frekansiyel, spesifik, personel, müşteri, çeklist raporları
- **Müşteri Değerlendirmeleri:** Hizmet kalitesi puanlama (1-5 yıldız + yorum)
- **Birim Fiyatlar:** Maliyet ve fiyat takibi
- **Arşiv:** 24 saat sonra eski kayıtlar arşive taşınır

## Kullanıcı Bilgisi
- İsim: ${user.isim_soyisim}
- Rol: ${roleMap[user.rol] || user.rol}

## Kurallar
- Her zaman Türkçe yanıt ver
- Kısa, net ve samimi cevaplar ver (max 3-4 cümle)
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
      model: 'claude-3-haiku-20240307',
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
    console.error('[io-asistan] API error:', err)
    return new Response(JSON.stringify({ error: 'api_error', detail: String(err) }), { status: 500 })
  }
}
