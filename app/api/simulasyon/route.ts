import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

async function yetkiKontrol(supabase: any) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return null
  if (!['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol)) return null
  return { ...me, userId: user.id }
}

// ── GET: firma/proje simülasyon ayarları (grup ayarları + personeller dahil) ──
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const me = await yetkiKontrol(supabase)
  if (!me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })

  const p = new URL(req.url).searchParams
  const firmaId = ['super_admin', 'alt_super_admin'].includes(me.rol) ? p.get('firma_id') : me.firma_id
  const projeId = p.get('proje_id')

  if (!firmaId) return NextResponse.json({ ok: true, data: [] })

  const admin = createAdminClient()
  let q = admin.from('simulasyon_ayarlari').select('*').eq('firma_id', firmaId)
  if (projeId) q = (q as any).eq('proje_id', projeId)

  const { data: ayarlar, error } = await q.order('olusturma_tarihi', { ascending: false })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  // Her ayar için grup ayarları ve personelleri çek
  const enriched = []
  for (const a of (ayarlar ?? [])) {
    const [grupRes, personelRes] = await Promise.all([
      admin.from('simulasyon_grup_ayarlari').select('*').eq('simulasyon_id', a.id),
      admin.from('simulasyon_personeller').select('user_id').eq('simulasyon_id', a.id),
    ])
    enriched.push({
      ...a,
      grup_ayarlari: grupRes.data ?? [],
      personel_idler: (personelRes.data ?? []).map((p: any) => p.user_id),
    })
  }

  return NextResponse.json({ ok: true, data: enriched })
}

// ── POST: yeni simülasyon oluştur (grup ayarları + personeller ile) ──────────
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const me = await yetkiKontrol(supabase)
  if (!me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const { firma_id, proje_id, ust_lokasyon_id, grup_ayarlari, personel_idler } = body

  const firmaId = ['super_admin', 'alt_super_admin'].includes(me.rol) ? (firma_id ?? me.firma_id) : me.firma_id
  if (!firmaId || !ust_lokasyon_id) {
    return NextResponse.json({ ok: false, error: 'firma_id ve ust_lokasyon_id zorunlu' }, { status: 400 })
  }
  if (!grup_ayarlari || !Array.isArray(grup_ayarlari) || grup_ayarlari.length === 0) {
    return NextResponse.json({ ok: false, error: 'En az bir grup ayarı gerekli' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Ana kayıt
  const { data: sim, error: simErr } = await admin.from('simulasyon_ayarlari').insert({
    firma_id: firmaId,
    proje_id: proje_id || null,
    ust_lokasyon_id,
    aktif: false,
    olusturan_id: me.userId,
  }).select().single()
  if (simErr) return NextResponse.json({ ok: false, error: simErr.message }, { status: 500 })

  // Grup ayarları
  const grupRows = grup_ayarlari.map((g: any) => ({
    simulasyon_id: sim.id,
    grup_id: g.grup_id,
    hedef_oran: g.hedef_oran ?? 100,
    vardiya_suresi_saat: g.vardiya_suresi_saat ?? 8,
  }))
  await admin.from('simulasyon_grup_ayarlari').insert(grupRows)

  // Personeller
  if (personel_idler?.length > 0) {
    const personelRows = personel_idler.map((uid: string) => ({
      simulasyon_id: sim.id,
      user_id: uid,
    }))
    await admin.from('simulasyon_personeller').insert(personelRows)
  }

  return NextResponse.json({ ok: true, data: sim })
}

// ── PATCH: güncelle (aktif/pasif, grup ayarları, personeller) ────────────────
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const me = await yetkiKontrol(supabase)
  if (!me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const { id, aktif, grup_ayarlari, personel_idler } = body
  if (!id) return NextResponse.json({ ok: false, error: 'id zorunlu' }, { status: 400 })

  const admin = createAdminClient()

  // Ana kayıt güncelle
  if (aktif !== undefined) {
    await admin.from('simulasyon_ayarlari').update({ aktif, guncelleme_tarihi: new Date().toISOString() }).eq('id', id)
  }

  // Grup ayarları yeniden yaz
  if (grup_ayarlari && Array.isArray(grup_ayarlari)) {
    await admin.from('simulasyon_grup_ayarlari').delete().eq('simulasyon_id', id)
    if (grup_ayarlari.length > 0) {
      const rows = grup_ayarlari.map((g: any) => ({
        simulasyon_id: id,
        grup_id: g.grup_id,
        hedef_oran: g.hedef_oran ?? 100,
        vardiya_suresi_saat: g.vardiya_suresi_saat ?? 8,
      }))
      await admin.from('simulasyon_grup_ayarlari').insert(rows)
    }
  }

  // Personeller yeniden yaz
  if (personel_idler && Array.isArray(personel_idler)) {
    await admin.from('simulasyon_personeller').delete().eq('simulasyon_id', id)
    if (personel_idler.length > 0) {
      const rows = personel_idler.map((uid: string) => ({
        simulasyon_id: id,
        user_id: uid,
      }))
      await admin.from('simulasyon_personeller').insert(rows)
    }
  }

  return NextResponse.json({ ok: true })
}

// ── DELETE ────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const me = await yetkiKontrol(supabase)
  if (!me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })

  const p = new URL(req.url).searchParams
  const id = p.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id zorunlu' }, { status: 400 })

  const admin = createAdminClient()
  // CASCADE silecek: grup_ayarlari + personeller otomatik silinir
  const { error } = await admin.from('simulasyon_ayarlari').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
