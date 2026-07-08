/**
 * PATCH /api/oto-yikama/onay-bekleyen/[id]
 *
 * Amir aksiyonları — onayla / düzenle-onayla / reddet.
 *
 * Body:
 *   { action: 'onayla' | 'reddet',
 *     duzenleme?: {                    // opsiyonel — düzenleyip onaylama
 *       plaka?: string,                 // normalize edilir
 *       departman?: string | null,
 *       kullanici_adi_soyadi?: string | null,
 *       varsayilan_lokasyon_id?: string | null,
 *       km?: number | null,
 *       notlar?: string | null,
 *     }
 *   }
 *
 * Erişim: SA veya firmanin atanmış amiri (oto_yikama_onay_yetkilisi_id).
 *
 * Aksiyonlar:
 *   • onayla → onay_durumu='ONAYLANDI' + araclar'a plaka INSERT (yoksa)
 *              + arac_id metadata'ya yazılır. duzenleme.km / notlar da uygulanır.
 *   • reddet → gorevler + metadata HARD DELETE (araclar'a hiç girmemişti).
 *
 * Response: { ok: true, gorev_id, onay_durumu?, arac_id?, silindi?: true }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { normalizePlaka } from '@/lib/oto-yikama/plakaFuzzyMatch'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function assertAmir(userId: string, userRol: string, firmaId: string, admin: any): Promise<string | null> {
  const isSA = ['super_admin', 'alt_super_admin'].includes(userRol)
  if (isSA) return null
  const { data: firma } = await admin
    .from('firmalar')
    .select('oto_yikama_onay_yetkilisi_id')
    .eq('id', firmaId)
    .single()
  if ((firma as any)?.oto_yikama_onay_yetkilisi_id !== userId) {
    return 'Bu firmaya erişim yok'
  }
  return null
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const gorevId = ctx.params.id
  if (!gorevId) return NextResponse.json({ ok: false, error: 'gorev_id gerekli' }, { status: 400 })

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id, rol').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const action = body?.action as 'onayla' | 'reddet' | undefined
  if (action !== 'onayla' && action !== 'reddet') {
    return NextResponse.json({ ok: false, error: "action 'onayla' veya 'reddet' olmalı" }, { status: 400 })
  }

  const admin = createAdminClient()

  // Metadata + görev bilgisi
  const { data: meta } = await admin
    .from('oto_yikama_gorev_metadata')
    .select('gorev_id, plaka_snapshot, arac_id, hedef_tarih, km, notlar, onay_durumu')
    .eq('gorev_id', gorevId)
    .maybeSingle()
  if (!meta) {
    return NextResponse.json({ ok: false, error: 'Kayıt bulunamadı' }, { status: 404 })
  }
  if (meta.onay_durumu !== 'ONAY_BEKLIYOR') {
    return NextResponse.json(
      { ok: false, error: `Kayıt onay durumu '${meta.onay_durumu}', işlem yapılamaz` },
      { status: 409 },
    )
  }

  const { data: gorev } = await admin
    .from('gorevler')
    .select('id, firma_id, lokasyon_id')
    .eq('id', gorevId)
    .maybeSingle()
  if (!gorev) {
    return NextResponse.json({ ok: false, error: 'Görev bulunamadı' }, { status: 404 })
  }

  const firmaId = gorev.firma_id as string
  const yetkiHata = await assertAmir(me.id, me.rol, firmaId, admin)
  if (yetkiHata) return NextResponse.json({ ok: false, error: yetkiHata }, { status: 403 })

  // ─── REDDET → hard delete ─────────────────────────────────────────
  if (action === 'reddet') {
    // metadata FK ON DELETE CASCADE varsayımı: gorevler silinince metadata da
    // gider. Yine de emin olmak icin metadata'yi de acikca sil.
    await admin.from('oto_yikama_gorev_metadata').delete().eq('gorev_id', gorevId)
    const { error } = await admin.from('gorevler').delete().eq('id', gorevId)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, gorev_id: gorevId, silindi: true })
  }

  // ─── ONAYLA (opsiyonel düzenleme) ─────────────────────────────────
  const d = (body?.duzenleme ?? {}) as Record<string, any>

  // Plaka düzeltme (opsiyonel)
  let plaka = meta.plaka_snapshot as string
  if (typeof d.plaka === 'string' && d.plaka.trim()) {
    const yeni = normalizePlaka(d.plaka)
    if (!yeni || yeni.length < 4) {
      return NextResponse.json({ ok: false, error: 'Düzenlenen plaka geçersiz' }, { status: 400 })
    }
    plaka = yeni
  }

  // 1) araclar — mevcut mu, ekle
  // Aynı firmada aynı plaka varsa mevcut arac_id'yi kullan; yoksa yeni INSERT.
  let aracId: string
  {
    const { data: mevcut } = await admin
      .from('araclar')
      .select('id, plaka')
      .eq('firma_id', firmaId)
      .eq('plaka', plaka)
      .maybeSingle()
    if (mevcut) {
      aracId = (mevcut as any).id
      // Duzenleme alanlarini mevcut araca uygula (opsiyonel)
      const guncelle: Record<string, any> = {}
      if (typeof d.departman === 'string' || d.departman === null) guncelle.departman = d.departman ?? null
      if (typeof d.kullanici_adi_soyadi === 'string' || d.kullanici_adi_soyadi === null) guncelle.kullanici_adi_soyadi = d.kullanici_adi_soyadi ?? null
      if (typeof d.varsayilan_lokasyon_id === 'string' || d.varsayilan_lokasyon_id === null) guncelle.varsayilan_lokasyon_id = d.varsayilan_lokasyon_id ?? null
      if (Object.keys(guncelle).length > 0) {
        await admin.from('araclar').update(guncelle).eq('id', aracId)
      }
    } else {
      const { data: yeniArac, error: aErr } = await admin
        .from('araclar')
        .insert({
          plaka,
          firma_id: firmaId,
          aktif: true,
          departman: typeof d.departman === 'string' ? d.departman : null,
          kullanici_adi_soyadi: typeof d.kullanici_adi_soyadi === 'string' ? d.kullanici_adi_soyadi : null,
          varsayilan_lokasyon_id: typeof d.varsayilan_lokasyon_id === 'string' ? d.varsayilan_lokasyon_id : null,
        })
        .select('id')
        .single()
      if (aErr || !yeniArac) {
        return NextResponse.json(
          { ok: false, error: aErr?.message ?? 'Araç oluşturulamadı' },
          { status: 500 },
        )
      }
      aracId = yeniArac.id
    }
  }

  // 2) metadata güncelle — onay_durumu, arac_id, plaka_snapshot, km, notlar
  const metaPatch: Record<string, any> = {
    onay_durumu: 'ONAYLANDI',
    arac_id: aracId,
    plaka_snapshot: plaka,
  }
  if (d.km !== undefined) metaPatch.km = d.km === null ? null : Number(d.km)
  if (d.notlar !== undefined) metaPatch.notlar = d.notlar === null ? null : String(d.notlar)

  const { error: mErr } = await admin
    .from('oto_yikama_gorev_metadata')
    .update(metaPatch)
    .eq('gorev_id', gorevId)
  if (mErr) return NextResponse.json({ ok: false, error: mErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    gorev_id: gorevId,
    onay_durumu: 'ONAYLANDI',
    arac_id: aracId,
    plaka,
  })
}
