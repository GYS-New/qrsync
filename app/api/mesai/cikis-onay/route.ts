/**
 * POST /api/mesai/cikis-onay
 * Body: { token: string, karar: 'kapat' | 'devam' }
 *
 * Public endpoint — auth zorunlu degil (token dogrulamasi yeter). Personel
 * push bildiriminden gelen sayfadan cagirir.
 *
 * karar='kapat':
 *   - cikis_saati = vardiya bitis + 15dk, cikis_tipi = 'OTOMATIK_ONAY'
 *   - token invalidate (NULL)
 * karar='devam':
 *   - cikis_devam_flag = true → cron artik bu kayit icin push/otomatik kapama yapmaz
 *   - token invalidate
 *
 * Token tek kullanimlik — kullanildiktan sonra ayni istek 410 doner.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { aktifVardiyaAraligi } from '@/lib/scan/vardiya'
import { mergeVardiyaRows } from '@/lib/vardiya/getEffective'

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: 'Gecersiz JSON' }, { status: 400 })
  }

  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const karar = body?.karar
  if (!token || !['kapat', 'devam'].includes(karar)) {
    return NextResponse.json({ ok: false, error: 'token ve karar (kapat|devam) gerekli' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: mesai } = await admin
    .from('personel_mesai_kayitlari')
    .select('id, user_id, firma_id, proje_id, giris_saati, cikis_saati, cikis_onay_token, cikis_devam_flag')
    .eq('cikis_onay_token', token)
    .maybeSingle()

  if (!mesai) {
    return NextResponse.json({
      ok: false,
      error: 'Bu onay linki gecersiz veya zaten kullanildi.',
      code: 'TOKEN_GECERSIZ',
    }, { status: 410 })
  }

  if (mesai.cikis_saati) {
    // Zaten kapatilmis (personel arada QR okuttu veya cron zaman asimi ile kapatti)
    await admin.from('personel_mesai_kayitlari')
      .update({ cikis_onay_token: null })
      .eq('id', mesai.id)
    return NextResponse.json({
      ok: true,
      mesaj: 'İş çıkışınız zaten yapılmış.',
      code: 'ZATEN_KAPALI',
    })
  }

  if (karar === 'devam') {
    await admin.from('personel_mesai_kayitlari')
      .update({ cikis_devam_flag: true, cikis_onay_token: null })
      .eq('id', mesai.id)
    return NextResponse.json({ ok: true, mesaj: 'Devam ediyorsunuz. Çıkış saatinizi manuel okutmayı unutmayın.' })
  }

  // karar === 'kapat' → cikis_saati = vardiya bitis + 15 dk
  // (personel vardiya bitiminde cikmayi unuttu, +15dk = tahmini gecikme)
  const [{ data: firma }, projeRes] = await Promise.all([
    admin.from('firmalar').select('vardiya_sayisi, tum_vardiya_ayarlari').eq('id', mesai.firma_id).single(),
    mesai.proje_id
      ? admin.from('projeler').select('vardiya_sayisi, tum_vardiya_ayarlari').eq('id', mesai.proje_id).single()
      : Promise.resolve({ data: null }),
  ])
  const ev = mergeVardiyaRows(firma as any, projeRes.data as any)
  const vardiya = aktifVardiyaAraligi(ev.vardiya_sayisi, ev.tum_vardiya_ayarlari, mesai.giris_saati!)

  let cikisIso: string
  if (vardiya?.bitisISO) {
    cikisIso = new Date(new Date(vardiya.bitisISO).getTime() + 15 * 60 * 1000).toISOString()
  } else {
    // Vardiya tespit edilemedi (nadir) → simdiyi kullan
    cikisIso = new Date().toISOString()
  }

  const { error: updErr } = await admin
    .from('personel_mesai_kayitlari')
    .update({
      cikis_saati: cikisIso,
      cikis_tipi: 'OTOMATIK_ONAY',
      cikis_onay_token: null,
    })
    .eq('id', mesai.id)

  if (updErr) {
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    mesaj: `İş çıkışınız ${new Date(cikisIso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} olarak kaydedildi.`,
    cikis_saati: cikisIso,
  })
}
