'use client'

import { useMemo, useState } from 'react'
import { useRouteLoading } from '@/components/ui/RouteLoadingProvider'
import Topbar from '@/components/layout/Topbar'
import Button from '@/components/ui/Button'
import { REPORT_DEFINITIONS } from '@/lib/reports/config'
import { Download, FileText, FileSpreadsheet, Sparkles } from 'lucide-react'
import { useToast } from '@/components/ui/ToastProvider'
import { useFirma } from '@/components/layout/FirmaContext'

function ReportCard({
  report,
  firmaId,
  isSA,
  projeId,
}: {
  report: (typeof REPORT_DEFINITIONS)[number]
  firmaId: string | null
  isSA: boolean
  projeId?: string | null
}) {
  const { toast } = useToast()
  const [columns, setColumns] = useState<string[]>(report.columns.map((c) => c.key))
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loadingFormat, setLoadingFormat] = useState<'excel' | 'pdf' | null>(null)

  const allSelected = columns.length === report.columns.length
  const selectedCountLabel = `${columns.length}/${report.columns.length} alan seçildi`

  async function exportReport(format: 'excel' | 'pdf') {
    if (!columns.length) {
      toast({ type: 'error', title: 'Eksik seçim', message: 'En az bir sütun seçmelisiniz.' })
      return
    }

    setLoadingFormat(format)
    try {
      const params = new URLSearchParams()
      params.set('report', report.key)
      params.set('format', format)
      params.set('columns', columns.join(','))
      if (firmaId) params.set('firmaId', firmaId)
      if (projeId) params.set('projeId', projeId)
      if (report.supportsDateRange && dateFrom) params.set('dateFrom', dateFrom)
      if (report.supportsDateRange && dateTo) params.set('dateTo', dateTo)

      const res = await fetch(`/api/reports/export?${params.toString()}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Rapor indirilemedi')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${report.key}.${format === 'excel' ? 'xlsx' : 'pdf'}`
      a.click()
      URL.revokeObjectURL(url)
      toast({ type: 'success', title: 'Rapor hazır', message: `${report.title} ${format.toUpperCase()} çıktısı indirildi.` })
    } catch (error: any) {
      toast({ type: 'error', title: 'İşlem başarısız', message: error?.message ?? 'Rapor oluşturulamadı.' })
    }
    setLoadingFormat(null)
  }

  return (
    <div className="verde-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c45200' }}>
              <FileText size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#3d1c00' }}>{report.title}</h3>
              <p style={{ fontSize: 13.5, color: '#6b4423', marginTop: 4 }}>{report.description}</p>
            </div>
          </div>
        </div>
        <div style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #ffd9a0', background: '#f8fbf8', fontSize: 12.5, fontWeight: 700, color: '#6b4423' }}>
          {selectedCountLabel}
        </div>
      </div>

      {report.supportsDateRange ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
          <div>
            <label className="verde-label">Başlangıç Tarihi</label>
            <input type="date" className="verde-input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label className="verde-label">Bitiş Tarihi</label>
            <input type="date" className="verde-input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      ) : null}

      <div style={{ border: '1px solid #ffe8c8', borderRadius: 10, padding: 14, background: '#fbfdfb' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#5c3a1e', marginBottom: 4 }}>Rapor Parametreleri</div>
            <div style={{ fontSize: 12.5, color: '#9a7b6a' }}>İstenen rapor kolonlarını seçin. Tüm kolonlar seçiliyse tam veri çıktısı alınır.</div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setColumns(allSelected ? [] : report.columns.map((c) => c.key))}
          >
            {allSelected ? 'Tümünü Kaldır' : 'Tümünü Seç'}
          </Button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {report.columns.map((column) => {
            const checked = columns.includes(column.key)
            return (
              <label
                key={column.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  border: checked ? '1px solid #ff7f00' : '1px solid #ffd9a0',
                  borderRadius: 10,
                  padding: '10px 12px',
                  background: checked ? '#fff7ed' : '#fff',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    if (e.target.checked) setColumns((prev) => [...prev, column.key])
                    else setColumns((prev) => prev.filter((item) => item !== column.key))
                  }}
                />
                <span style={{ fontSize: 13.5, color: '#5c3a1e', fontWeight: 600 }}>{column.label}</span>
              </label>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: '#9a7b6a' }}>
          {isSA ? 'Süper Admin seçilen firma kapsamında rapor alır.' : 'Tenant Admin yalnızca kendi firmasının verisini raporlar.'}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button type="button" variant="ghost" onClick={() => exportReport('pdf')} disabled={!!loadingFormat}>
            <FileText size={16} style={{ marginRight: 8, display: 'inline-block' }} />
            {loadingFormat === 'pdf' ? 'PDF hazırlanıyor...' : 'PDF Rapor Ver'}
          </Button>
          <Button type="button" onClick={() => exportReport('excel')} disabled={!!loadingFormat}>
            <FileSpreadsheet size={16} style={{ marginRight: 8, display: 'inline-block' }} />
            {loadingFormat === 'excel' ? 'Excel hazırlanıyor...' : 'Excel Rapor Ver'}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function ReportsClient({
  base,
  title,
  isSA,
  firmaAdi,
  projeId,
  initialFirmaId,
}: {
  base: '/sa' | '/ta' | '/u'
  title: string
  isSA: boolean
  firmaAdi?: string | null
  projeId?: string | null
  initialFirmaId?: string | null
}) {
  const { start } = useRouteLoading()
  const { firmaId: saFirmaId, firmalar: saFirmalar } = useFirma()
  const firmaId = isSA ? saFirmaId : (initialFirmaId ?? null)

  const firmaLabel = useMemo(() => {
    if (!isSA) return firmaAdi ?? 'Firma'
    const current = saFirmalar?.find((item) => item.id === firmaId)
    return current ? current.firma_adi || current.ticari_unvan : 'Firma seçin'
  }, [firmaId, isSA, firmaAdi, saFirmalar])

  return (
    <div>
      <Topbar
        title={title}
        base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: `${base}/dashboard/raporlar` }, { label: 'Ham Veri Raporları' }]}
      />

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div className="verde-card" style={{ padding: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#3d1c00', marginBottom: 6 }}>Ham Veri Raporları</h2>
            <p style={{ fontSize: 13.5, color: '#6b4423' }}>
              Her rapor için önce parametreleri belirleyin, ardından PDF veya Excel çıktısı alın. Tüm başlıkları seçerek tam veri raporu üretebilirsiniz.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid #ffd9a0', background: '#f8fbf8' }}>
              <Download size={16} color="#ff7f00" />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#5c3a1e' }}>{firmaLabel}</span>
            </div>
            <Button
              type="button"
              onClick={() => {
                start()
                window.location.assign(`${base}/dashboard/raporlar/grafiksel`)
              }}
            >
              <Sparkles size={16} style={{ marginRight: 8, display: 'inline-block' }} />
              Grafiksel Raporlara Git
            </Button>
          </div>
        </div>


        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 18 }}>
          {REPORT_DEFINITIONS.map((report) => (
            <ReportCard key={report.key} report={report} firmaId={firmaId} isSA={isSA} projeId={projeId} />
          ))}
        </div>
      </div>
    </div>
  )
}
