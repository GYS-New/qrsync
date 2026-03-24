/**
 * POST /api/scan/tamamla
 * Authenticated session ile görev tamamlama.
 * Admin client kullanır — RLS bypass.
 * Body: {
 *   gorev_id, kaynak: 'gorevler'|'canli_gorevler',
 *   sablon_id?, template_version?,
 *   kanal: 'QR'|'NFC',
 *   lokasyon_id,
 *   maddeler?: { madde_id, secenek_degeri, aciklama, gorsel_url }[]
 * }
 */
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { resolveLiveCompletionStatusByTask } from '@/lib/tasks/liveStatus'

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'Oturum bulunamadı' }, { status: 401 })

    const { data: me } = await supabase
      .from('users').select('id,firma_id,rol').eq('id', user.id).single()
    if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 401 })

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400 }) }

    const { gorev_id, kaynak, sablon_id, template_version, kanal, lokasyon_id, maddeler } = body
    if (!gorev_id || !kaynak || !kanal || !lokasyon_id) {
      return NextResponse.json({ ok: false, error: 'gorev_id, kaynak, kanal, lokasyon_id gerekli' }, { status: 400 })
    }

    const admin  = createAdminClient()
    const nowIso = new Date().toISOString()

    // Görevi çek
    const { data: gorev, error: gorevErr } = await admin
      .from(kaynak).select('id,firma_id,durum,atanan_kullanici_id,baslatilma_tarihi').eq('id', gorev_id).single()
    if (gorevErr || !gorev) return NextResponse.json({ ok: false, error: 'Görev bulunamadı' }, { status: 404 })

    if (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin' && gorev.firma_id !== me.firma_id) {
      return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })
    }
    if (gorev.atanan_kullanici_id && gorev.atanan_kullanici_id !== me.id) {
      return NextResponse.json({ ok: false, error: 'Bu görev size atanmış değil' }, { status: 403 })
    }

    const tamamlanabilir = kaynak === 'gorevler'
      ? ['ACIK', 'ISLEMDE'].includes(gorev.durum)
      : ['ACIK', 'BEKLEMEDE', 'ISLEMDE'].includes(gorev.durum)
    if (!tamamlanabilir) {
      return NextResponse.json({ ok: false, error: `Görev ${gorev.durum} durumunda` }, { status: 409 })
    }

    // Süre hesapla
    const sureSaniye = gorev.baslatilma_tarihi
      ? Math.max(0, Math.floor((new Date(nowIso).getTime() - new Date(gorev.baslatilma_tarihi).getTime()) / 1000))
      : null

    // ── Çeklist sonuçlarını kaydet ───────────────────────────────────────────
    if (sablon_id && maddeler?.length) {
      const payload: any = {
        lokasyon_id,
        sablon_id,
        template_version: template_version ?? 1,
        kanal,
        kullanici_id: me.id,
      }
      if (kaynak === 'gorevler')        payload.gorev_id        = gorev_id
      else                               payload.canli_gorev_id  = gorev_id

      const { data: sonucRow, error: sonucErr } = await admin
        .from('checklist_sonuc_basliklari').insert(payload).select('id').single()
      if (sonucErr || !sonucRow) {
        console.error('[scan/tamamla] checklist sonuc insert error:', sonucErr)
      } else {
        const itemPayload = maddeler.map((m: any) => ({
          sonuc_id:       sonucRow.id,
          madde_id:       m.madde_id,
          secenek_degeri: m.secenek_degeri || null,
          aciklama:       m.aciklama?.trim() || null,
          gorsel_url:     m.gorsel_url || null,
        }))
        const { error: itemErr } = await admin.from('checklist_sonuc_maddeleri').insert(itemPayload)
        if (itemErr) console.error('[scan/tamamla] madde insert error:', itemErr)
      }
    }

    // ── Görev durumunu güncelle ──────────────────────────────────────────────
    if (kaynak === 'gorevler') {
      const { error: updErr } = await admin.from('gorevler').update({
        durum:                    'TAMAMLANDI',
        islemi_yapan_id:          me.id,
        durum_degisim_tarihi:     nowIso,
        tamamlanma_tarihi:        nowIso,
        tamamlanma_suresi_saniye: sureSaniye,
      } as any).eq('id', gorev_id)
      if (updErr) throw new Error(updErr.message)
    } else {
      const nextStatus = resolveLiveCompletionStatusByTask(gorev as any, nowIso)
      if (nextStatus === 'ZAMANI_GECMIS') {
        return NextResponse.json({ ok: false, error: 'Zamanı geçmiş görev tamamlanamaz' }, { status: 409 })
      }
      const { error: updErr } = await admin.from('canli_gorevler').update({
        durum:                    nextStatus,
        tamamlayan_kullanici_id:  me.id,
        islemi_yapan_id:          me.id,
        tamamlanma_tarihi:        nowIso,
        durum_degisim_tarihi:     nowIso,
        tamamlanma_suresi_saniye: sureSaniye,
      } as any).eq('id', gorev_id)
      if (updErr) throw new Error(updErr.message)
    }

    return NextResponse.json({
      ok: true,
      mesaj: `Görev tamamlandı${sureSaniye ? ` · ${Math.floor(sureSaniye/60)}dk ${sureSaniye%60}sn` : ''}`,
      durum: kaynak === 'gorevler' ? 'TAMAMLANDI' : resolveLiveCompletionStatusByTask(gorev as any, nowIso),
    })
  } catch (err: any) {
    console.error('[scan/tamamla]', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
