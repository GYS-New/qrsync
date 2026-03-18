import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildQuickReport, type QuickReportType } from '@/lib/reports/quick'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const ALLOWED_TYPES: QuickReportType[] = ['locations', 'users', 'live_tasks', 'manual_tasks', 'location_groups']

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 })

    const { data: me, error: meError } = await supabase
      .from('users')
      .select('id,rol,firma_id')
      .eq('id', authUser.id)
      .single()

    if (meError || !me) return NextResponse.json({ error: 'Kullanıcı profili bulunamadı.' }, { status: 403 })
    if (!['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol)) {
      return NextResponse.json({ error: 'Bu rapora erişim yetkiniz yok.' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const type = (searchParams.get('type') || 'locations') as QuickReportType
    if (!ALLOWED_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Geçersiz rapor tipi.' }, { status: 400 })
    }

    const requestedFirmaId = searchParams.get('firmaId') || null
    const firmaId = me.rol === 'tenant_admin' ? me.firma_id ?? null : requestedFirmaId
    const projeId = searchParams.get('projeId') || null

    const payload = await buildQuickReport(type, {
      firmaId,
      projeId,
      dateFrom: searchParams.get('dateFrom'),
      dateTo: searchParams.get('dateTo'),
      locationId: searchParams.get('locationId'),
      userId: searchParams.get('userId'),
      status: searchParams.get('status'),
      groupId: searchParams.get('groupId'),
    })

    return NextResponse.json(payload)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Hızlı rapor hazırlanamadı.' }, { status: 500 })
  }
}
