import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildXlsxBuffer } from '@/lib/import-export/xlsx'
import { getReportDefinition, type ReportKey } from '@/lib/reports/config'
import { buildReportData } from '@/lib/reports/data'
import { buildSimplePdf } from '@/lib/reports/pdf'

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export async function GET(request: Request) {
  try {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 })

    const { data: me, error: meErr } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
    if (meErr || !me) return NextResponse.json({ error: 'Kullanıcı bilgisi okunamadı.' }, { status: 401 })

    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const isTA = me.rol === 'tenant_admin'
    const isTenantViewer = me.rol === 'musteri' || me.rol === 'tenant_user'
    if (!isSA && !isTA && !isTenantViewer) return NextResponse.json({ error: 'Bu işlem için yetkiniz yok.' }, { status: 403 })

    const { searchParams } = new URL(request.url)
    const report = searchParams.get('report') as ReportKey | null
    const format = searchParams.get('format')
    const columnsParam = searchParams.get('columns')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')
    const requestedFirmaId = searchParams.get('firmaId')
    const projeId = searchParams.get('projeId') || null

    const def = getReportDefinition(report)
    if (!def) return NextResponse.json({ error: 'Geçersiz rapor tipi.' }, { status: 400 })
    if (format !== 'excel' && format !== 'pdf') return NextResponse.json({ error: 'Geçersiz çıktı formatı.' }, { status: 400 })

    const selectedColumns = (columnsParam ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => def.columns.some((c) => c.key === x))

    const firmaId = isSA ? requestedFirmaId : me.firma_id
    const data = await buildReportData(def.key, selectedColumns.length ? selectedColumns : def.columns.map((c) => c.key), {
      firmaId,
      projeId,
      dateFrom,
      dateTo,
    })

    const filenameBase = slugify(def.title)
    if (format === 'excel') {
      const file = await buildXlsxBuffer({
        sheets: [{
          name: def.title.slice(0, 31),
          headers: data.columns.map((c) => ({ key: c.key, label: c.label, width: c.width })),
          rows: data.rows,
        }],
      })
      return new NextResponse(file, {
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': `attachment; filename="${filenameBase}.xlsx"`,
        },
      })
    }

    const pdf = buildSimplePdf({
      title: data.title,
      subtitle: `Uretilme: ${data.generatedAt} | Kayit Sayisi: ${data.rows.length}`,
      headers: data.columns.map((c) => c.label),
      rows: data.rows.map((row) => data.columns.map((c) => row[c.key] ?? '')),
    })

    return new NextResponse(pdf as unknown as BodyInit, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filenameBase}.pdf"`,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Rapor oluşturulamadı.' }, { status: 500 })
  }
}
