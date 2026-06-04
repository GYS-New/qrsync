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
import { gorevDurumPayload, type Kanal } from '@/lib/gorev/durum-degistir'

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'Oturum bulunamadı' }, { status: 401 })

    const { data: me } = await supabase
      .from('users').select('id,firma_id,rol,aktif').eq('id', user.id).single()
    if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 401 })

    // Pasif kullanıcı kontrolü
    if (me.aktif === false) {
      return NextResponse.json({ ok: false, error: 'Pasif durumdasınız! Lütfen sistem yöneticiniz ile iletişime geçin.' }, { status: 403 })
    }

    // Mesai kontrolü (firma + proje bazlı)
    if (me.rol === 'tenant_user' || me.rol === 'musteri') {
      const admin2 = createAdminClient()
      let personelTakibiAktif = false
      const { data: meUser } = await admin2.from('users').select('proje_id').eq('id', me.id).single()
      if (meUser?.proje_id) {
        const { data: proje } = await admin2.from('projeler').select('personel_takibi_aktif').eq('id', meUser.proje_id).single()
        personelTakibiAktif = proje?.personel_takibi_aktif === true
      }
      if (personelTakibiAktif) {
        const bugun = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
        const { data: mesai } = await admin2
          .from('personel_mesai_kayitlari')
          .select('id')
          .eq('user_id', me.id)
          .eq('kayit_tarihi', bugun)
          .is('cikis_saati', null)
          .maybeSingle()
        if (!mesai) {
          return NextResponse.json({ ok: false, error: 'Lütfen önce iş başı QR/NFC kodunu okutunuz.', code: 'MESAI_YOK' }, { status: 403 })
        }
      }
    }

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400 }) }

    const { gorev_id, kaynak, sablon_id, template_version, kanal, lokasyon_id, maddeler } = body
    if (!gorev_id || !kaynak || !kanal || !lokasyon_id) {
      return NextResponse.json({ ok: false, error: 'gorev_id, kaynak, kanal, lokasyon_id gerekli' }, { status: 400 })
    }
    if (kanal !== 'QR' && kanal !== 'NFC') {
      return NextResponse.json({ ok: false, error: 'kanal QR veya NFC olmalı' }, { status: 400 })
    }
    const scanKanal: Kanal = kanal

    const admin  = createAdminClient()
    const nowIso = new Date().toISOString()

    // Görevi çek — canli_gorevler'a özel kolonlar (acik_bekleme_saat, aktif_olma_tarihi)
    // resolveLiveCompletionStatusByTask kural-bazlı eşik için gerekli; gorevler tablosunda yok
    const selectCols = kaynak === 'canli_gorevler'
      ? 'id,firma_id,durum,atanan_kullanici_id,baslatilma_tarihi,aktif_olma_tarihi,acik_bekleme_saat'
      : 'id,firma_id,durum,atanan_kullanici_id,baslatilma_tarihi'
    const { data: gorev, error: gorevErr } = await admin
      .from(kaynak).select(selectCols).eq('id', gorev_id).single()
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

    // ── Proje çeklist ayarı kontrolü (fail-safe; UI zaten kontrol eder) ─────
    let webCeklistAktif = true
    {
      const ayarKolonu = kaynak === 'gorevler' ? 'spesifik_ceklist_aktif' : 'frekansiyel_ceklist_aktif'
      const [firmaCfg, projeCfg] = await Promise.all([
        admin.from('firmalar').select(ayarKolonu).eq('id', me.firma_id).single(),
        (me as any).proje_id
          ? admin.from('projeler').select(ayarKolonu).eq('id', (me as any).proje_id).single()
          : Promise.resolve({ data: null }),
      ])
      const p = (projeCfg.data as any)?.[ayarKolonu]
      const f = (firmaCfg.data as any)?.[ayarKolonu]
      webCeklistAktif = p != null ? !!p : (f != null ? !!f : true)
    }

    // ── Çeklist sonuçlarını kaydet ───────────────────────────────────────────
    if (webCeklistAktif && sablon_id && maddeler?.length) {
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
        return NextResponse.json({ ok: false, error: 'Çeklist başlığı oluşturulamadı: ' + (sonucErr?.message ?? '') }, { status: 500 })
      } else {
        const itemPayload = maddeler.map((m: any) => ({
          sonuc_id:       sonucRow.id,
          madde_id:       m.madde_id,
          secenek_degeri: m.secenek_degeri || null,
          aciklama:       m.aciklama?.trim() || null,
          gorsel_url:     m.gorsel_url || null,
        }))
        const { error: itemErr } = await admin.from('checklist_sonuc_maddeleri').insert(itemPayload)
        if (itemErr) {
          // ROLLBACK: madde insert fail olursa başlık da silinmeli — yetim/maddesiz başlık
          // birikmesini engeller (gorev-tamamla ve SIM ile aynı pattern)
          console.error('[scan/tamamla] madde insert error, başlık rollback:', itemErr)
          await admin.from('checklist_sonuc_basliklari').delete().eq('id', sonucRow.id)
          return NextResponse.json({ ok: false, error: 'Çeklist maddeleri kaydedilemedi: ' + itemErr.message }, { status: 500 })
        }
      }
    }

    // ── Görev durumunu güncelle ──────────────────────────────────────────────
    if (kaynak === 'gorevler') {
      const { error: updErr } = await admin.from('gorevler').update(gorevDurumPayload('TAMAMLANDI', scanKanal, {
        at: nowIso,
        ek: {
          islemi_yapan_id:          me.id,
          tamamlanma_tarihi:        nowIso,
          tamamlanma_suresi_saniye: sureSaniye,
        },
      }) as any).eq('id', gorev_id)
      if (updErr) throw new Error(updErr.message)
    } else {
      const nextStatus = resolveLiveCompletionStatusByTask(gorev as any, nowIso)
      if (nextStatus === 'ZAMANI_GECMIS') {
        return NextResponse.json({ ok: false, error: 'Zamanı geçmiş görev tamamlanamaz' }, { status: 409 })
      }
      const { error: updErr } = await admin.from('canli_gorevler').update(gorevDurumPayload(nextStatus as any, scanKanal, {
        at: nowIso,
        ek: {
          tamamlayan_kullanici_id:  me.id,
          islemi_yapan_id:          me.id,
          tamamlanma_tarihi:        nowIso,
          tamamlanma_suresi_saniye: sureSaniye,
        },
      }) as any).eq('id', gorev_id)
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
