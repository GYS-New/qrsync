/**
 * PATCH  /api/oto-yikama/gorev-kayitlari/[id]
 *   Body: { hedef_tarih?: 'YYYY-MM-DD', lokasyon_id?: string }
 *   Görev kaydını günceller. Sadece SA/TA — TA kendi firmasındaki kayıtlarla sınırlı.
 *
 * DELETE /api/oto-yikama/gorev-kayitlari/[id]
 *   Görevi (+ metadata cascade) siler.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

async function authorize() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Yetkisiz', status: 401 as const }
  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol)) {
    return { error: 'Bu işlem için SA veya TA yetkisi gerekli', status: 403 as const }
  }
  return { user, me }
}

async function loadGorev(id: string) {
  const admin = createAdminClient()
  const { data: gorev } = await admin
    .from('gorevler')
    .select('id, durum, firma_id, lokasyon_id, tanim')
    .eq('id', id)
    .single()
  if (!gorev) return null
  const { data: meta } = await admin
    .from('oto_yikama_gorev_metadata')
    .select('gorev_id, plaka_snapshot, hedef_tarih')
    .eq('gorev_id', id)
    .maybeSingle()
  if (!meta) return null // Oto Yıkama görevi değil
  return { gorev, meta }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorize()
  if ('error' in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const rec = await loadGorev(params.id)
  if (!rec) return NextResponse.json({ ok: false, error: 'Oto Yıkama görevi bulunamadı' }, { status: 404 })
  if (auth.me.rol === 'tenant_admin' && rec.gorev.firma_id !== auth.me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu görev sizin firmanıza ait değil' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({} as any))
  const yeniHedef = typeof body.hedef_tarih === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.hedef_tarih)
    ? body.hedef_tarih : null
  const yeniLok   = typeof body.lokasyon_id === 'string' && body.lokasyon_id.length > 0
    ? body.lokasyon_id : null

  if (!yeniHedef && !yeniLok) {
    return NextResponse.json({ ok: false, error: 'Güncellenecek alan yok (hedef_tarih veya lokasyon_id)' }, { status: 400 })
  }

  if (['TAMAMLANDI', 'IPTAL', 'SILINDI'].includes(rec.gorev.durum)) {
    return NextResponse.json({
      ok: false,
      error: `'${rec.gorev.durum}' durumundaki görev düzenlenemez. Düzenleme yalnız HAZIR/AÇIK/İŞLEMDE durumları için geçerli.`,
    }, { status: 409 })
  }

  const admin = createAdminClient()

  // Lokasyon değişimi varsa Oto Yıkama lokasyonu olduğunu doğrula
  if (yeniLok) {
    const { data: lok } = await admin
      .from('lokasyonlar')
      .select('id, firma_id, aktif, parent_id, parent:lokasyonlar!parent_id(oto_yikama_lokasyon)')
      .eq('id', yeniLok)
      .single()
    if (!lok || lok.firma_id !== rec.gorev.firma_id) {
      return NextResponse.json({ ok: false, error: 'Lokasyon firmaya ait değil' }, { status: 400 })
    }
    if (!lok.aktif) return NextResponse.json({ ok: false, error: 'Lokasyon pasif' }, { status: 400 })
    const parentOto = (lok.parent as any)?.oto_yikama_lokasyon === true
    if (!parentOto) {
      return NextResponse.json({ ok: false, error: 'Seçilen lokasyon bir Oto Yıkama istasyonu değil' }, { status: 400 })
    }
  }

  const gorevUpdate: Record<string, any> = {}
  const metaUpdate: Record<string, any> = {}
  if (yeniLok)   gorevUpdate.lokasyon_id = yeniLok
  if (yeniHedef) metaUpdate.hedef_tarih  = yeniHedef

  if (Object.keys(gorevUpdate).length > 0) {
    const { error } = await admin.from('gorevler').update(gorevUpdate).eq('id', params.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  if (Object.keys(metaUpdate).length > 0) {
    const { error } = await admin.from('oto_yikama_gorev_metadata').update(metaUpdate).eq('gorev_id', params.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  void auditLog({
    tip: 'oto_yikama_kayit_guncelle',
    tablo: 'gorevler',
    firma_id: rec.gorev.firma_id,
    kullanici_id: auth.user.id,
    detay: {
      gorev_id: params.id,
      plaka: rec.meta.plaka_snapshot,
      eski_hedef: rec.meta.hedef_tarih,
      eski_lokasyon: rec.gorev.lokasyon_id,
      yeni_hedef: yeniHedef,
      yeni_lokasyon: yeniLok,
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorize()
  if ('error' in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const rec = await loadGorev(params.id)
  if (!rec) return NextResponse.json({ ok: false, error: 'Oto Yıkama görevi bulunamadı' }, { status: 404 })
  if (auth.me.rol === 'tenant_admin' && rec.gorev.firma_id !== auth.me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu görev sizin firmanıza ait değil' }, { status: 403 })
  }

  const admin = createAdminClient()
  // metadata ON DELETE CASCADE ile gorevler'e bağlı → otomatik silinir
  const { error } = await admin.from('gorevler').delete().eq('id', params.id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  void auditLog({
    tip: 'oto_yikama_kayit_sil',
    tablo: 'gorevler',
    firma_id: rec.gorev.firma_id,
    kullanici_id: auth.user.id,
    detay: { gorev_id: params.id, plaka: rec.meta.plaka_snapshot, tanim: rec.gorev.tanim },
  })

  return NextResponse.json({ ok: true })
}
