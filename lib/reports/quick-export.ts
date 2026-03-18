export type ExportChartType = 'bar' | 'line' | 'pie' | 'grouped_bar'

function labelForKey(key: string) {
  const labels: Record<string, string> = {
    lokasyon: 'Lokasyon',
    altLokasyon: 'Alt Lokasyon',
    altLokasyonSayisi: 'Alt Lokasyon Sayısı',
    gorev: 'Görev',
    oran: 'Oran (%)',
    basari: 'Başarı (%)',
    tamamlanan: 'Tamamlanan',
    diger: 'Diğer',
    personel: 'Personel',
    aktivite: 'Aktivite',
    basarisizlik: 'Başarısızlık',
    tarih: 'Tarih',
    toplam: 'Toplam',
    durum: 'Durum',
  }
  return labels[key] ?? key
}

function sheetName(value: string) {
  return value.replace(/[\\/?*\[\]:]/g, ' ').slice(0, 31) || 'Grafik Veri'
}

function columnWidth(label: string) {
  return Math.min(Math.max(label.length + 6, 18), 32)
}

export function buildQuickChartExportSheet({
  chartTitle,
  reportTitle,
  subtitle,
  rows,
  meta,
  chartType,
  xKey,
  dataKey,
  nameKey,
}: {
  chartTitle: string
  reportTitle: string
  subtitle?: string
  rows: Record<string, unknown>[]
  meta?: { label: string; value: string }[]
  chartType: ExportChartType
  xKey?: string
  dataKey?: string
  nameKey?: string
}) {
  const normalizedRows = chartType === 'pie'
    ? rows.filter((row) => {
        const raw = dataKey ? row?.[dataKey] : Object.values(row || {}).find((value) => typeof value === 'number')
        return typeof raw === 'number' ? raw > 0 : Number(raw) > 0
      })
    : rows

  const keys = Array.from(normalizedRows.reduce((set: Set<string>, row: Record<string, unknown>) => {
    Object.keys(row || {}).forEach((key) => set.add(key))
    return set
  }, new Set<string>()))

  const headers = keys.map((key) => ({
    key,
    label: labelForKey(key),
    width: columnWidth(labelForKey(key)),
  }))

  const numericKeys = keys.filter((key) => normalizedRows.some((row) => typeof row?.[key] === 'number'))
  const dimensionKey = chartType === 'pie' ? (nameKey || xKey || keys.find((key) => !numericKeys.includes(key)) || keys[0] || '') : (xKey || nameKey || keys.find((key) => !numericKeys.includes(key)) || keys[0] || '')

  let seriesKeys: string[] = []
  if (chartType === 'grouped_bar') {
    seriesKeys = ['tamamlanan', 'diger'].filter((key) => keys.includes(key))
    if (!seriesKeys.length) seriesKeys = numericKeys.slice(0, 2)
  } else if (dataKey && keys.includes(dataKey)) {
    seriesKeys = [dataKey]
  } else if (numericKeys.length) {
    seriesKeys = [numericKeys[0]]
  }

  return {
    mode: 'chart_with_table',
    name: sheetName(chartTitle),
    title: chartTitle,
    subtitle: subtitle || '',
    meta: [
      { label: 'Rapor', value: reportTitle },
      ...((meta || []).filter((item) => item?.label && item?.value)),
      { label: 'Kayıt Sayısı', value: String(normalizedRows.length) },
    ],
    excelChart: {
      type: chartType,
      categoryKey: dimensionKey,
      seriesKeys,
      title: chartTitle,
      style: 10,
      widthCells: 9,
      heightRows: 16,
    },
    table: {
      headers,
      rows: normalizedRows,
    },
  }
}
