import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildXlsxBuffer } from '@/lib/import-export/xlsx'
import { getReportDefinition, type ReportKey } from '@/lib/reports/config'
import { buildReportData } from '@/lib/reports/data'
import { buildSimplePdf } from '@/lib/reports/pdf'
import { getYetkiliLokasyonIds, getLokasyonYetki } from '@/lib/yetki/getLokasyonYetki'
import { createAdminClient } from '@/lib/supabase/server'

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
    const ustLokasyonId = searchParams.get('ustLokasyonId') || null

    const def = getReportDefinition(report)
    if (!def) return NextResponse.json({ error: 'Geçersiz rapor tipi.' }, { status: 400 })
    if (format !== 'excel' && format !== 'pdf') return NextResponse.json({ error: 'Geçersiz çıktı formatı.' }, { status: 400 })

    const selectedColumns = (columnsParam ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => def.columns.some((c) => c.key === x))

    const firmaId = isSA ? requestedFirmaId : me.firma_id

    const isUM = me.rol === 'tenant_user' || me.rol === 'musteri'
    const yetkiliLokIds = isUM && firmaId ? await getYetkiliLokasyonIds(supabase, firmaId, projeId) : null
    // Ust lokasyon yetki listesi (U/M icin, ust_lokasyon_id bazli filtreler icin)
    const yetkiliUstLokIds = isUM ? await getLokasyonYetki(supabase) : null

    // Manuel secilen ust lokasyonun TUM alt ID'lerini BFS ile hesapla
    // (raporlarda lokasyon_id filtresi icin — locations, live_tasks, manual_tasks)
    let ustLokasyonAltIds: string[] | null = null
    if (ustLokasyonId && firmaId) {
      const admin = createAdminClient()
      let q = admin.from('lokasyonlar').select('id, parent_id').eq('firma_id', firmaId)
      if (projeId) q = (q as any).eq('proje_id', projeId)
      const { data: loks } = await q
      if (loks) {
        const set = new Set<string>([ustLokasyonId])
        const queue = [ustLokasyonId]
        while (queue.length > 0) {
          const cur = queue.shift()!
          for (const l of loks) {
            if (l.parent_id === cur && !set.has(l.id)) {
              set.add(l.id); queue.push(l.id)
            }
          }
        }
        ustLokasyonAltIds = [...set]
      }
    }

    const data = await buildReportData(def.key, selectedColumns.length ? selectedColumns : def.columns.map((c) => c.key), {
      firmaId,
      projeId,
      dateFrom,
      dateTo,
      yetkiliLokIds,
      yetkiliUstLokIds,
      ustLokasyonId,
      ustLokasyonAltIds,
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
