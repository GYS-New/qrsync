'use client'

import { useEffect, useMemo, useState } from 'react'

import { formatDateTime, CANLI_DURUM_LABEL } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Trash2, RotateCcw, Download, FileSpreadsheet, Printer } from 'lucide-react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'

const DURUM_RENK: Record<string, string> = {
  TAMAMLANDI: 'status-tamamlandi',
  ZAMANINDA_YAPILAMAYAN: 'status-zamaninda',
  ZAMANI_GECMIS: 'status-zamaninda',
  IPTAL: 'status-iptal',
  SILINDI: 'status-silindi',
  KAPATILDI: 'status-kapatildi',
  ACIK: 'status-islemde',
  BEKLEMEDE: 'status-beklemede',
  HAZIR: 'status-hazir',
}

const ARSIV_NEDEN_LABEL: Record<string, string> = {
  gun_sonu: 'Gün Sonu',
  manuel: 'Manuel',
  lokasyon_silindi: 'Lokasyon Silindi',
}

export default function ArsivClient({
  base,
  initialArsiv,
  tenantFirmaId,
}: {
  base: string
  initialArsiv: any[]
  tenantFirmaId?: string | null
}) {
  const supabase = createClient()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { firmaId: saFirmaId } = useFirma()
  const { aktifProje, loading: projeLoading } = useProje()
  const firmaId = base.startsWith('/ta') ? (tenantFirmaId ?? null) : saFirmaId

  const [arsiv, setArsiv] = useState<any[]>(initialArsiv)
  const [loading, setLoading] = useState(false)

  // Filtreler
  const [q, setQ] = useState('')
  const [durum, setDurum] = useState('')
  const [neden, setNeden] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const effectiveProjeId = aktifProje?.id ?? ''

  async function loadArsiv(fId: string, pId: string) {
    setLoading(true)
    try {
      const sel = `*, lokasyonlar(id,tanim), atanan:users!atanan_kullanici_id(isim_soyisim), olusturan:users!olusturan_id(isim_soyisim), tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim), iptalEden:users!iptal_eden_id(isim_soyisim), islemi_yapan:users!islemi_yapan_id(isim_soyisim), kural:gorev_kurallari!arsiv_kural_fkey(tanim)`
      let q = supabase
        .from('canli_gorevler_arsiv')
        .select(sel)
        .eq('firma_id', fId)
        .order('arsiv_tarihi', { ascending: false })
        .limit(1000)
      if (pId) q = (q as any).eq('proje_id', pId)
      const { data, error } = await q
      if (error) throw error
      setArsiv((data as any) ?? [])
    } catch (e: any) {
      toast({ type: 'error', title: 'Yüklenemedi', message: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!firmaId) {
      setArsiv([])
      return
    }
    // TA/U: proje seçimi zorunlu → proje yüklenmeden / seçilmeden tüm projeleri çekme.
    if ((base.startsWith('/ta') || base.startsWith('/u')) && (projeLoading || !effectiveProjeId)) {
      setArsiv([])
      return
    }
    void loadArsiv(firmaId, effectiveProjeId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId, effectiveProjeId, projeLoading, base])

  // Geri yükle: arşivden canli_gorevler'e taşı
  async function restore(row: any) {
    const ok = await confirm({
      title: 'Geri Yükle',
      message: `"${row.tanim}" görevi arşivden geri yüklensin mi? Durum HAZIR olarak ayarlanacak.`,
      confirmText: 'Geri Yükle',
    })
    if (!ok) return
    try {
      const { arsiv_tarihi, arsiv_nedeni, ...rest } = row
      const { error: insErr } = await supabase
        .from('canli_gorevler')
        .insert({ ...rest, durum: 'HAZIR', durum_degisim_tarihi: new Date().toISOString() })
      if (insErr) throw insErr
      const { error: delErr } = await supabase
        .from('canli_gorevler_arsiv')
        .delete()
        .eq('id', row.id)
      if (delErr) throw delErr
      setArsiv((prev: any[]) => prev.filter((r: any) => r.id !== row.id))
      toast({ type: 'success', title: 'Geri yüklendi', message: 'Görev tekrar aktif listeye alındı.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
  }

  // Kalıcı sil
  async function permanentDelete(row: any) {
    const ok = await confirm({
      title: 'Kalıcı Sil',
      message: `"${row.tanim}" arşiv kaydı kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`,
      confirmText: 'Kalıcı Sil',
      variant: 'danger',
    })
    if (!ok) return
    try {
      const { error } = await supabase
        .from('canli_gorevler_arsiv')
        .delete()
        .eq('id', row.id)
      if (error) throw error
      setArsiv((prev: any[]) => prev.filter((r: any) => r.id !== row.id))
      toast({ type: 'success', title: 'Silindi', message: 'Arşiv kaydı kalıcı olarak silindi.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
  }

  // Filtrelenmiş liste
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const fromD = from ? new Date(from + 'T00:00:00') : null
    const toD = to ? new Date(to + 'T23:59:59') : null

    return arsiv.filter((r: any) => {
      if (s) {
        const hay = [r.tanim ?? '', r.lokasyonlar?.tanim ?? '', r.atanan?.isim_soyisim ?? '', r.kural?.tanim ?? '']
          .join(' ').toLowerCase()
        if (!hay.includes(s)) return false
      }
      if (durum && r.durum !== durum) return false
      if (neden && r.arsiv_nedeni !== neden) return false
      if (fromD || toD) {
        const d = r.arsiv_tarihi ? new Date(r.arsiv_tarihi) : null
        if (!d) return false
        if (fromD && d < fromD) return false
        if (toD && d > toD) return false
      }
      return true
    })
  }, [arsiv, q, durum, neden, from, to])

  function clearFilters() {
    setQ('')
    setDurum('')
    setNeden('')
    setFrom('')
    setTo('')
  }

  // CSV dışa aktar
  function exportCsv() {
    const headers = ['Görev', 'Lokasyon', 'Atanan', 'Durum', 'Aktif Saat', 'Arşiv Tarihi', 'Arşiv Nedeni', 'Kural']
    const rows = filtered.map((r: any) => [
      r.tanim ?? '',
      r.lokasyonlar?.tanim ?? '',
      r.atanan?.isim_soyisim ?? '',
      CANLI_DURUM_LABEL[r.durum] ?? r.durum,
      r.aktif_olma_tarihi ? formatDateTime(r.aktif_olma_tarihi) : '',
      r.arsiv_tarihi ? formatDateTime(r.arsiv_tarihi) : '',
      ARSIV_NEDEN_LABEL[r.arsiv_nedeni] ?? r.arsiv_nedeni ?? '',
      r.kural?.tanim ?? '',
    ])
    const csv = [headers, ...rows].map((r: any[]) => r.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `arsiv-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Excel dışa aktar
  async function exportExcel() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    wb.creator = 'QR-Sync'
    wb.created = new Date()
    const ws = wb.addWorksheet('Arşiv')

    ws.columns = [
      { header: 'Görev', key: 'tanim', width: 32 },
      { header: 'Lokasyon', key: 'lokasyon', width: 24 },
      { header: 'Atanan', key: 'atanan', width: 20 },
      { header: 'Durum', key: 'durum', width: 18 },
      { header: 'Aktif Saat', key: 'aktif', width: 20 },
      { header: 'Arşiv Tarihi', key: 'arsiv_tarihi', width: 20 },
      { header: 'Arşiv Nedeni', key: 'arsiv_nedeni', width: 18 },
      { header: 'Kural', key: 'kural', width: 24 },
    ]

    // Başlık satırı stili
    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FF1F6B1F' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCF0DC' } }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
    headerRow.height = 20

    filtered.forEach((r: any) => {
      ws.addRow({
        tanim: r.tanim ?? '',
        lokasyon: r.lokasyonlar?.tanim ?? '',
        atanan: r.atanan?.isim_soyisim ?? '',
        durum: CANLI_DURUM_LABEL[r.durum] ?? r.durum,
        aktif: r.aktif_olma_tarihi ? formatDateTime(r.aktif_olma_tarihi) : '',
        arsiv_tarihi: r.arsiv_tarihi ? formatDateTime(r.arsiv_tarihi) : '',
        arsiv_nedeni: ARSIV_NEDEN_LABEL[r.arsiv_nedeni] ?? r.arsiv_nedeni ?? '',
        kural: r.kural?.tanim ?? '',
      })
    })

    // Zebra + border
    ws.eachRow((row, idx) => {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD6E4D6' } },
          left: { style: 'thin', color: { argb: 'FFD6E4D6' } },
          bottom: { style: 'thin', color: { argb: 'FFD6E4D6' } },
          right: { style: 'thin', color: { argb: 'FFD6E4D6' } },
        }
        if (idx > 1 && idx % 2 === 0) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3FAF3' } }
        }
      })
    })

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `arsiv-${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Yazdır
  function printArsiv() {
    const dateStr = new Date().toLocaleDateString('tr-TR')
    const rows = filtered
      .map(
        (r: any) => `
        <tr>
          <td>${r.tanim ?? ''}</td>
          <td>${r.lokasyonlar?.tanim ?? '—'}</td>
          <td>${r.atanan?.isim_soyisim ?? '—'}</td>
          <td>${CANLI_DURUM_LABEL[r.durum] ?? r.durum}</td>
          <td>${r.aktif_olma_tarihi ? formatDateTime(r.aktif_olma_tarihi) : '—'}</td>
          <td>${r.arsiv_tarihi ? formatDateTime(r.arsiv_tarihi) : '—'}</td>
          <td>${ARSIV_NEDEN_LABEL[r.arsiv_nedeni] ?? r.arsiv_nedeni ?? '—'}</td>
          <td>${r.kural?.tanim ?? '—'}</td>
        </tr>`,
      )
      .join('')

    const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>Arşiv Raporu — ${dateStr}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111; padding: 20px; }
    h1 { font-size: 16px; font-weight: 800; margin-bottom: 4px; color: #1f6b1f; }
    .meta { font-size: 11px; color: #555; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #dcf0dc; color: #1f6b1f; font-weight: 700; padding: 6px 8px; border: 1px solid #b8e0b8; text-align: left; }
    td { padding: 5px 8px; border: 1px solid #d6e4d6; vertical-align: top; }
    tr:nth-child(even) td { background: #f3faf3; }
    @media print { body { padding: 10px; } }
  </style>
</head>
<body>
  <h1>🗃️ ARŞİV YÖNETİMİ</h1>
  <div class="meta">Yazdırma tarihi: ${dateStr} &nbsp;|&nbsp; Toplam ${filtered.length} kayıt</div>
  <table>
    <thead>
      <tr>
        <th>Görev</th><th>Lokasyon</th><th>Atanan</th><th>Durum</th>
        <th>Aktif Saat</th><th>Arşiv Tarihi</th><th>Arşiv Nedeni</th><th>Kural</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`

    const w = window.open('', '_blank', 'width=1100,height=800')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => {
      w.print()
    }, 400)
  }

  return (
    <div className="verde-card" style={{ padding: 16 }}>
      {/* Başlık + dışa aktar */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#0f1a0f' }}>ARŞİV YÖNETİMİ</div>
          <div style={{ fontSize: 13, color: '#7a907a', marginTop: 2 }}>
            Arşivlenmiş frekansiyel görevleri görüntüle, geri yükle veya kalıcı sil
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={exportCsv}
            disabled={!filtered.length}
            className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40"
          >
            <Download size={14} /> CSV ({filtered.length})
          </button>
          <button
            onClick={exportExcel}
            disabled={!filtered.length}
            className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40"
            style={{ color: '#1d6f42' }}
          >
            <FileSpreadsheet size={14} /> Excel ({filtered.length})
          </button>
          <button
            onClick={printArsiv}
            disabled={!filtered.length}
            className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40"
            style={{ color: '#185a9b' }}
          >
            <Printer size={14} /> Yazdır
          </button>
        </div>
      </div>

      {/* Firma seçilmediyse uyarı */}
      {!firmaId && (
        <div style={{ color: '#7a907a', fontSize: 14, padding: '24px 0', textAlign: 'center' }}>
          Arşivi görüntülemek için önce firma seçin.
        </div>
      )}

      {/* Filtreler — sadece firma seçiliyse göster */}
      {firmaId && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'nowrap', marginBottom: 12, overflowX: 'auto' }}>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Ara (görev, lokasyon, kişi...)"
              className="verde-input"
              style={{ minWidth: 200, flex: '1 1 200px' }}
            />

            <select className="verde-select" value={durum} onChange={e => setDurum(e.target.value)} style={{ minWidth: 160, flex: '0 0 160px' }}>
              <option value="">Durum (Tümü)</option>
              {Object.entries(CANLI_DURUM_LABEL).map(([k, v]: [string, string]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>

            <select className="verde-select" value={neden} onChange={e => setNeden(e.target.value)} style={{ minWidth: 160, flex: '0 0 160px' }}>
              <option value="">Arşiv Nedeni (Tümü)</option>
              {Object.entries(ARSIV_NEDEN_LABEL).map(([k, v]: [string, string]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>

            <input
              type="date"
              className="verde-input"
              value={from}
              onChange={e => setFrom(e.target.value)}
              title="Arşiv Tarihi Başlangıç"
              style={{ minWidth: 140, flex: '0 0 140px' }}
            />
            <span style={{ fontSize: 13, color: '#506050', flexShrink: 0 }}>—</span>
            <input
              type="date"
              className="verde-input"
              value={to}
              onChange={e => setTo(e.target.value)}
              title="Arşiv Tarihi Bitiş"
              style={{ minWidth: 140, flex: '0 0 140px' }}
            />

            <button
              onClick={clearFilters}
              className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[14px] hover:bg-[#f3faf3] whitespace-nowrap flex-shrink-0"
            >
              Temizle
            </button>
          </div>

          {/* Özet sayaç */}
          <div style={{ fontSize: 13, color: '#7a907a', marginBottom: 10 }}>
            Toplam <strong style={{ color: '#2e8b2e' }}>{filtered.length}</strong> arşiv kaydı
            {arsiv.length !== filtered.length && ` (${arsiv.length} kayıttan filtrelendi)`}
          </div>

          {/* Tablo */}
          <div className="verde-table-wrap">
            <table className="verde-table">
              <thead>
                <tr>
                  <th>Görev</th>
                  <th>Lokasyon</th>
                  <th>Atanan</th>
                  <th>Durum</th>
                  <th>Aktif Saat</th>
                  <th>Arşiv Tarihi</th>
                  <th>Arşiv Nedeni</th>
                  <th>Kural</th>
                  <th style={{ textAlign: 'center' }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.tanim}</td>
                    <td style={{ color: '#506050' }}>{r.lokasyonlar?.tanim ?? '—'}</td>
                    <td style={{ color: '#506050' }}>{r.atanan?.isim_soyisim ?? '—'}</td>
                    <td>
                      <span className={`verde-badge ${DURUM_RENK[r.durum] ?? 'status-acik'}`}>
                        {CANLI_DURUM_LABEL[r.durum] ?? r.durum}
                      </span>
                    </td>
                    <td style={{ color: '#7a907a', whiteSpace: 'nowrap', fontSize: 13 }}>
                      {r.aktif_olma_tarihi ? formatDateTime(r.aktif_olma_tarihi) : '—'}
                    </td>
                    <td style={{ color: '#7a907a', whiteSpace: 'nowrap', fontSize: 13 }}>
                      {r.arsiv_tarihi ? formatDateTime(r.arsiv_tarihi) : '—'}
                    </td>
                    <td style={{ fontSize: 13 }}>
                      <span style={{
                        background: r.arsiv_nedeni === 'gun_sonu' ? '#e8f4e8' : r.arsiv_nedeni === 'lokasyon_silindi' ? '#fde8e8' : '#f0f4ff',
                        color: r.arsiv_nedeni === 'gun_sonu' ? '#2e7a2e' : r.arsiv_nedeni === 'lokasyon_silindi' ? '#c0392b' : '#2c5aa0',
                        borderRadius: 6,
                        padding: '2px 8px',
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
                        {ARSIV_NEDEN_LABEL[r.arsiv_nedeni] ?? r.arsiv_nedeni ?? '—'}
                      </span>
                    </td>
                    <td style={{ color: '#7a907a', fontSize: 13 }}>{r.kural?.tanim ?? '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button
                          onClick={() => restore(r)}
                          title="Geri Yükle (HAZIR olarak)"
                          style={{
                            background: '#e8f4e8', border: 'none', borderRadius: 7,
                            padding: '5px 8px', cursor: 'pointer', color: '#2e8b2e',
                            display: 'flex', alignItems: 'center',
                          }}
                        >
                          <RotateCcw size={14} />
                        </button>
                        <button
                          onClick={() => permanentDelete(r)}
                          title="Kalıcı Sil"
                          style={{
                            background: '#fde8e8', border: 'none', borderRadius: 7,
                            padding: '5px 8px', cursor: 'pointer', color: '#c0392b',
                            display: 'flex', alignItems: 'center',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filtered.length && !loading && firmaId && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', color: '#7a907a', padding: '28px 0', fontSize: 14 }}>
                      {arsiv.length === 0 ? 'Bu firma/proje için arşiv kaydı bulunamadı.' : 'Kriterlere uygun arşiv kaydı bulunamadı.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
