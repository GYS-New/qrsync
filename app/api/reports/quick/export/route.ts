import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildXlsxBuffer } from '@/lib/import-export/xlsx'
import { buildQuickChartExportSheet, type ExportChartType } from '@/lib/reports/quick-export'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^-|-$)/g, '') || 'grafik'
}

export async function POST(req: NextRequest) {
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
    if (!['super_admin', 'alt_super_admin', 'tenant_admin', 'musteri', 'tenant_user'].includes(me.rol)) {
      return NextResponse.json({ error: 'Bu rapora erişim yetkiniz yok.' }, { status: 403 })
    }

    const body = await req.json()
    const chartTitle = String(body?.chartTitle || 'Grafik')
    const reportTitle = String(body?.reportTitle || 'Hızlı Rapor')
    const subtitle = String(body?.subtitle || '')
    const rows = Array.isArray(body?.rows) ? body.rows : []
    const metaInput = Array.isArray(body?.meta) ? body.meta : []
    const chartType = String(body?.chartType || 'bar') as ExportChartType
    const xKey = body?.xKey ? String(body.xKey) : undefined
    const dataKey = body?.dataKey ? String(body.dataKey) : undefined
    const nameKey = body?.nameKey ? String(body.nameKey) : undefined

    const file = await buildXlsxBuffer({
      sheets: [
        buildQuickChartExportSheet({
          chartTitle,
          reportTitle,
          subtitle,
          rows,
          meta: metaInput.map((item: any) => ({ label: String(item?.label || ''), value: String(item?.value || '') })),
          chartType,
          xKey,
          dataKey,
          nameKey,
        }),
      ],
    })

    const filename = `${slugify(chartTitle)}-${slugify(reportTitle)}.xlsx`
    return new NextResponse(file, {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Excel çıktısı hazırlanamadı.' }, { status: 500 })
  }
}
