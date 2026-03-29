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
      
      // AŞAMA 1: Tüm görevler için çeklist verilerini al (PARALEL)
      const raporVerileri: any[] = []
      let maxMadde = 0
      const gorselListesi: { [key: string]: { url: string; idx: number }[] } = {}

      // Tüm görevler için paralel fetch
      const fetchPromises = filtreData.map(async (r) => {
        const gorevVerisi: any = {
          gorevId: r.gorev_id,
          kayit: r.kayit_tarihi ? formatDateTime(r.kayit_tarihi) : '',
          gorev: r.gorev_tanim,
          lokasyon: r.lokasyon_tanim,
          durum: DURUM_LABEL[r.gorev_durum] ?? r.gorev_durum,
          kanal: r.kanal,
          kullanici: r.kullanici_isim,
          oran: `%${pct(r.doldurulan_madde, r.toplam_madde)}`,
        }
        if (filtreMod) gorevVerisi.segment = segmentEtiket(r)

        // Çeklist maddelerini fetch et
        try {
          const res = await fetch(`/api/checklist-results?task_id=${r.gorev_id}&task_type=${r.gorev_task_type ?? 'canli_gorevler'}`)
          const json = await res.json()
          if (json.ok && json.sonuclar?.length) {
            json.sonuclar.forEach((madde: any, idx: number) => {
              // Madde tanımını header için saklayalım
              gorevVerisi[`madde_tanim_${idx}`] = madde.madde
              
              // Cevabı/statusu cell'de gösterelim
              const durumEmoji = madde.dolduruldu ? '✅' : '⭕'
              const cevap = madde.secenek ? `Cevap: ${madde.secenek}` : madde.not ? `Not: ${madde.not}` : '-'
              gorevVerisi[`madde_${idx}`] = `${durumEmoji}\n${cevap}`
              
              // Görselleri idx ile beraber saklayalım
              if (madde.gorsel_url) {
                if (!gorselListesi[r.gorev_id]) gorselListesi[r.gorev_id] = []
                gorselListesi[r.gorev_id].push({ url: madde.gorsel_url, idx: idx })
              }
            })
            maxMadde = Math.max(maxMadde, json.sonuclar.length)
          }
        } catch (e) {
          // Hata durumunda devam et
        }

        return gorevVerisi
      })

      const results = await Promise.all(fetchPromises)
      raporVerileri.push(...results)

      // AŞAMA 2: Dinamik kolonlar oluştur
      const cols = [
        { header: 'Kayıt Tarihi', key: 'kayit', width: 18 },
        { header: 'Görev', key: 'gorev', width: 30 },
        { header: 'Lokasyon', key: 'lokasyon', width: 20 },
        { header: 'Durum', key: 'durum', width: 18 },
        { header: 'Kanal', key: 'kanal', width: 10 },
        { header: 'Dolduran', key: 'kullanici', width: 18 },
        { header: 'Doldurulma %', key: 'oran', width: 14 },
      ] as { header: string; key: string; width: number }[]

      if (filtreMod) cols.push({ header: 'Segment', key: 'segment', width: 12 })

      // Madde tanımlarını header'larda kullanmak için topla
      const maddeTanimMap: { [key: number]: string } = {}
      for (const veri of raporVerileri) {
        for (let i = 0; i < maxMadde; i++) {
          if (veri[`madde_tanim_${i}`] && !maddeTanimMap[i]) {
            maddeTanimMap[i] = veri[`madde_tanim_${i}`]
          }
        }
      }

      // Madde kolonlarını ekle (tanımları header olarak)
      for (let i = 0; i < maxMadde; i++) {
        cols.push({ 
          header: maddeTanimMap[i] || `Madde ${i + 1}`, 
          key: `madde_${i}`, 
          width: 28 
        })
      }

      // Görseller sütunu
      cols.push({ header: 'Görseller', key: 'gorseller', width: 30 })

      ws.columns = cols

      // AŞAMA 3: Header şekillendirme
      const hr = ws.getRow(1)
      hr.font = { bold: true, color: { argb: 'FF1F6B1F' }, size: 11 }
      hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCF0DC' } }
      hr.height = 22

      // AŞAMA 4: Veri satırlarını ekle (görsel URL'si hariç)
      for (const veri of raporVerileri) {
        const row = ws.addRow(veri)
        row.font = { size: 10 }
        row.alignment = { wrapText: true, vertical: 'top' }
      }

      // Görseller sütununda hyperlink'leri ekle (sonradan)
      let rowIdx = 2
      for (const veri of raporVerileri) {
        if (gorselListesi[veri.gorevId] && gorselListesi[veri.gorevId].length > 0) {
          const cell = ws.getRow(rowIdx).getCell(cols.length) // Son sütun (Görseller)
          const gorseller = gorselListesi[veri.gorevId]
          
          // Display text: "Görsel 1\nGörsel 2\n..." şeklinde
          const displayText = gorseller.map((_, i) => `Görsel ${i + 1}`).join('\n')
          
          // Hyperlink: ilk görsele
          cell.value = { text: displayText, hyperlink: gorseller[0].url }
          cell.font = { size: 10, color: { argb: 'FF0369a1' }, underline: 'single' }
          cell.alignment = { wrapText: true, vertical: 'top' }
          
          // Üstündeki görseller için note ekle
          if (gorseller.length > 1) {
            cell.note = gorseller.map((g, i) => `Görsel ${i + 1}: ${g.url}`).join('\n')
          }
        } else {
          const cell = ws.getRow(rowIdx).getCell(cols.length)
          cell.value = '—'
        }
        rowIdx++
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
      // AŞAMA 1: Tüm görevler için veri topla (PARALEL)
      const raporVerileri: Record<string, any>[] = []
      const gorselListesi: Record<string, { url: string; idx: number }[]> = {}
      let maxMadde = 0

      const fetchPromises = filtreData.map(async (r) => {
        const gorevVerisi: Record<string, any> = {
          gorevId: r.gorev_id,
          kayit_tarihi: r.kayit_tarihi ? formatDateTime(r.kayit_tarihi) : '—',
          gorev_tanim: r.gorev_tanim,
          lokasyon_tanim: r.lokasyon_tanim,
          sablon_baslik: r.sablon_baslik,
          gorev_durum: DURUM_LABEL[r.gorev_durum] ?? r.gorev_durum,
          kanal: r.kanal,
          kullanici_isim: r.kullanici_isim,
          doldurulan_oran: `%${pct(r.doldurulan_madde, r.toplam_madde)} (${r.doldurulan_madde}/${r.toplam_madde})`,
        }

        if (filtreMod) gorevVerisi.segment = segmentEtiket(r)

        // Çeklist maddelerini fetch et
        try {
          const res = await fetch(`/api/checklist-results?task_id=${r.gorev_id}&task_type=${r.gorev_task_type ?? 'canli_gorevler'}`)
          const json = await res.json()
          if (json.ok && json.sonuclar?.length) {
            const sonuclar = json.sonuclar
            if (sonuclar.length > maxMadde) maxMadde = sonuclar.length

            sonuclar.forEach((madde: any, idx: number) => {
              const durumEmoji = madde.dolduruldu ? '✅' : '⭕'
              const zorunluText = madde.zorunlu ? ' <span style="color:#dc2626;font-weight:700">[ZORUNLU]</span>' : ''
              const cevapText = madde.secenek ? ` → <strong>${madde.secenek}</strong>` : ''
              const notText = madde.not ? `<br/><small>Not: ${madde.not}</small>` : ''
              gorevVerisi[`madde_${idx}`] = `<div style="font-size:10px">${durumEmoji} ${madde.sira}. ${madde.madde}${zorunluText}${cevapText}${notText}</div>`

              if (madde.gorsel_url) {
                if (!gorselListesi[r.gorev_id]) gorselListesi[r.gorev_id] = []
                gorselListesi[r.gorev_id].push({ url: madde.gorsel_url, idx: idx })
              }
            })
          }
        } catch (e) {
          // Hata durumunda devam et
        }

        return gorevVerisi
      })

      const results = await Promise.all(fetchPromises)
      raporVerileri.push(...results)

      // AŞAMA 2: Dinamik tablo headers
      const baseHeaders = ['Kayıt Tarihi', 'Görev', 'Lokasyon', 'Şablon', 'Durum', 'Kanal', 'Dolduran', 'Doldurulma %']
      if (filtreMod) baseHeaders.push('Segment')

      let maddeSutunlari = ''
      for (let i = 0; i < maxMadde; i++) {
        maddeSutunlari += `<th>Madde ${i + 1}</th>`
      }

      // AŞAMA 3: Tablo HTML'ini oluştur
      let tableHtml = ''
      for (const veri of raporVerileri) {
        let rowHtml = `<tr>
          <td>${veri.kayit_tarihi}</td>
          <td>${veri.gorev_tanim}</td>
          <td>${veri.lokasyon_tanim}</td>
          <td>${veri.sablon_baslik}</td>
          <td>${veri.gorev_durum}</td>
          <td>${veri.kanal}</td>
          <td>${veri.kullanici_isim}</td>
          <td>${veri.doldurulan_oran}</td>`

        if (filtreMod) rowHtml += `<td>${veri.segment}</td>`

        // Maddeler
        for (let i = 0; i < maxMadde; i++) {
          const maddeHtml = veri[`madde_${i}`] ?? '—'
          rowHtml += `<td>${maddeHtml}</td>`
        }

        // Görseller
        const gorseller = gorselListesi[veri.gorevId] ?? []
        const gorselHtml = gorseller.length > 0 
          ? gorseller.map((g, i) => `<a href="${g.url}" target="_blank" style="color:#0369a1;text-decoration:underline">Görsel ${i + 1}</a>`).join(' | ')
          : '—'
        rowHtml += `<td>${gorselHtml}</td>`
        rowHtml += '</tr>'

        tableHtml += rowHtml
      }

      const segTh = filtreMod ? '<th>Segment</th>' : ''
      const w = window.open('', '_blank', 'width=1400,height=700')
      if (!w) return
      w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/>
        <title>Çeklist Raporları</title>
        <style>
          body{font-family:Arial,sans-serif;font-size:11px;padding:20px}
          table{width:100%;border-collapse:collapse}
          th{background:#dcf0dc;color:#1f6b1f;font-weight:700;padding:6px 8px;border:1px solid #b8e0b8;text-align:left}
          td{padding:5px 8px;border:1px solid #d6e4d6;font-size:10px}
          tr:nth-child(even) td{background:#f3faf3}
        </style>
        </head><body>
        <h2 style="color:#1f6b1f">Çeklist Raporları</h2>
        <table><thead><tr>
          <th>Kayıt Tarihi</th><th>Görev</th><th>Lokasyon</th><th>Şablon</th>
          <th>Durum</th><th>Kanal</th><th>Dolduran</th><th>Doldurulma</th>${segTh}${maddeSutunlari}<th>Görseller</th>
        </tr></thead><tbody>${tableHtml}</tbody></table></body></html>`)
      w.document.close(); setTimeout(() => w.print(), 600)
    } catch (e: any) {
      toast({ type: 'error', title: 'Yazdırma Hatası', message: e.message })
    } finally {
      setIsDownloading(false)
    }
  }

  // ── PDF İndir ──────────────────────────────────────────────────────────
  async function pdfIndir() {
    setIsDownloading(true)
    try {
      // AŞAMA 1: Tüm görevler için veri topla (PARALEL)
      const raporVerileri: Record<string, any>[] = []
      const gorselListesi: Record<string, { url: string; idx: number }[]> = {}
      let maxMadde = 0

      const fetchPromises = filtreData.map(async (r) => {
        const gorevVerisi: Record<string, any> = {
          gorevId: r.gorev_id,
          kayit_tarihi: r.kayit_tarihi ? formatDateTime(r.kayit_tarihi) : '—',
          gorev_tanim: r.gorev_tanim,
          lokasyon_tanim: r.lokasyon_tanim,
          sablon_baslik: r.sablon_baslik,
          gorev_durum: DURUM_LABEL[r.gorev_durum] ?? r.gorev_durum,
          kanal: r.kanal,
          kullanici_isim: r.kullanici_isim,
          doldurulan_oran: `%${pct(r.doldurulan_madde, r.toplam_madde)} (${r.doldurulan_madde}/${r.toplam_madde})`,
        }

        if (filtreMod) gorevVerisi.segment = segmentEtiket(r)

        // Çeklist maddelerini fetch et
        try {
          const res = await fetch(`/api/checklist-results?task_id=${r.gorev_id}&task_type=${r.gorev_task_type ?? 'canli_gorevler'}`)
          const json = await res.json()
          if (json.ok && json.sonuclar?.length) {
            const sonuclar = json.sonuclar
            if (sonuclar.length > maxMadde) maxMadde = Math.max(maxMadde, sonuclar.length)

            sonuclar.forEach((madde: any, idx: number) => {
              const durumEmoji = madde.dolduruldu ? '✅' : '⭕'
              const zorunluText = madde.zorunlu ? ' <span style="color:#dc2626;font-weight:700">[ZORUNLU]</span>' : ''
              const cevapText = madde.secenek ? ` → <strong>${madde.secenek}</strong>` : ''
              const notText = madde.not ? `<br/><small>Not: ${madde.not}</small>` : ''
              gorevVerisi[`madde_${idx}`] = `<div style="font-size:9px">${durumEmoji} ${madde.sira}. ${madde.madde}${zorunluText}${cevapText}${notText}</div>`

              if (madde.gorsel_url) {
                if (!gorselListesi[r.gorev_id]) gorselListesi[r.gorev_id] = []
                gorselListesi[r.gorev_id].push({ url: madde.gorsel_url, idx: idx })
              }
            })
          }
        } catch (e) {
          // Hata durumunda devam et
        }

        return gorevVerisi
      })

      const results = await Promise.all(fetchPromises)
      raporVerileri.push(...results)

      // AŞAMA 2: Dinamik tablo headers
      const baseHeaders = ['Kayıt Tarihi', 'Görev', 'Lokasyon', 'Şablon', 'Durum', 'Kanal', 'Dolduran', 'Doldurulma %']
      if (filtreMod) baseHeaders.push('Segment')

      let maddeSutunlari = ''
      for (let i = 0; i < maxMadde; i++) {
        maddeSutunlari += `<th>Madde ${i + 1}</th>`
      }

      // AŞAMA 3: Tablo HTML'ini oluştur
      let tableHtml = ''
      for (const veri of raporVerileri) {
        let rowHtml = `<tr>
          <td>${veri.kayit_tarihi}</td>
          <td>${veri.gorev_tanim}</td>
          <td>${veri.lokasyon_tanim}</td>
          <td>${veri.sablon_baslik}</td>
          <td>${veri.gorev_durum}</td>
          <td>${veri.kanal}</td>
          <td>${veri.kullanici_isim}</td>
          <td>${veri.doldurulan_oran}</td>`

        if (filtreMod) rowHtml += `<td>${veri.segment}</td>`

        // Maddeler
        for (let i = 0; i < maxMadde; i++) {
          const maddeHtml = veri[`madde_${i}`] ?? '—'
          rowHtml += `<td>${maddeHtml}</td>`
        }

        // Görseller
        const gorseller = gorselListesi[veri.gorevId] ?? []
        const gorselHtml = gorseller.length > 0 
          ? gorseller.map((g, i) => `<a href="${g.url}" target="_blank" style="color:#0369a1;text-decoration:underline;font-size:9px">Görsel ${i + 1}</a>`).join(' | ')
          : '—'
        rowHtml += `<td>${gorselHtml}</td>`
        rowHtml += '</tr>'

        tableHtml += rowHtml
      }

      const segTh = filtreMod ? '<th>Segment</th>' : ''
      const htmlContent = `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/>
        <title>Çeklist Raporları</title>
        <style>
          body{font-family:Arial,sans-serif;font-size:10px;padding:20px}
          table{width:100%;border-collapse:collapse}
          th{background:#dcf0dc;color:#1f6b1f;font-weight:700;padding:5px 6px;border:1px solid #b8e0b8;text-align:left;font-size:9px}
          td{padding:4px 6px;border:1px solid #d6e4d6;font-size:8px;word-wrap:break-word}
          tr:nth-child(even) td{background:#f3faf3}
          h2{color:#1f6b1f;margin-bottom:15px;font-size:16px}
        </style>
        </head><body>
        <h2>Çeklist Raporları</h2>
        <table><thead><tr>
          <th>Kayıt Tarihi</th><th>Görev</th><th>Lokasyon</th><th>Şablon</th>
          <th>Durum</th><th>Kanal</th><th>Dolduran</th><th>%</th>${segTh}${maddeSutunlari}<th>Görseller</th>
        </tr></thead><tbody>${tableHtml}</tbody></table></body></html>`

      // AŞAMA 4: HTML2PDF ile PDF oluştur
      const tempDiv = document.createElement('div')
      tempDiv.style.display = 'none'
      tempDiv.innerHTML = htmlContent
      document.body.appendChild(tempDiv)

      try {
        // html2pdf.js dinamik import
        const module = await import('html2pdf.js')
        const html2pdf = module.default || module
        
        const element = tempDiv.querySelector('table') || tempDiv.querySelector('h2')
        if (element) {
          const opt = {
            margin: [10, 8, 10, 8],
            filename: `ceklist-raporlari-${new Date().toISOString().slice(0, 10)}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { orientation: 'landscape' as const, unit: 'mm', format: 'a4' }
          }
          
          // html2pdf chain API'sı
          html2pdf()
            .set(opt)
            .from(tempDiv)
            .save()
        }
      } catch (e) {
        // Hata durumunda toast'u çağır
        throw new Error(`PDF oluşturulamadı: ${e}`)
      } finally {
        document.body.removeChild(tempDiv)
      }
    } catch (e: any) {
      toast({ type: 'error', title: 'PDF İndirme Hatası', message: e.message })
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
              // CSV: Her görev satırı + maddeler ayrı kolonlar (PARALEL FETCH)
              setIsDownloading(true)
              try {
                // AŞAMA 1: Tüm görevler için veri topla (PARALEL)
                const raporVerileri: Record<string, any>[] = []
                const gorselListesi: Record<string, { url: string; idx: number }[]> = {}
                let maxMadde = 0

                const fetchPromises = filtreData.map(async (r) => {
                  const gorevVerisi: Record<string, any> = {
                    gorevId: r.gorev_id,
                    kayit_tarihi: r.kayit_tarihi ? formatDateTime(r.kayit_tarihi) : '',
                    gorev_tanim: r.gorev_tanim,
                    lokasyon_tanim: r.lokasyon_tanim,
                    sablon_baslik: r.sablon_baslik,
                    gorev_durum: DURUM_LABEL[r.gorev_durum] ?? r.gorev_durum,
                    kanal: r.kanal,
                    kullanici_isim: r.kullanici_isim,
                    doldurulan_oran: `%${pct(r.doldurulan_madde, r.toplam_madde)}`,
                  }

                  if (filtreMod) gorevVerisi.segment = segmentEtiket(r)

                  // Çeklist maddelerini fetch et
                  try {
                    const res = await fetch(`/api/checklist-results?task_id=${r.gorev_id}&task_type=${r.gorev_task_type ?? 'canli_gorevler'}`)
                    const json = await res.json()
                    if (json.ok && json.sonuclar?.length) {
                      const sonuclar = json.sonuclar
                      if (sonuclar.length > maxMadde) maxMadde = sonuclar.length

                      sonuclar.forEach((madde: any, idx: number) => {
                        const durumEmoji = madde.dolduruldu ? '✅' : '⭕'
                        const zorunluText = madde.zorunlu ? ' [ZORUNLU]' : ''
                        const cevapText = madde.secenek ? ` → ${madde.secenek}` : ''
                        const notText = madde.not ? ` | Not: ${madde.not}` : ''
                        gorevVerisi[`madde_${idx}`] = `${durumEmoji} ${madde.sira}. ${madde.madde}${zorunluText}${cevapText}${notText}`

                        if (madde.gorsel_url) {
                          if (!gorselListesi[r.gorev_id]) gorselListesi[r.gorev_id] = []
                          gorselListesi[r.gorev_id].push({ url: madde.gorsel_url, idx: idx })
                        }
                      })
                    }
                  } catch (e) {
                    // Hata durumunda devam et
                  }

                  return gorevVerisi
                })

                const results = await Promise.all(fetchPromises)
                raporVerileri.push(...results)

                // AŞAMA 2: Dinamik headers oluştur
                const baseHeaders = ['Kayıt Tarihi', 'Görev', 'Lokasyon', 'Şablon', 'Durum', 'Kanal', 'Dolduran', 'Doldurulma %']
                if (filtreMod) baseHeaders.push('Segment')

                const headers: string[] = [...baseHeaders]
                for (let i = 0; i < maxMadde; i++) {
                  headers.push(`Madde ${i + 1}`)
                }
                headers.push('Görseller')

                // AŞAMA 3: CSV satırları oluştur
                const rows: string[][] = []
                for (const veri of raporVerileri) {
                  const row: string[] = [
                    veri.kayit_tarihi,
                    veri.gorev_tanim,
                    veri.lokasyon_tanim,
                    veri.sablon_baslik,
                    veri.gorev_durum,
                    veri.kanal,
                    veri.kullanici_isim,
                    veri.doldurulan_oran,
                  ]

                  if (filtreMod) row.push(veri.segment)

                  // Maddeler
                  for (let i = 0; i < maxMadde; i++) {
                    row.push(veri[`madde_${i}`] ?? '')
                  }

                  // Görseller
                  const gorseller = gorselListesi[veri.gorevId] ?? []
                  row.push(gorseller.join('; '))

                  rows.push(row)
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
            <button onClick={pdfIndir} disabled={!filtreData.length || isDownloading}
              className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40"
              style={{ color: '#9d174d' }}>
              {isDownloading ? <RefreshCw size={13} style={spinning} /> : <Download size={13} />} {isDownloading ? 'Hazırlanıyor...' : 'PDF'}
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
