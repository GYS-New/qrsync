'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDateTime } from '@/lib/utils'
import { useToast } from '@/components/ui/ToastProvider'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'
import ChecklistModal from '@/components/checklist/ChecklistModal'
import {
  Download, FileSpreadsheet, Printer, RefreshCw,
  ClipboardCheck, ExternalLink,
} from 'lucide-react'

const DURUM_LABEL: Record<string, string> = {
  TAMAMLANDI: 'Tamamlandı',
  ZAMANINDA_YAPILAMAYAN: 'Gecikmeli Tamamlandı',
}

const DURUM_RENK: Record<string, { bg: string; color: string }> = {
  TAMAMLANDI:           { bg: '#dcfce7', color: '#166534' },
  ZAMANINDA_YAPILAMAYAN: { bg: '#fef9c3', color: '#854d0e' },
}

const KANAL_RENK: Record<string, { bg: string; color: string }> = {
  WEB:    { bg: '#e0f2fe', color: '#0369a1' },
  QR:     { bg: '#ede9fe', color: '#5b21b6' },
  NFC:    { bg: '#fce7f3', color: '#9d174d' },
  MOBİL:  { bg: '#f0fdf4', color: '#166534' },
}

function pct(dol: number, top: number) {
  if (!top) return 0
  return Math.round((dol / top) * 100)
}

