/**
 * POST /api/scan/baslat
 * Süreli görevlerde görevi başlatır (ACIK → ISLEMDE + baslatilma_tarihi set)
 * Body: { gorev_id, kaynak: 'gorevler'|'canli_gorevler' }
 */
import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'Oturum bulunamadı' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id,firma_id,rol,aktif').eq('id', user.id).single()
    if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 401 })

    // Pasif kullanıcı kontrolü
    if (me.aktif === false) {
      return NextResponse.json({ ok: false, error: 'Pasif durumdasınız! Lütfen sistem yöneticiniz ile iletişime geçin.' }, { status: 403 })
    }

    // Mesai kontrolü (firma + proje bazlı)
    if (me.rol === 'tenant_user' || me.rol === 'musteri') {
      const admin2 = createAdminClient()
      let personelTakibiAktif = false
      const { data: firma } = await admin2.from('firmalar').select('personel_takibi_aktif').eq('id', me.firma_id).single()
      if (firma?.personel_takibi_aktif === true) personelTakibiAktif = true
      if (!personelTakibiAktif) {
        const { data: projeler } = await admin2.from('projeler').select('personel_takibi_aktif').eq('firma_id', me.firma_id).eq('aktif', true)
        if ((projeler ?? []).some((p: any) => p.personel_takibi_aktif === true)) personelTakibiAktif = true
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

    const { gorev_id, kaynak } = body
    if (!gorev_id || !kaynak) return NextResponse.json({ ok: false, error: 'gorev_id ve kaynak gerekli' }, { status: 400 })

    const admin  = createAdminClient()
    const nowIso = new Date().toISOString()

    const { data: gorev } = await admin.from(kaynak).select('id,firma_id,durum,atanan_kullanici_id,baslatilma_tarihi').eq('id', gorev_id).single()
    if (!gorev) return NextResponse.json({ ok: false, error: 'Görev bulunamadı' }, { status: 404 })
    if (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin' && gorev.firma_id !== me.firma_id) {
      return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })
    }
    if (gorev.baslatilma_tarihi) {
      return NextResponse.json({ ok: true, mesaj: 'Zaten başlatılmış', baslatilma_tarihi: gorev.baslatilma_tarihi })
    }

    const updatePayload: any = { baslatilma_tarihi: nowIso, baslatan_kullanici_id: me.id, durum_degisim_tarihi: nowIso, durum: 'ISLEMDE' }

    const { error: updErr } = await admin.from(kaynak).update(updatePayload).eq('id', gorev_id)
    if (updErr) throw new Error(updErr.message)

    return NextResponse.json({ ok: true, mesaj: 'Görev başlatıldı', baslatilma_tarihi: nowIso })
  } catch (err: any) {
    console.error('[scan/baslat]', err)
    return NextResponse.json({ ok: false, error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
