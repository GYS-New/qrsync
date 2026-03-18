import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildReportData } from '@/lib/reports/data'
import { getReportDefinition, type ReportKey } from '@/lib/reports/config'

export async function GET(request: Request) {
  try {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 })

    const { data: me, error: meErr } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
    if (meErr || !me) return NextResponse.json({ error: 'Kullanıcı bilgisi okunamadı.' }, { status: 401 })

    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const isTA = me.rol === 'tenant_admin'
    if (!isSA && !isTA) return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const report = searchParams.get('report') as ReportKey | null
    const columnsParam = searchParams.get('columns')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const requestedFirmaId = searchParams.get('firmaId')
    const limit = Math.max(1, Math.min(200, Number(searchParams.get('limit') || 50)))

    const def = getReportDefinition(report)
    if (!def) return NextResponse.json({ error: 'Geçersiz rapor tipi.' }, { status: 400 })

    const selectedColumns = (columnsParam ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => def.columns.some((c) => c.key === x))

    if (!selectedColumns.length) return NextResponse.json({ error: 'En az bir sütun seçmelisiniz.' }, { status: 400 })

    const firmaId = isSA ? requestedFirmaId : me.firma_id
    const data = await buildReportData(def.key, selectedColumns, { firmaId, dateFrom, dateTo })
    return NextResponse.json({
      title: data.title,
      columns: data.columns.map((column) => ({ key: column.key, label: column.label })),
      rows: data.rows.slice(0, limit),
      rowCount: data.rows.length,
      truncated: data.rows.length > limit,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Önizleme alınamadı.' }, { status: 500 })
  }
}
