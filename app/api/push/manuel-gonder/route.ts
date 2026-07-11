import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sendFCMToUser } from '@/lib/fcm-sender'
import { getEfektifAyar } from '@/lib/ayarlar/getEfektifAyar'

export const dynamic = 'force-dynamic'

/**
 * POST /api/push/manuel-gonder
 * body: { userIds: string[], title: string, body: string, kanal?: 'default'|'gorev_uyari'|'gorev_tamamla', link?: string }
 *
 * link: opsiyonel URL — bildirimler.link kolonuna yazılır; mobil "🔗 Bağlantıyı Aç"
 * butonu gösterir (mobil 1.0.35+, haberleşme msg de78c02e).
 *
 * Yetki:
 *   - Proje veya firma ayarında manuel_push_aktif=false → kimse gönderemez
 *   - manuel_push_aktif=true + rol SA/TA → herkese gönderebilir
 *   - rol U → sadece manuel_push_u_rolu=true ise
 *   - rol M (musteri) → sadece manuel_push_m_rolu=true ise
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('id,rol,firma_id,proje_id,isim_soyisim').eq('id', authUser.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const body = await req.json().catch(() => ({} as any))
  const userIds: string[] = Array.isArray(body.userIds) ? body.userIds.filter((x: any) => typeof x === 'string') : []
  const title: string = (body.title ?? '').toString().trim()
  const icerik: string = (body.body ?? '').toString().trim()
  const kanal: string = ['default', 'gorev_uyari', 'gorev_tamamla'].includes(body.kanal) ? body.kanal : 'default'
  const link: string = (body.link ?? '').toString().trim()

  if (!userIds.length) return NextResponse.json({ error: 'En az bir alıcı seçin' }, { status: 400 })
  if (!title) return NextResponse.json({ error: 'Başlık zorunlu' }, { status: 400 })
  if (!icerik) return NextResponse.json({ error: 'İçerik zorunlu' }, { status: 400 })
  if (title.length > 80) return NextResponse.json({ error: 'Başlık en fazla 80 karakter' }, { status: 400 })
  if (icerik.length > 500) return NextResponse.json({ error: 'İçerik en fazla 500 karakter' }, { status: 400 })
  if (link && !/^https?:\/\/.+/i.test(link)) {
    return NextResponse.json({ error: 'Link http:// veya https:// ile başlamalı' }, { status: 400 })
  }
  if (link.length > 500) return NextResponse.json({ error: 'Link en fazla 500 karakter' }, { status: 400 })

  const admin = createAdminClient()

  // Alıcıları doğrula ve firma/proje scope'unu zorla
  const { data: alicilar } = await admin
    .from('users').select('id,firma_id,proje_id,isim_soyisim').in('id', userIds)
  if (!alicilar || alicilar.length === 0) {
    return NextResponse.json({ error: 'Alıcı bulunamadı' }, { status: 400 })
  }

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const firmaId = isSA ? alicilar[0].firma_id : me.firma_id
  if (!firmaId) return NextResponse.json({ error: 'Firma bilgisi eksik' }, { status: 400 })

  // Scope kontrolü: SA hariç, alıcılar kendi firmasından olmalı
  for (const a of alicilar) {
    if (!isSA && a.firma_id !== me.firma_id) {
      return NextResponse.json({ error: 'Farklı firmadaki kullanıcılara bildirim gönderilemez' }, { status: 403 })
    }
  }

  // Efektif ayar: proje varsa proje, yoksa firma
  // Ortak proje yoksa firma seviyesinden bak
  const ortakProjeId: string | null =
    alicilar.every((a: any) => a.proje_id && a.proje_id === alicilar[0].proje_id) ? alicilar[0].proje_id : null
  const ayar = await getEfektifAyar(firmaId, ortakProjeId)

  if (!ayar.manuel_push_aktif) {
    return NextResponse.json({ error: 'Bu proje için manuel push bildirim kapalı' }, { status: 403 })
  }

  // Rol bazlı yetki
  const rol = me.rol
  if (rol === 'tenant_user' && !ayar.manuel_push_u_rolu) {
    return NextResponse.json({ error: 'U rolü için manuel push bildirim yetkisi kapalı' }, { status: 403 })
  }
  if (rol === 'musteri' && !ayar.manuel_push_m_rolu) {
    return NextResponse.json({ error: 'M rolü için manuel push bildirim yetkisi kapalı' }, { status: 403 })
  }
  if (!['super_admin', 'alt_super_admin', 'tenant_admin', 'tenant_user', 'musteri'].includes(rol)) {
    return NextResponse.json({ error: 'Rol bilinmiyor' }, { status: 403 })
  }

  // Bildirimi gönder ve logla
  const gonderenIsim = me.isim_soyisim ?? 'Sistem'
  const logKayitlari: any[] = []
  let basariliSayisi = 0

  const nowIso = new Date().toISOString()

  for (const a of alicilar) {
    // Cihaz sayısını öğren (log için)
    const { count: cihazSayisi } = await admin
      .from('device_tokens')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', a.id).eq('aktif', true)
      .not('fcm_token', 'is', null)

    // Mobil uygulamanın "Bildirimler" sayfasında kalıcı görünmesi için
    // bildirimler tablosuna kayıt at. FCM başarısız olsa bile kayıt durur —
    // kullanıcı uygulamayı açtığında bildirimi sayfasında görür.
    await admin.from('bildirimler').insert({
      alici_id: a.id,
      baslik: title,
      mesaj: icerik,
      tip: 'manuel_push',
      okundu: false,
      tarih: nowIso,
      ...(link ? { link } : {}),
    })

    try {
      // skipLog: manuel push kendi (zengin) push_bildirim_log INSERT'ini aşağıda yapıyor
      // sendFCMToUser'ın otomatik logu burada yinelemesin diye atla.
      await sendFCMToUser(a.id, title, icerik, kanal, undefined, { skipLog: true })
      basariliSayisi++
      logKayitlari.push({
        firma_id: firmaId, proje_id: a.proje_id ?? null,
        gonderen_id: me.id, gonderen_isim: gonderenIsim,
        alici_id: a.id, alici_isim: a.isim_soyisim ?? '—',
        baslik: title, icerik, kanal,
        cihaz_sayisi: cihazSayisi ?? 0,
        basarili: true, hata_mesaji: null,
      })
    } catch (err: any) {
      logKayitlari.push({
        firma_id: firmaId, proje_id: a.proje_id ?? null,
        gonderen_id: me.id, gonderen_isim: gonderenIsim,
        alici_id: a.id, alici_isim: a.isim_soyisim ?? '—',
        baslik: title, icerik, kanal,
        cihaz_sayisi: cihazSayisi ?? 0,
        basarili: false, hata_mesaji: err?.message ?? 'Bilinmeyen hata',
      })
    }
  }

  if (logKayitlari.length > 0) {
    await admin.from('push_bildirim_log').insert(logKayitlari)
  }

  return NextResponse.json({
    ok: true,
    toplam: alicilar.length,
    basarili: basariliSayisi,
  })
}
