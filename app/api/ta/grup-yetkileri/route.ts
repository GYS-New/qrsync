import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// TA sadece kendi firmasının musteri ve tenant_user rollerini yönetebilir
const GECERLI_ROLLER = ['musteri', 'tenant_user']

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || me.rol !== 'tenant_admin') return NextResponse.json({ error: 'Sadece TA yapabilir' }, { status: 403 })
  if (!me.firma_id) return NextResponse.json({ ok: true, yetkileri: [] })

  const admin = createAdminClient()

  // Firma bazlı kayıtları çek
  const { data: firmaRows } = await admin
    .from('kullanici_grubu_yetkileri')
    .select('*')
    .eq('firma_id', me.firma_id)
    .in('rol', GECERLI_ROLLER)
    .order('rol')
    .order('sayfa_kodu')

  // Global kayıtları da çek (fallback göstermek için)
  const { data: globalRows } = await admin
    .from('kullanici_grubu_yetkileri')
    .select('*')
    .is('firma_id', null)
    .in('rol', GECERLI_ROLLER)
    .order('rol')
    .order('sayfa_kodu')

  return NextResponse.json({ ok: true, yetkileri: firmaRows ?? [], globalYetkileri: globalRows ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || me.rol !== 'tenant_admin') return NextResponse.json({ error: 'Sadece TA yapabilir' }, { status: 403 })
  if (!me.firma_id) return NextResponse.json({ error: 'Firma bulunamadı' }, { status: 400 })

  const body = await req.json().catch(() => null)
  if (!body || !Array.isArray(body.yetkileri)) {
    return NextResponse.json({ error: 'Geçersiz veri' }, { status: 400 })
  }

  const rows = (body.yetkileri as any[])
    .filter(y => GECERLI_ROLLER.includes(y.rol) && typeof y.sayfa_kodu === 'string' && y.sayfa_kodu.length > 0)
    .map(y => ({
      firma_id: me.firma_id,
      rol: String(y.rol),
      sayfa_kodu: String(y.sayfa_kodu),
      gorebilir: y.gorebilir === true,
      ekleyebilir: y.ekleyebilir === true,
      duzenleyebilir: y.duzenleyebilir === true,
      silebilir: y.silebilir === true,
    }))

  if (rows.length === 0) return NextResponse.json({ error: 'Kaydedilecek satır yok' }, { status: 400 })

  const admin = createAdminClient()

  // Sadece kendi firmasının kayıtlarını sil
  const { error: delErr } = await admin
    .from('kullanici_grubu_yetkileri')
    .delete()
    .eq('firma_id', me.firma_id)
    .in('rol', GECERLI_ROLLER)

  if (delErr) return NextResponse.json({ error: `Silme: ${delErr.message}` }, { status: 500 })

  const { error: insErr } = await admin.from('kullanici_grubu_yetkileri').insert(rows)
  if (insErr) return NextResponse.json({ error: `Ekleme: ${insErr.message}` }, { status: 500 })

  const { data: guncellenmis } = await admin
    .from('kullanici_grubu_yetkileri')
    .select('*')
    .eq('firma_id', me.firma_id)
    .in('rol', GECERLI_ROLLER)
    .order('rol')
    .order('sayfa_kodu')

  return NextResponse.json({ ok: true, count: rows.length, yetkileri: guncellenmis ?? [] })
}
