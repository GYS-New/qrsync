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
  const isU  = me.rol === 'tenant_user' || me.rol === 'musteri'
  if (!isSA && !isTA && !isU) return { ok: false, me: null, status: 403 }

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

  // arsivlendi parametresine göre doğru tabloyu seç
  const tableName = arsivlendi ? 'musteri_degerlendirmeleri_arsiv' : 'musteri_degerlendirmeleri'

  // Lokasyon yolu oluşturmak için tüm lokasyonları çek
  const { data: lokasyonlar } = await admin
    .from('lokasyonlar')
    .select('id, tanim, parent_id')
    .eq('firma_id', firmaId)

  const locMap: Record<string, { tanim: string; parent_id: string | null }> = {}
  ;(lokasyonlar ?? []).forEach((l: any) => {
    locMap[l.id] = { tanim: l.tanim, parent_id: l.parent_id ?? null }
  })

  function getLocPath(lokasyonId: string | null | undefined): string {
    if (!lokasyonId) return '—'
    const parts: string[] = []
    let cur: string | null = lokasyonId
    let guard = 0
    while (cur && guard < 8) {
      const node: { tanim: string; parent_id: string | null } | undefined = locMap[cur]
      if (!node) break
      parts.push(node.tanim)
      cur = node.parent_id
      guard++
    }
    return parts.reverse().join(' > ') || '—'
  }

  let q = admin
    .from(tableName)
    .select(
      arsivlendi
        ? `id, lokasyon_id, kanal, yildiz, yorum, ad_soyad, gorsel_url,
           olusturma_tarihi, arsivleme_tarihi`
        : `id, lokasyon_id, kanal, yildiz, yorum, ad_soyad, gorsel_url,
           olusturma_tarihi, arsivlendi, arsivleme_tarihi`
    )
    .eq('firma_id', firmaId)
    .order('olusturma_tarihi', { ascending: false })

  if (projeId)   q = (q as any).eq('proje_id', projeId)
  if (baslangic) q = (q as any).gte('olusturma_tarihi', baslangic)
  if (bitis)     q = (q as any).lte('olusturma_tarihi', bitis + 'T23:59:59')

  const { data, error } = await q
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  const kayitlar = (data ?? []).map((r: any) => ({
    id:                r.id,
    lokasyon_id:       r.lokasyon_id,
    lokasyon_tanim:    getLocPath(r.lokasyon_id),
    kanal:             r.kanal,
    yildiz:            r.yildiz,
    yorum:             r.yorum,
    ad_soyad:          r.ad_soyad,
    gorsel_url:        r.gorsel_url,
    olusturma_tarihi:  r.olusturma_tarihi,
    arsivlendi:        arsivlendi,
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

  // Kayıt asıl tablodan mı arsiv tablosundan mı check et
  const { data: mainRecord } = await admin
    .from('musteri_degerlendirmeleri')
    .select('*')
    .eq('id', id)
    .single()

  const { data: archiveRecord } = await admin
    .from('musteri_degerlendirmeleri_arsiv')
    .select('*')
    .eq('id', id)
    .single()

  const currentRecord = mainRecord || archiveRecord
  if (!currentRecord) return NextResponse.json({ ok: false, error: 'Kayıt bulunamadı' }, { status: 404 })
  if (me.isTA && currentRecord.firma_id !== me.firma_id)
    return NextResponse.json({ ok: false, error: 'Yetkisiz firma' }, { status: 403 })

  // arsivlendi parametresi varsa → TRANSFER işlemi
  if (arsivlendi !== undefined) {
    if (arsivlendi === true) {
      // ARŞIVLE: asıl → arsiv (sadece asıl tablodan alınr)
      if (!mainRecord) {
        return NextResponse.json({ ok: false, error: 'Sadece aktif kayıtlar arşivlenebilir' }, { status: 400 })
      }

      const arsivRecordData = {
        ...mainRecord,
        arsivleme_tarihi: new Date().toISOString(),
      }
      // arsivlendi alanını kaldır eğer varsa
      delete (arsivRecordData as any).arsivlendi

      const { error: insertErr } = await admin
        .from('musteri_degerlendirmeleri_arsiv')
        .insert(arsivRecordData)
      if (insertErr) return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 })

      const { error: deleteErr } = await admin
        .from('musteri_degerlendirmeleri')
        .delete()
        .eq('id', id)
      if (deleteErr) return NextResponse.json({ ok: false, error: deleteErr.message }, { status: 500 })
    } else {
      // ARŞIVDEN ÇIKAR: arsiv → asıl (sadece arsiv tablosundan alınır)
      if (!archiveRecord) {
        return NextResponse.json({ ok: false, error: 'Sadece arşivlenmiş kayıtlar geri yüklenebilir' }, { status: 400 })
      }

      const mainRecordData = {
        ...archiveRecord,
        arsivlendi: false,
        arsivleme_tarihi: null,
      }
      // arsivleme_tarihi alanını kaldır
      delete (mainRecordData as any).arsivleme_tarihi

      const { error: insertErr } = await admin
        .from('musteri_degerlendirmeleri')
        .insert(mainRecordData)
      if (insertErr) return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 })

      const { error: deleteErr } = await admin
        .from('musteri_degerlendirmeleri_arsiv')
        .delete()
        .eq('id', id)
      if (deleteErr) return NextResponse.json({ ok: false, error: deleteErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  // arsivlendi YOK ise → EDIT işlemi (sadece asıl tabloda)
  if (!mainRecord) {
    return NextResponse.json({ ok: false, error: 'Arşivlenmiş kayıtlar düzenlenemez' }, { status: 400 })
  }

  const guncelleme: Record<string, any> = {}
  if (yildiz !== undefined) {
    if (yildiz < 1 || yildiz > 5) return NextResponse.json({ ok: false, error: 'Geçersiz puan' }, { status: 400 })
    guncelleme.yildiz = yildiz
  }
  if (yorum    !== undefined) guncelleme.yorum    = yorum?.trim()    || null
  if (ad_soyad !== undefined) guncelleme.ad_soyad = ad_soyad?.trim() || null

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

  // Kayıt asıl tablodan mı arsiv tablosundan mı check et
  const { data: mainRecord } = await admin
    .from('musteri_degerlendirmeleri')
    .select('firma_id')
    .eq('id', id)
    .single()

  let kayit = mainRecord
  let fromArchive = false

  if (!kayit) {
    // Arsiv tablosundan kontrol et
    const { data: archiveRecord } = await admin
      .from('musteri_degerlendirmeleri_arsiv')
      .select('firma_id')
      .eq('id', id)
      .single()

    kayit = archiveRecord
    fromArchive = true
  }

  if (!kayit) return NextResponse.json({ ok: false, error: 'Kayıt bulunamadı' }, { status: 404 })
  if (me.isTA && kayit.firma_id !== me.firma_id)
    return NextResponse.json({ ok: false, error: 'Yetkisiz firma' }, { status: 403 })

  // Doğru tablodan sil
  const tableName = fromArchive ? 'musteri_degerlendirmeleri_arsiv' : 'musteri_degerlendirmeleri'
  const { error } = await admin
    .from(tableName)
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
