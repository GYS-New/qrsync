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

// ── GET: simülasyon ayarları (grup ayarları + kural-personel atamaları dahil) ──
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

  // Her ayar için: grup ayarları + kural-personel atamaları
  const enriched = []
  for (const a of (ayarlar ?? [])) {
    const [grupRes, atamaRes] = await Promise.all([
      admin.from('simulasyon_grup_ayarlari').select('*').eq('simulasyon_id', a.id),
      admin.from('simulasyon_kural_atamalar').select('kural_id,personel_id').eq('simulasyon_id', a.id),
    ])
    // kural_id → personel_idler[] map'le
    const kuralMap = new Map<string, string[]>()
    for (const r of (atamaRes.data ?? [])) {
      const arr = kuralMap.get(r.kural_id) ?? []
      arr.push(r.personel_id)
      kuralMap.set(r.kural_id, arr)
    }
    const kural_atamalar = [...kuralMap.entries()].map(([kural_id, personel_idler]) => ({ kural_id, personel_idler }))
    enriched.push({
      ...a,
      grup_ayarlari: grupRes.data ?? [],
      kural_atamalar,
    })
  }

  return NextResponse.json({ ok: true, data: enriched })
}

// Kural atamalarını yaz/sil — POST ve PATCH ortak
async function kuralAtamalariYaz(admin: any, simulasyonId: string, kuralAtamalar: any[]) {
  // Önce eski atamaları temizle
  await admin.from('simulasyon_kural_atamalar').delete().eq('simulasyon_id', simulasyonId)
  // Yenileri ekle (kural × personel kartezyen)
  const rows: any[] = []
  for (const item of kuralAtamalar) {
    if (!item?.kural_id || !Array.isArray(item?.personel_idler)) continue
    for (const pid of item.personel_idler) {
      if (pid) rows.push({ simulasyon_id: simulasyonId, kural_id: item.kural_id, personel_id: pid })
    }
  }
  if (rows.length > 0) {
    await admin.from('simulasyon_kural_atamalar').insert(rows)
  }
}

// ── POST: yeni simülasyon (grup ayarları + kural atamaları) ──────────────────
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const me = await yetkiKontrol(supabase)
  if (!me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const { firma_id, proje_id, ust_lokasyon_id, grup_ayarlari, kural_atamalar } = body

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
    iptal_orani: g.iptal_orani ?? 1,
    gec_50_orani: g.gec_50_orani ?? 3,
    gec_100_orani: g.gec_100_orani ?? 2,
    erken_50_orani: g.erken_50_orani ?? 2,
  }))
  await admin.from('simulasyon_grup_ayarlari').insert(grupRows)

  // Kural-personel atamaları (yeni model — havuz yerine)
  if (Array.isArray(kural_atamalar)) {
    await kuralAtamalariYaz(admin, sim.id, kural_atamalar)
  }

  return NextResponse.json({ ok: true, data: sim })
}

// ── PATCH: güncelle (aktif/pasif, grup ayarları, kural atamaları) ───────────
export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const me = await yetkiKontrol(supabase)
  if (!me) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const { id, aktif, grup_ayarlari, kural_atamalar } = body
  if (!id) return NextResponse.json({ ok: false, error: 'id zorunlu' }, { status: 400 })

  const admin = createAdminClient()

  // Ana kayıt güncelle (aktif/pasif)
  if (aktif !== undefined) {
    await admin.from('simulasyon_ayarlari').update({ aktif, guncelleme_tarihi: new Date().toISOString() }).eq('id', id)
    // SİM durdurulduğunda sanal device_tokens'leri temizle (atanan personellere göre)
    if (aktif === false) {
      const { data: atamalar } = await admin.from('simulasyon_kural_atamalar').select('personel_id').eq('simulasyon_id', id)
      const personelIds = Array.from(new Set((atamalar ?? []).map((a: any) => a.personel_id)))
      if (personelIds.length > 0) {
        const simDeviceIds = personelIds.map((uid: string) => `sim-${uid}`)
        await admin.from('device_tokens').delete().in('device_id', simDeviceIds)
      }
    }
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
        iptal_orani: g.iptal_orani ?? 1,
        gec_50_orani: g.gec_50_orani ?? 3,
        gec_100_orani: g.gec_100_orani ?? 2,
        erken_50_orani: g.erken_50_orani ?? 2,
      }))
      await admin.from('simulasyon_grup_ayarlari').insert(rows)
    }
  }

  // Kural-personel atamaları yeniden yaz
  if (Array.isArray(kural_atamalar)) {
    await kuralAtamalariYaz(admin, id, kural_atamalar)
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
  // CASCADE: grup_ayarlari + kural_atamalar + (varsa) eski personeller otomatik silinir
  const { error } = await admin.from('simulasyon_ayarlari').delete().eq('id', id)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
