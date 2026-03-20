import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// ── yetki yardımcısı ──────────────────────────────────────────────────────────
async function yetkiKontrol(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, me: null, status: 401 }

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return { ok: false, me: null, status: 403 }

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return { ok: false, me: null, status: 403 }

  return { ok: true, me: { ...me, isSA, isTA } }
}

// ── GET: liste ────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const admin    = createAdminClient()

  const { ok, me, status } = await yetkiKontrol(supabase)
  if (!ok || !me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status })

  const p         = new URL(req.url).searchParams
  const firmaId   = me.isSA ? p.get('firma_id') : me.firma_id
  const projeId   = p.get('proje_id')
  const baslangic = p.get('baslangic')
  const bitis     = p.get('bitis')
  const arsivlendi = p.get('arsivlendi') === 'true'

  if (!firmaId) return NextResponse.json({ ok: true, data: [] })
  if (me.isTA && p.get('firma_id') && p.get('firma_id') !== me.firma_id)
    return NextResponse.json({ ok: false, error: 'Yetkisiz firma' }, { status: 403 })

  let q = admin
    .from('musteri_degerlendirmeleri')
    .select(`
      id, lokasyon_id, kanal, yildiz, yorum, ad_soyad, gorsel_url,
      olusturma_tarihi, arsivlendi, arsivleme_tarihi,
      lokasyonlar ( tanim )
    `)
    .eq('firma_id', firmaId)
    .eq('arsivlendi', arsivlendi)
    .order('olusturma_tarihi', { ascending: false })

  if (projeId)   q = (q as any).eq('proje_id', projeId)
  if (baslangic) q = (q as any).gte('olusturma_tarihi', baslangic)
  if (bitis)     q = (q as any).lte('olusturma_tarihi', bitis + 'T23:59:59')

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const kayitlar = (data ?? []).map((r: any) => ({
    id:                r.id,
    lokasyon_id:       r.lokasyon_id,
    lokasyon_tanim:    r.lokasyonlar?.tanim ?? '—',
    kanal:             r.kanal,
    yildiz:            r.yildiz,
    yorum:             r.yorum,
    ad_soyad:          r.ad_soyad,
    gorsel_url:        r.gorsel_url,
    olusturma_tarihi:  r.olusturma_tarihi,
    arsivlendi:        r.arsivlendi,
    arsivleme_tarihi:  r.arsivleme_tarihi,
  }))

  return NextResponse.json({ ok: true, data: kayitlar })
}

// ── PATCH: düzenle veya arşivle/arşivden çıkar ────────────────────────────────
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const admin    = createAdminClient()

  const { ok, me, status } = await yetkiKontrol(supabase)
  if (!ok || !me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status })

  let body: any
  try { body = await req.json() } catch {
    return NextResponse.json({ ok: false, error: 'Geçersiz istek' }, { status: 400 })
  }

  const { id, yildiz, yorum, ad_soyad, arsivlendi } = body
  if (!id) return NextResponse.json({ ok: false, error: 'id gerekli' }, { status: 400 })

  const { data: kayit } = await admin
    .from('musteri_degerlendirmeleri')
    .select('firma_id')
    .eq('id', id)
    .single()

  if (!kayit) return NextResponse.json({ ok: false, error: 'Kayıt bulunamadı' }, { status: 404 })
  if (me.isTA && kayit.firma_id !== me.firma_id)
    return NextResponse.json({ ok: false, error: 'Yetkisiz firma' }, { status: 403 })

  const guncelleme: Record<string, any> = {}

  if (arsivlendi !== undefined) {
    guncelleme.arsivlendi       = arsivlendi
    guncelleme.arsivleme_tarihi = arsivlendi ? new Date().toISOString() : null
  } else {
    if (yildiz !== undefined) {
      if (yildiz < 1 || yildiz > 5) return NextResponse.json({ ok: false, error: 'Geçersiz puan' }, { status: 400 })
      guncelleme.yildiz = yildiz
    }
    if (yorum    !== undefined) guncelleme.yorum    = yorum?.trim()    || null
    if (ad_soyad !== undefined) guncelleme.ad_soyad = ad_soyad?.trim() || null
  }

  if (Object.keys(guncelleme).length === 0)
    return NextResponse.json({ ok: false, error: 'Güncellenecek alan yok' }, { status: 400 })

  const { error } = await admin
    .from('musteri_degerlendirmeleri')
    .update(guncelleme)
    .eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// ── DELETE: kalıcı sil ────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const admin    = createAdminClient()

  const { ok, me, status } = await yetkiKontrol(supabase)
  if (!ok || !me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id gerekli' }, { status: 400 })

  const { data: kayit } = await admin
    .from('musteri_degerlendirmeleri')
    .select('firma_id')
    .eq('id', id)
    .single()

  if (!kayit) return NextResponse.json({ ok: false, error: 'Kayıt bulunamadı' }, { status: 404 })
  if (me.isTA && kayit.firma_id !== me.firma_id)
    return NextResponse.json({ ok: false, error: 'Yetkisiz firma' }, { status: 403 })

  const { error } = await admin
    .from('musteri_degerlendirmeleri')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