function csvIndir(baslik: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${baslik}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

type Kayit = {
  id: string
  kayit_tarihi: string | null
  kanal: string
  gorev_id: string
  gorev_tanim: string
  gorev_durum: string
  tamamlanma_tarihi: string | null
  arsiv_tarihi: string | null
  durum_degisim_tarihi?: string | null
  lokasyon_tanim: string
  sablon_baslik: string
  kullanici_isim: string
  doldurulan_madde: number
  toplam_madde: number
  kaynak: 'canli' | 'arsiv' | 'spesifik'
  /** cikti=birlesik: son 24 saat penceresine göre */
  segment?: 'tablo' | 'arsiv'
  gorev_task_type?: 'canli_gorevler' | 'gorevler'
}

export default function CeklistRaporlariClient({
  base,
  tenantFirmaId,
  lockedProjeId,
}: {
  base: string
  tenantFirmaId?: string | null
  /** /u layout’ta ProjeContext yok; kullanıcının proje_id’si sunucudan gelir */
  lockedProjeId?: string | null
}) {
  const { toast }                    = useToast()
  const { firmaId: saFirmaId }       = useFirma()
  const { aktifProje, loading: projeLoading } = useProje()

  const isU  = base.startsWith('/u')
  const isTA = base.startsWith('/ta')
  const firmaId = (isTA || isU) ? (tenantFirmaId ?? null) : saFirmaId
  const projeId = isU ? (lockedProjeId ?? null) : (aktifProje?.id ?? null)

  // ── State ──────────────────────────────────────────────────────────────
  const [satirlar, setSatirlar]       = useState<Kayit[]>([])
  const [loading, setLoading]         = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  /** true: birleşik veri + segment (Tablo/Arşiv); false: yalnızca son 24 saat (rapor penceresi) */
  const [filtreMod, setFiltreMod]     = useState(false)

  // Filtre alanları
  const [aramaQ,      setAramaQ]      = useState('')
  const [durumF,      setDurumF]      = useState('')
  const [kanaliF,     setKanaliF]     = useState('')
  const [baslangic,   setBaslangic]   = useState('')
  const [bitis,       setBitis]       = useState('')

  const [modalGorev, setModalGorev]   = useState<{ id: string; taskType: 'gorevler' | 'canli_gorevler' } | null>(null)

  // ── Varsayılan: son 24 saat (durum değişimine göre, API cikti=rapor) ───
  const yukleRapor24h = useCallback(async () => {
    if (!firmaId) return
    if (isTA && (projeLoading || !projeId)) return
    if (isU && !projeId) return
    setLoading(true)
    try {
      const p = new URLSearchParams({ cikti: 'rapor' })
      p.set('firma_id', firmaId)
      if (projeId) p.set('proje_id', projeId)
      const res  = await fetch(`/api/raporlar/ceklist?${p}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setSatirlar(json.data ?? [])
    } catch (e: any) {
      toast({ type: 'error', title: 'Yüklenemedi', message: e.message })
    } finally {
      setLoading(false)
    }
  }, [firmaId, projeId, projeLoading, isTA, isU])

  useEffect(() => {
    setSatirlar([])
    setFiltreMod(false)
    yukleRapor24h()
  }, [firmaId, projeId, projeLoading, yukleRapor24h])

  // ── Filtrele: tablo + arşiv birleşik, segment ile ─────────────────────
  async function filtreUygula() {
    if (!firmaId) return
    setLoading(true)
    try {
      const p = new URLSearchParams({ cikti: 'birlesik' })
      p.set('firma_id', firmaId)
      if (projeId)   p.set('proje_id', projeId)
      if (baslangic) p.set('baslangic', baslangic)
      if (bitis)     p.set('bitis', bitis)
      const res  = await fetch(`/api/raporlar/ceklist?${p}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setSatirlar(json.data ?? [])
      setFiltreMod(true)
    } catch (e: any) {
      toast({ type: 'error', title: 'Yüklenemedi', message: e.message })
    } finally {
      setLoading(false)
    }
  }

  function filtreTemizle() {
    setAramaQ(''); setDurumF(''); setKanaliF(''); setBaslangic(''); setBitis('')
    setFiltreMod(false)
    yukleRapor24h()
  }

  const filtreData = useMemo(() => {
    const s = aramaQ.trim().toLowerCase()
    return satirlar.filter(r => {
      if (s && ![r.gorev_tanim, r.lokasyon_tanim, r.kullanici_isim, r.sablon_baslik]
        .join(' ').toLowerCase().includes(s)) return false
      if (durumF && r.gorev_durum !== durumF) return false
      if (kanaliF && r.kanal !== kanaliF) return false
      return true
    })
  }, [satirlar, aramaQ, durumF, kanaliF])

  function segmentEtiket(r: Kayit): string {
    if (filtreMod && r.segment) return r.segment === 'tablo' ? 'Tablo' : 'Arşiv'
    if (r.kaynak === 'spesifik') return 'Spesifik'
    return r.kaynak === 'arsiv' ? 'Arşiv (DB)' : 'Canlı'
  }

  // ── Excel ─────────────────────────────────────────────────────────────
  async function excelIndir() {
    setIsDownloading(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook(); wb.creator = 'QR-Sync'
      const ws = wb.addWorksheet('Çeklist Raporları')
      
      // Ana tablo kolonları
      const cols = [
        { header: 'Kayıt Tarihi',   key: 'kayit',      width: 20 },
        { header: 'Görev',          key: 'gorev',      width: 32 },
        { header: 'Lokasyon',       key: 'lokasyon',   width: 24 },
        { header: 'Şablon',         key: 'sablon',     width: 24 },
        { header: 'Durum',          key: 'durum',      width: 22 },
        { header: 'Kanal',          key: 'kanal',      width: 10 },
        { header: 'Dolduran',       key: 'kullanici',  width: 20 },
        { header: 'Doldurulma %',   key: 'oran',       width: 14 },
      ] as { header: string; key: string; width: number }[]
      if (filtreMod) cols.push({ header: 'Segment', key: 'segment', width: 12 })
      ws.columns = cols
      
      const hr = ws.getRow(1)
      hr.font = { bold: true, color: { argb: 'FF1F6B1F' } }
      hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCF0DC' } }
      hr.height = 20
      
      // Her kayıt için çeklist verilerini fetch et ve ekle
      for (const r of filtreData) {
        const base: Record<string, string> = {
          kayit:     r.kayit_tarihi ? formatDateTime(r.kayit_tarihi) : '',
          gorev:     r.gorev_tanim,
          lokasyon:  r.lokasyon_tanim,
          sablon:    r.sablon_baslik,
          durum:     DURUM_LABEL[r.gorev_durum] ?? r.gorev_durum,
          kanal:     r.kanal,
          kullanici: r.kullanici_isim,
          oran:      `%${pct(r.doldurulan_madde, r.toplam_madde)}`,
        }
        if (filtreMod) base.segment = segmentEtiket(r)
        ws.addRow(base)
        
        // Çeklist maddelerini fetch et
        try {
          const res = await fetch(`/api/checklist-results?task_id=${r.gorev_id}&task_type=${r.gorev_task_type ?? 'canli_gorevler'}`)
          const json = await res.json()
          if (json.ok && json.sonuclar?.length) {
            // Maddeler başlığı
            const maddeBaslık = ws.addRow({ kayit: '📋 ÇEKLİST MADDELERİ', gorev: '', lokasyon: '', sablon: '', durum: '', kanal: '', kullanici: '', oran: '' })
            maddeBaslık.font = { bold: true, color: { argb: 'FF475569' }, size: 11 }
            maddeBaslık.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
            
            // Her madde satırı
            for (const madde of json.sonuclar) {
              const durumEmoji = madde.dolduruldu ? '✅' : '⭕'
              const zorunluText = madde.zorunlu ? ' [ZORUNLU]' : ''
              const cevapText = madde.secenek ? ` → ${madde.secenek}` : ''
              const notText = madde.not ? `\nNot: ${madde.not}` : ''
              
              const maddeRow = ws.addRow({
                kayit: `${durumEmoji} ${madde.sira}. ${madde.madde}${zorunluText}${cevapText}${notText}`,
                gorev: '',
                lokasyon: madde.tarih ? formatDateTime(madde.tarih) : '',
                sablon: madde.yapan ? madde.yapan : '',
                durum: '',
                kanal: madde.kanal ? madde.kanal : '',
                kullanici: '',
                oran: '',
              })
              maddeRow.font = { size: 10, color: { argb: madde.dolduruldu ? 'FF166534' : 'FFC2410C' } }
              
              // Görsel hücresine hyperlink ekle
              if (madde.gorsel_url) {
                const gorselCell = maddeRow.getCell(8) // oran sütunu (8. kolon)
                gorselCell.value = { text: 'Görsel', hyperlink: madde.gorsel_url }
                gorselCell.font = { size: 10, color: { argb: 'FF0369a1' }, underline: 'single', bold: true }
              }
            }
            
            // Boş satır (ayrım)
            ws.addRow({})
          }
        } catch (e) {
          // Hata durumunda devam et
        }
      }
      
      const buf = await wb.xlsx.writeBuffer()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      a.download = `ceklist-raporlari-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click(); URL.revokeObjectURL(a.href)
    } catch (e: any) {
      toast({ type: 'error', title: 'İndirme Hatası', message: e.message })
    } finally {
      setIsDownloading(false)
    }
  }

  // ── Yazdır ────────────────────────────────────────────────────────────
  async function yazdir() {
    setIsDownloading(true)
    try {
      const segTh = filtreMod ? '<th>Segment</th>' : ''
      
      // Görev satırlarını HTML'e dönüştür
      let tableHtml = ''
      for (const r of filtreData) {
        tableHtml += `<tr>
          <td>${r.kayit_tarihi ? formatDateTime(r.kayit_tarihi) : '—'}</td>
          <td>${r.gorev_tanim}</td>
          <td>${r.lokasyon_tanim}</td>
          <td>${r.sablon_baslik}</td>
          <td>${DURUM_LABEL[r.gorev_durum] ?? r.gorev_durum}</td>
          <td>${r.kanal}</td>
          <td>${r.kullanici_isim}</td>
          <td>%${pct(r.doldurulan_madde, r.toplam_madde)} (${r.doldurulan_madde}/${r.toplam_madde})</td>
          ${filtreMod ? `<td>${segmentEtiket(r)}</td>` : ''}
        </tr>`
        
        // Çeklist maddelerini fetch et
        try {
          const res = await fetch(`/api/checklist-results?task_id=${r.gorev_id}&task_type=${r.gorev_task_type ?? 'canli_gorevler'}`)
          const json = await res.json()
          if (json.ok && json.sonuclar?.length) {
            // Maddeler başlığı satırı
            tableHtml += `<tr style="background:#f1f5f9">
              <td colspan="9" style="font-weight:700;color:#475569;padding:10px 8px">📋 ÇEKLİST MADDELERİ</td>
            </tr>`
            // Her madde satırı
            for (const madde of json.sonuclar) {
              const durumEmoji = madde.dolduruldu ? '✅' : '⭕'
              const zorunluText = madde.zorunlu ? ' <span style="color:#dc2626;font-weight:700">[ZORUNLU]</span>' : ''
              const gorselText = madde.gorsel_url ? ` <a href="${madde.gorsel_url}" target="_blank" style="color:#0369a1;text-decoration:underline;font-weight:700">[GÖRSEL]</a>` : ''
              const cevapText = madde.secenek ? ` → <strong>${madde.secenek}</strong>` : ''
              const notText = madde.not ? `<br/><small>Not: ${madde.not}</small>` : ''
              tableHtml += `<tr style="background:#f8fafb;font-size:11px">
                <td colspan="9" style="padding:8px 12px;color:${madde.dolduruldu ? '#166534' : '#c2410c'}">
                  ${durumEmoji} ${madde.sira}. ${madde.madde}${zorunluText}${gorselText}${cevapText}${notText}
                </td>
              </tr>`
            }
            // Boş satır (ayrım)
            tableHtml += '<tr style="height:8px;background:none"><td colspan="9"></td></tr>'
          }
        } catch (e) {
          // Hata durumunda devam et
        }
      }
      
      const w = window.open('', '_blank', 'width=1100,height=700')
      if (!w) return
      w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/>
        <title>Çeklist Raporları</title>
        <style>
          body{font-family:Arial,sans-serif;font-size:11px;padding:20px}
          table{width:100%;border-collapse:collapse}
          th{background:#dcf0dc;color:#1f6b1f;font-weight:700;padding:6px 8px;border:1px solid #b8e0b8;text-align:left}
          td{padding:5px 8px;border:1px solid #d6e4d6}
          tr:nth-child(even) td{background:#f3faf3}
          img{max-width:100px;max-height:100px;margin:4px 0}
        </style>
        </head><body>
        <h2 style="color:#1f6b1f">Çeklist Raporları</h2>
        <table><thead><tr>
          <th>Kayıt Tarihi</th><th>Görev</th><th>Lokasyon</th><th>Şablon</th>
          <th>Durum</th><th>Kanal</th><th>Dolduran</th><th>Doldurulma</th>${segTh}
        </tr></thead><tbody>${tableHtml}</tbody></table></body></html>`)
      w.document.close(); setTimeout(() => w.print(), 600)
    } catch (e: any) {
      toast({ type: 'error', title: 'Yazdırma Hatası', message: e.message })
    } finally {
      setIsDownloading(false)
    }
  }

  // ── Stil yardımcıları ─────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    height: 34, padding: '0 10px', borderRadius: 8,
    border: '1px solid #e2e8f0', fontSize: 13, background: '#fff',
  }
  const filterRow: React.CSSProperties = {
    display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12,
  }
  const applyBtn: React.CSSProperties = {
    ...inp, background: '#1f6b1f', color: '#fff', border: 'none',
    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
  }
  const spinning: React.CSSProperties = { animation: 'spin 0.9s linear infinite' }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24 }}>
      <div className="verde-card" style={{ padding: 16 }}>

        {/* Başlık */}
        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#0f1a0f', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ClipboardCheck size={18} color="#1f6b1f" /> ÇEKLİST RAPORLARI
            </div>
            <div style={{ fontSize: 13, color: '#7a907a', marginTop: 2 }}>
              Tamamlanan ve gecikmeli tamamlanan görevlere ait çeklist sonuçları
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={async () => {
              // CSV: Her görev + maddeleri
              setIsDownloading(true)
              try {
                const rows: string[][] = []
                const headers = ['Kayıt Tarihi', 'Görev', 'Lokasyon', 'Şablon', 'Durum', 'Kanal', 'Dolduran', 'Doldurulma %']
                if (filtreMod) headers.push('Segment')
                
                for (const r of filtreData) {
                  // Görev satırı
                  const row = [
                    r.kayit_tarihi ? formatDateTime(r.kayit_tarihi) : '',
                    r.gorev_tanim, r.lokasyon_tanim, r.sablon_baslik,
                    DURUM_LABEL[r.gorev_durum] ?? r.gorev_durum,
                    r.kanal, r.kullanici_isim,
                    `%${pct(r.doldurulan_madde, r.toplam_madde)}`,
                  ]
                  if (filtreMod) row.push(segmentEtiket(r))
                  rows.push(row)
                  
                  // Çeklist maddelerini fetch et
                  try {
                    const res = await fetch(`/api/checklist-results?task_id=${r.gorev_id}&task_type=${r.gorev_task_type ?? 'canli_gorevler'}`)
                    const json = await res.json()
                    if (json.ok && json.sonuclar?.length) {
                      // Maddeler başlığı satırı
                      rows.push(['📋 ÇEKLİST MADDELERİ', '', '', '', '', '', '', ''])
                      // Her madde satırı
                      for (const madde of json.sonuclar) {
                        const durumEmoji = madde.dolduruldu ? '✅' : '⭕'
                        const zorunluText = madde.zorunlu ? ' [ZORUNLU]' : ''
                        const cevapText = madde.secenek ? ` → ${madde.secenek}` : ''
                        const notText = madde.not ? ` | Not: ${madde.not}` : ''
                        rows.push([
                          `${durumEmoji} ${madde.sira}. ${madde.madde}${zorunluText}${cevapText}${notText}`,
                          '',
                          madde.tarih ? formatDateTime(madde.tarih) : '',
                          madde.yapan ?? '',
                          '',
                          madde.kanal ?? '',
                          '',
                          madde.gorsel_url ? `Görsel: ${madde.gorsel_url}` : '',
                        ])
                    }
                    // Boş satır (ayrım)
                    rows.push([])
                  }
                } catch (e) {
                  // Hata durumunda devam et
                }
              }
              
              csvIndir('ceklist-raporlari', headers, rows)
              } catch (e: any) {
                toast({ type: 'error', title: 'İndirme Hatası', message: e.message })
              } finally {
                setIsDownloading(false)
              }
            }}
              disabled={!filtreData.length || isDownloading}
              className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40">
              {isDownloading ? <RefreshCw size={13} style={spinning} /> : <Download size={13} />} {isDownloading ? 'Hazırlanıyor...' : 'CSV'}
            </button>
            <button onClick={excelIndir} disabled={!filtreData.length || isDownloading}
              className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40"
              style={{ color: '#1d6f42' }}>
              {isDownloading ? <RefreshCw size={13} style={spinning} /> : <FileSpreadsheet size={13} />} {isDownloading ? 'Hazırlanıyor...' : 'Excel'}
            </button>
            <button onClick={yazdir} disabled={!filtreData.length || isDownloading}
              className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40"
              style={{ color: '#185a9b' }}>
              {isDownloading ? <RefreshCw size={13} style={spinning} /> : <Printer size={13} />} {isDownloading ? 'Hazırlanıyor...' : 'Yazdır'}
            </button>
          </div>
        </div>

        {/* Filtre Satırı */}
        <div style={filterRow}>
          <input
            className="verde-input"
            placeholder="Görev / lokasyon / dolduran ara…"
            value={aramaQ}
            onChange={e => setAramaQ(e.target.value)}
            style={{ ...inp, flex: '1 1 200px' }}
          />
          <select value={durumF} onChange={e => setDurumF(e.target.value)} style={{ ...inp, minWidth: 180 }}>
            <option value="">Durum (Tümü)</option>
            <option value="TAMAMLANDI">Tamamlandı</option>
            <option value="ZAMANINDA_YAPILAMAYAN">Gecikmeli Tamamlandı</option>
          </select>
          <select value={kanaliF} onChange={e => setKanaliF(e.target.value)} style={{ ...inp, minWidth: 120 }}>
            <option value="">Kanal (Tümü)</option>
            <option value="WEB">WEB</option>
            <option value="QR">QR</option>
            <option value="NFC">NFC</option>
            <option value="MOBİL">MOBİL</option>
          </select>
          <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} style={inp} />
          <span style={{ color: '#94a3b8' }}>—</span>
          <input type="date" value={bitis} onChange={e => setBitis(e.target.value)} style={inp} />
          <button onClick={filtreUygula} disabled={loading} style={applyBtn}>
            <RefreshCw size={12} style={loading ? spinning : {}} /> Filtrele
          </button>
          {filtreMod && (
            <button onClick={filtreTemizle}
              className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3]">
              Temizle
            </button>
          )}
        </div>

        {/* Özet sayaç */}
        <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <span>
            <strong style={{ color: '#1f6b1f' }}>{filtreData.length}</strong> kayıt
          </span>
          {filtreMod && (
            <>
              <span style={{ color: '#6d28d9' }}>
                Tablo: <strong>{filtreData.filter(r => r.segment === 'tablo').length}</strong>
              </span>
              <span style={{ color: '#0369a1' }}>
                Arşiv: <strong>{filtreData.filter(r => r.segment === 'arsiv').length}</strong>
              </span>
            </>
          )}
        </div>

        {/* Tablo */}
        <div className="verde-table-wrap">
          <table className="verde-table">
            <thead>
              <tr>
                <th>Kayıt Tarihi</th>
                <th>Görev</th>
                <th>Lokasyon</th>
                <th>Şablon</th>
                <th>Durum</th>
                <th>Kanal</th>
                <th>Dolduran</th>
                <th>Doldurulma</th>
                {filtreMod && <th>Segment</th>}
                <th style={{ textAlign: 'center' }}>Detay</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={filtreMod ? 10 : 9} style={{ padding: 32, textAlign: 'center' }}>
                  <RefreshCw size={20} style={{ ...spinning, color: '#1f6b1f', display: 'block', margin: '0 auto' }} />
                </td></tr>
              ) : isU && !projeId ? (
                <tr><td colSpan={filtreMod ? 10 : 9} style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                  Bu hesap bir projeye bağlı değil.
                </td></tr>
              ) : !firmaId ? (
                <tr><td colSpan={filtreMod ? 10 : 9} style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                  Veri görüntülemek için firma seçin.
                </td></tr>
              ) : filtreData.length === 0 ? (
                <tr><td colSpan={filtreMod ? 10 : 9} style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                  Çeklist raporu bulunamadı.
                </td></tr>
              ) : (
                filtreData.map(r => {
                  const durumStil = DURUM_RENK[r.gorev_durum] ?? { bg: '#f1f5f9', color: '#475569' }
                  const kanalStil = KANAL_RENK[r.kanal] ?? { bg: '#f1f5f9', color: '#475569' }
                  const oran = pct(r.doldurulan_madde, r.toplam_madde)
                  const oranColor = oran === 100 ? '#166534' : oran >= 60 ? '#d97706' : '#dc2626'
                  const isArsivSatir = filtreMod ? r.segment === 'arsiv' : r.kaynak === 'arsiv'

                  return (
                    <tr key={r.id} style={isArsivSatir ? { background: '#faf8ff' } : undefined}>
                      <td style={{ whiteSpace: 'nowrap', color: '#94a3b8', fontSize: 12 }}>
                        {r.kayit_tarihi ? formatDateTime(r.kayit_tarihi) : '—'}
                      </td>
                      <td style={{ fontWeight: 600, fontSize: 13 }}>{r.gorev_tanim}</td>
                      <td style={{ color: '#64748b', fontSize: 12.5 }}>{r.lokasyon_tanim}</td>
                      <td style={{ color: '#64748b', fontSize: 12 }}>{r.sablon_baslik}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: 12, fontSize: 11.5, fontWeight: 700,
                          background: durumStil.bg, color: durumStil.color,
                        }}>
                          {DURUM_LABEL[r.gorev_durum] ?? r.gorev_durum}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: 12, fontSize: 11.5, fontWeight: 700,
                          background: kanalStil.bg, color: kanalStil.color,
                        }}>
                          {r.kanal}
                        </span>
                      </td>
                      <td style={{ color: '#475569', fontSize: 12.5 }}>{r.kullanici_isim}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 4, minWidth: 60 }}>
                            <div style={{ height: '100%', width: `${oran}%`, background: oranColor, borderRadius: 4, transition: 'width .3s' }} />
                          </div>
                          <span style={{ fontSize: 11.5, fontWeight: 700, color: oranColor, whiteSpace: 'nowrap' }}>
                            %{oran}
                          </span>
                          <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            ({r.doldurulan_madde}/{r.toplam_madde})
                          </span>
                        </div>
                      </td>
                      {filtreMod && (
                        <td>
                          <span style={{
                            padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                            background: isArsivSatir ? '#ede9fe' : '#dcfce7',
                            color: isArsivSatir ? '#5b21b6' : '#166534',
                          }}>
                            {segmentEtiket(r)}
                          </span>
                        </td>
                      )}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => setModalGorev({
                            id: r.gorev_id,
                            taskType: r.gorev_task_type ?? 'canli_gorevler',
                          })}
                          title="Çeklist Detayı"
                          style={{
                            width: 30, height: 30, border: 'none', borderRadius: 7,
                            background: '#e8f4e8', color: '#2e8b2e',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', margin: '0 auto',
                          }}>
                          <ExternalLink size={13} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {!filtreMod && filtreData.length > 0 && (
          <div style={{
            marginTop: 12, padding: '10px 14px', background: '#f8fafc',
            borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12.5, color: '#64748b',
          }}>
            💡 Liste, görev durumunun <strong>Tamamlandı / Gecikmeli Tamamlandı</strong> olmasına ilişkin
            <strong> durum değişim zamanına</strong> göre son <strong>24 saat</strong> içinde kalan kayıtları gösterir.
            Bu süreyi aşan kayıtlar <strong>Arşiv → Çeklist Raporları</strong> sekmesindedir.
            Tüm kayıtları (Tablo + Arşiv segmenti ile) görmek için tarih aralığı seçip <strong>Filtrele</strong>ye basın.
          </div>
        )}
      </div>

      {/* Çeklist Detay Modal */}
      {modalGorev && (
        <ChecklistModal
          taskId={modalGorev.id}
          taskType={modalGorev.taskType}
          onKapat={() => setModalGorev(null)}
        />
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
