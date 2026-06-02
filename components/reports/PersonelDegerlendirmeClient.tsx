'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'
import { RefreshCw, Users, Smartphone, MapPin, Filter, Download, ArrowUp, ArrowDown } from 'lucide-react'

interface Props { base: string; isSA: boolean; tenantFirmaId?: string | null; projeId?: string | null }

type BasariKategori = 'BAŞARILI' | 'NORMAL' | 'YETERSİZ' | 'BAŞARISIZ' | null

type Row = {
  personel_id: string
  isim_soyisim: string
  aktif: boolean
  cihaz_eslesti: boolean
  ust_lokasyon_id: string | null
  ust_lokasyon_adi: string | null
  tamamlandi_sayi: number
  iptal_sayi: number
  ortalama_sure_saniye: number | null
  aktif_gun_sayisi: number
  gunluk_ortalama_saniye: number | null
  basari_kategori: BasariKategori
}
type Meta = {
  tarih_baslangic: string
  tarih_bitis: string
  ust_lokasyonlar: { id: string; tanim: string }[]
  personeller: { id: string; isim_soyisim: string; ust_lokasyon_id: string | null }[]
  vardiyalar: { no: number; baslangic: string; bitis: string }[]
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  purple: '#7c3aed', purpleLight: '#ede9fe',
  gray: '#475569', grayLight: '#f8fafc',
}
const inp: React.CSSProperties = {
  height: 34, padding: '0 10px', borderRadius: 8,
  border: `1px solid ${T.border}`, background: '#fff', fontSize: 13, width: '100%',
}
const inpSm: React.CSSProperties = {
  height: 28, padding: '0 8px', borderRadius: 6,
  border: `1px solid ${T.border}`, background: '#fff', fontSize: 12, width: '100%',
}

const BASARI_RENK: Record<string, { bg: string; fg: string }> = {
  BAŞARILI:  { bg: T.greenLight,  fg: T.green },
  NORMAL:    { bg: T.blueLight,   fg: T.blue },
  YETERSİZ:  { bg: T.amberLight,  fg: T.amber },
  BAŞARISIZ: { bg: T.redLight,    fg: T.red },
}

function fmtSure(sn: number | null): string {
  if (!sn || sn <= 0) return '—'
  const h = Math.floor(sn / 3600)
  const m = Math.floor((sn % 3600) / 60)
  const s = sn % 60
  if (h > 0) return `${h}sa ${m}dk`
  if (m > 0) return `${m}dk ${s}sn`
  return `${s}sn`
}
// TR günü (Europe/Istanbul) — API de TR'ye göre pencere kuruyor, eşleşmeli.
function bugunISO(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
}
function gunOnceISO(g: number): string {
  const d = new Date(Date.now() - g * 24 * 60 * 60 * 1000)
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
}

type SortKey = 'isim_soyisim' | 'cihaz_eslesti' | 'ust_lokasyon_adi' | 'aktif' | 'tamamlandi_sayi' | 'iptal_sayi' | 'ortalama_sure_saniye' | 'aktif_gun_sayisi' | 'gunluk_ortalama_saniye' | 'basari_kategori'
type SortDir = 'asc' | 'desc'

export default function PersonelDegerlendirmeClient({ base, isSA, tenantFirmaId, projeId }: Props) {
  const { firmaId: ctxFirmaId } = useFirma()
  const firmaId = isSA ? ctxFirmaId : tenantFirmaId
  const { toast } = useToast()
  const toastRef = useRef(toast); toastRef.current = toast

  // Üst filtreler (server'a gider)
  const [tarihBaslangic, setTarihBaslangic] = useState(gunOnceISO(30))
  const [tarihBitis, setTarihBitis] = useState(bugunISO())
  const [ustLokFilter, setUstLokFilter] = useState('')
  const [personelFilter, setPersonelFilter] = useState('')
  const [vardiyaFilter, setVardiyaFilter] = useState('')

  // Kolon filtreleri (sadece client tarafında)
  const [colFiltreIsim, setColFiltreIsim] = useState('')
  const [colFiltreCihaz, setColFiltreCihaz] = useState<'' | 'eslesmis' | 'eslesmemis'>('')
  const [colFiltreDurum, setColFiltreDurum] = useState<'' | 'aktif' | 'pasif'>('')
  const [colFiltreBasari, setColFiltreBasari] = useState<'' | 'BAŞARILI' | 'NORMAL' | 'YETERSİZ' | 'BAŞARISIZ' | 'YOK'>('')

  // Sıralama
  const [sortKey, setSortKey] = useState<SortKey>('isim_soyisim')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const [rows, setRows] = useState<Row[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(false)

  const yukle = useCallback(async () => {
    if (!firmaId) { setRows([]); setMeta(null); return }
    setLoading(true)
    try {
      const p = new URLSearchParams({ firma_id: firmaId, tarih_baslangic: tarihBaslangic, tarih_bitis: tarihBitis })
      if (projeId) p.set('proje_id', projeId)
      if (ustLokFilter) p.set('ust_lokasyon_id', ustLokFilter)
      if (personelFilter) p.set('personel_id', personelFilter)
      if (vardiyaFilter) p.set('vardiya_no', vardiyaFilter)
      const res = await fetch(`/api/raporlar/personel-degerlendirme?${p}`, { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) {
        toastRef.current({ type: 'error', title: 'Rapor', message: json.error ?? 'Yüklenemedi' })
        setRows([]); setMeta(null)
      } else {
        setRows(json.data ?? [])
        setMeta(json.meta ?? null)
      }
    } catch {
      toastRef.current({ type: 'error', title: 'Rapor', message: 'Bağlantı hatası' })
      setRows([]); setMeta(null)
    } finally {
      setLoading(false)
    }
  }, [firmaId, projeId, tarihBaslangic, tarihBitis, ustLokFilter, personelFilter, vardiyaFilter])

  useEffect(() => { yukle() }, [yukle])

  // Üst lokasyon değişince personel seçimini sıfırla — cascade
  useEffect(() => { setPersonelFilter('') }, [ustLokFilter])

  // Personel dropdown — üst lokasyon filtresine göre daraltılır
  const personelDropdown = useMemo(() => {
    if (!meta) return [] as Meta['personeller']
    if (!ustLokFilter) return meta.personeller
    return meta.personeller.filter(p => p.ust_lokasyon_id === ustLokFilter)
  }, [meta, ustLokFilter])

  // Kolon filtre + sıralama uygulanmış satırlar
  const displayRows = useMemo(() => {
    let r = rows.slice()
    if (colFiltreIsim.trim()) {
      const q = colFiltreIsim.trim().toLocaleLowerCase('tr')
      r = r.filter(x => (x.isim_soyisim ?? '').toLocaleLowerCase('tr').includes(q))
    }
    if (colFiltreCihaz === 'eslesmis')    r = r.filter(x => x.cihaz_eslesti)
    if (colFiltreCihaz === 'eslesmemis')  r = r.filter(x => !x.cihaz_eslesti)
    if (colFiltreDurum === 'aktif') r = r.filter(x => x.aktif)
    if (colFiltreDurum === 'pasif') r = r.filter(x => !x.aktif)
    if (colFiltreBasari === 'YOK') r = r.filter(x => x.basari_kategori === null)
    else if (colFiltreBasari) r = r.filter(x => x.basari_kategori === colFiltreBasari)

    r.sort((a, b) => {
      const av = (a as any)[sortKey]
      const bv = (b as any)[sortKey]
      const dir = sortDir === 'asc' ? 1 : -1
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      if (typeof av === 'boolean' && typeof bv === 'boolean') return ((av ? 1 : 0) - (bv ? 1 : 0)) * dir
      return String(av).localeCompare(String(bv), 'tr') * dir
    })
    return r
  }, [rows, colFiltreIsim, colFiltreCihaz, colFiltreDurum, colFiltreBasari, sortKey, sortDir])

  function setSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('asc') }
  }

  // Özet
  const ozet = useMemo(() => ({
    toplamPersonel: displayRows.length,
    aktifSayi: displayRows.filter(r => r.aktif).length,
    eslesenSayi: displayRows.filter(r => r.cihaz_eslesti).length,
    toplamTamamlanan: displayRows.reduce((s, r) => s + r.tamamlandi_sayi, 0),
    toplamIptal: displayRows.reduce((s, r) => s + r.iptal_sayi, 0),
  }), [displayRows])

  // ── Excel indir ───────────────────────────────────────────────────────────
  async function exportExcel() {
    if (displayRows.length === 0) return
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(); wb.creator = 'İOGYS'
    const ws = wb.addWorksheet('Personel Değerlendirme')
    ws.columns = [
      { header: '#', key: 'sira', width: 6 },
      { header: 'Personel', key: 'isim', width: 28 },
      { header: 'Cihaz', key: 'cihaz', width: 14 },
      { header: 'Üst Lokasyon', key: 'ust', width: 18 },
      { header: 'Durum', key: 'durum', width: 10 },
      { header: 'Tamamlanan', key: 'tamamlandi', width: 14 },
      { header: 'İptal', key: 'iptal', width: 10 },
      { header: 'Ort. Süre (sn)', key: 'ort_sure', width: 16 },
      { header: 'Aktif Gün', key: 'aktif_gun', width: 12 },
      { header: 'Günlük Toplam (sa)', key: 'gunluk_ort', width: 18 },
      { header: 'Başarı', key: 'basari', width: 14 },
    ]
    ws.getRow(1).font = { bold: true }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }

    displayRows.forEach((r, i) => {
      ws.addRow({
        sira: i + 1,
        isim: r.isim_soyisim,
        cihaz: r.cihaz_eslesti ? 'Eşleşmiş' : 'Eşleşmemiş',
        ust: r.ust_lokasyon_adi ?? '',
        durum: r.aktif ? 'Aktif' : 'Pasif',
        tamamlandi: r.tamamlandi_sayi,
        iptal: r.iptal_sayi,
        ort_sure: r.ortalama_sure_saniye ?? '',
        aktif_gun: r.aktif_gun_sayisi,
        gunluk_ort: r.gunluk_ortalama_saniye != null ? Number((r.gunluk_ortalama_saniye / 3600).toFixed(2)) : '',
        basari: r.basari_kategori ?? '',
      })
    })

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `personel-degerlendirme_${tarihBaslangic}_${tarihBitis}.xlsx`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ── CSV indir ─────────────────────────────────────────────────────────────
  function exportCSV() {
    if (displayRows.length === 0) return
    const header = ['#', 'Personel', 'Cihaz', 'Üst Lokasyon', 'Durum', 'Tamamlanan', 'İptal', 'Ort. Süre (sn)', 'Aktif Gün', 'Günlük Toplam (sn)', 'Başarı']
    const lines = [header.join(';')]
    displayRows.forEach((r, i) => {
      lines.push([
        String(i + 1),
        `"${r.isim_soyisim.replace(/"/g, '""')}"`,
        r.cihaz_eslesti ? 'Eşleşmiş' : 'Eşleşmemiş',
        `"${(r.ust_lokasyon_adi ?? '').replace(/"/g, '""')}"`,
        r.aktif ? 'Aktif' : 'Pasif',
        String(r.tamamlandi_sayi),
        String(r.iptal_sayi),
        r.ortalama_sure_saniye != null ? String(r.ortalama_sure_saniye) : '',
        String(r.aktif_gun_sayisi),
        r.gunluk_ortalama_saniye != null ? String(r.gunluk_ortalama_saniye) : '',
        r.basari_kategori ?? '',
      ].join(';'))
    })
    const csv = '﻿' + lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `personel-degerlendirme_${tarihBaslangic}_${tarihBitis}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <Topbar
        title="Personel Değerlendirme Raporu"
        base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: `${base}/dashboard/raporlar` }, { label: 'Personel Değerlendirme' }]}
      />

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, height: 'calc(100vh - 60px)', minHeight: 0 }}>

        {/* ─── Üst filtre bandı ─────────────────────────────────────────────── */}
        <div className="verde-card" style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr) auto auto auto', gap: 10, alignItems: 'end' }}>
          <label style={lbl}>
            <span style={lblTxt}>Başlangıç</span>
            <input type="date" value={tarihBaslangic} onChange={e => setTarihBaslangic(e.target.value)} style={inp} />
          </label>
          <label style={lbl}>
            <span style={lblTxt}>Bitiş</span>
            <input type="date" value={tarihBitis} onChange={e => setTarihBitis(e.target.value)} style={inp} />
          </label>
          <label style={lbl}>
            <span style={lblTxt}>Vardiya</span>
            <select value={vardiyaFilter} onChange={e => setVardiyaFilter(e.target.value)} style={inp}>
              <option value="">Tümü</option>
              {(meta?.vardiyalar ?? []).map(v => (
                <option key={v.no} value={String(v.no)}>{`V${v.no} (${v.baslangic}–${v.bitis})`}</option>
              ))}
            </select>
          </label>
          <label style={lbl}>
            <span style={lblTxt}>Üst Lokasyon</span>
            <select value={ustLokFilter} onChange={e => setUstLokFilter(e.target.value)} style={inp}>
              <option value="">Tümü</option>
              {(meta?.ust_lokasyonlar ?? []).map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
            </select>
          </label>
          <label style={lbl}>
            <span style={lblTxt}>Personel</span>
            <select value={personelFilter} onChange={e => setPersonelFilter(e.target.value)} style={inp}>
              <option value="">Tümü</option>
              {personelDropdown.map(p => <option key={p.id} value={p.id}>{p.isim_soyisim}</option>)}
            </select>
          </label>
          <button onClick={yukle} disabled={loading}
            style={{ height: 34, padding: '0 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', color: T.text, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: loading ? 0.6 : 1 }}>
            <RefreshCw size={14} style={loading ? { animation: 'pdr-spin 0.9s linear infinite' } : undefined} />
            Yenile
          </button>
          <button onClick={exportExcel} disabled={displayRows.length === 0}
            style={{ height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: displayRows.length === 0 ? 0.5 : 1 }}>
            <Download size={14} /> Excel
          </button>
          <button onClick={exportCSV} disabled={displayRows.length === 0}
            style={{ height: 34, padding: '0 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', color: T.text, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: displayRows.length === 0 ? 0.5 : 1 }}>
            <Download size={14} /> CSV
          </button>
        </div>

        {/* ─── Özet kartları ───────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          <KpiKart Icon={Users} label="Toplam" value={String(ozet.toplamPersonel)} color={T.gray} />
          <KpiKart Icon={Users} label="Aktif" value={String(ozet.aktifSayi)} color={T.green} />
          <KpiKart Icon={Smartphone} label="Cihaz Eşleşmiş" value={String(ozet.eslesenSayi)} color={T.blue} />
          <KpiKart Icon={Filter} label="Tamamlanan" value={String(ozet.toplamTamamlanan)} color={T.green} />
          <KpiKart Icon={Filter} label="İptal" value={String(ozet.toplamIptal)} color={T.red} />
        </div>

        {/* ─── Başarı kriteri notu ─────────────────────────────────────────── */}
        <div style={{ padding: '12px 16px', background: T.grayLight, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 12.5, color: T.text, lineHeight: 1.6 }}>
          <strong style={{ color: T.gray }}>Başarı analizi</strong> günlük çalışma saati üzerinden aşağıdaki şekilde değerlendirilir:{' '}
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, marginLeft: 4, verticalAlign: 'middle' }}>
            <Badge text="0 – 1 saat: BAŞARISIZ" bg={T.redLight}    fg={T.red} />
            <Badge text="1 – 3 saat: YETERSİZ"  bg={T.amberLight}  fg={T.amber} />
            <Badge text="3 – 6 saat: NORMAL"    bg={T.blueLight}   fg={T.blue} />
            <Badge text="6+ saat: BAŞARILI"     bg={T.greenLight}  fg={T.green} />
          </span>
        </div>

        {/* ─── Tablo (sayfa iç scroll: üst KPI + filtre sabit kalır) ──────── */}
        <div className="verde-card" style={{ padding: 0, overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: T.textSoft, fontSize: 14 }}>Yükleniyor…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: T.textSoft, fontSize: 14 }}>
              {firmaId ? 'Bu kriterlerle eşleşen personel yok.' : 'Lütfen bir firma seçin.'}
            </div>
          ) : (
            <div style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  {/* Sıralanabilir başlıklar (sticky — scroll'da görünür kalır) */}
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    <th style={thSticky}>#</th>
                    <ThS k="isim_soyisim"           sortKey={sortKey} sortDir={sortDir} onClick={() => setSort('isim_soyisim')} sticky>Personel</ThS>
                    <ThS k="cihaz_eslesti"          sortKey={sortKey} sortDir={sortDir} onClick={() => setSort('cihaz_eslesti')} sticky>Cihaz</ThS>
                    <ThS k="ust_lokasyon_adi"       sortKey={sortKey} sortDir={sortDir} onClick={() => setSort('ust_lokasyon_adi')} sticky>Üst Lokasyon</ThS>
                    <ThS k="aktif"                  sortKey={sortKey} sortDir={sortDir} onClick={() => setSort('aktif')} sticky>Durum</ThS>
                    <ThS k="tamamlandi_sayi"        sortKey={sortKey} sortDir={sortDir} onClick={() => setSort('tamamlandi_sayi')}        align="right" sticky>Tamamlanan</ThS>
                    <ThS k="iptal_sayi"             sortKey={sortKey} sortDir={sortDir} onClick={() => setSort('iptal_sayi')}             align="right" sticky>İptal</ThS>
                    <ThS k="ortalama_sure_saniye"   sortKey={sortKey} sortDir={sortDir} onClick={() => setSort('ortalama_sure_saniye')}   align="right" sticky>Ort. Süre</ThS>
                    <ThS k="aktif_gun_sayisi"       sortKey={sortKey} sortDir={sortDir} onClick={() => setSort('aktif_gun_sayisi')}       align="right" sticky>Aktif Gün</ThS>
                    <ThS k="gunluk_ortalama_saniye" sortKey={sortKey} sortDir={sortDir} onClick={() => setSort('gunluk_ortalama_saniye')} align="right" sticky>Günlük Toplam</ThS>
                    <ThS k="basari_kategori"        sortKey={sortKey} sortDir={sortDir} onClick={() => setSort('basari_kategori')} sticky>Başarı</ThS>
                  </tr>
                  {/* Kolon filtre satırı (sticky — scroll'da görünür kalır) */}
                  <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                    <th style={thFilterSticky}></th>
                    <th style={thFilterSticky}>
                      <input value={colFiltreIsim} onChange={e => setColFiltreIsim(e.target.value)} placeholder="Ara…" style={inpSm} />
                    </th>
                    <th style={thFilterSticky}>
                      <select value={colFiltreCihaz} onChange={e => setColFiltreCihaz(e.target.value as any)} style={inpSm}>
                        <option value="">Tümü</option>
                        <option value="eslesmis">Eşleşmiş</option>
                        <option value="eslesmemis">Eşleşmemiş</option>
                      </select>
                    </th>
                    <th style={thFilterSticky}></th>
                    <th style={thFilterSticky}>
                      <select value={colFiltreDurum} onChange={e => setColFiltreDurum(e.target.value as any)} style={inpSm}>
                        <option value="">Tümü</option>
                        <option value="aktif">Aktif</option>
                        <option value="pasif">Pasif</option>
                      </select>
                    </th>
                    <th style={thFilterSticky}></th>
                    <th style={thFilterSticky}></th>
                    <th style={thFilterSticky}></th>
                    <th style={thFilterSticky}></th>
                    <th style={thFilterSticky}></th>
                    <th style={thFilterSticky}>
                      <select value={colFiltreBasari} onChange={e => setColFiltreBasari(e.target.value as any)} style={inpSm}>
                        <option value="">Tümü</option>
                        <option value="BAŞARILI">BAŞARILI</option>
                        <option value="NORMAL">NORMAL</option>
                        <option value="YETERSİZ">YETERSİZ</option>
                        <option value="BAŞARISIZ">BAŞARISIZ</option>
                        <option value="YOK">Görev Yapmamış</option>
                      </select>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((r, i) => {
                    // Pasif personel → kırmızımsı ton + soldan kırmızı kalın çubuk + isim üstü çizgili.
                    const pasif = !r.aktif
                    const rowBg = pasif ? '#fef2f2' : (i % 2 === 0 ? '#fff' : '#fafafa')
                    const isimStil: React.CSSProperties = pasif
                      ? { fontWeight: 700, color: T.textSoft, textDecoration: 'line-through' }
                      : { fontWeight: 700, color: T.text }
                    return (
                      <tr
                        key={r.personel_id}
                        style={{
                          borderBottom: `1px solid ${T.border}`,
                          background: rowBg,
                          opacity: pasif ? 0.85 : 1,
                          boxShadow: pasif ? `inset 4px 0 0 ${T.red}` : undefined,
                        }}
                        title={pasif ? 'Bu personel pasif durumda — geçmiş görevleri raporda görünür.' : undefined}
                      >
                        <td style={tdS}>{i + 1}</td>
                        <td style={{ ...tdS, ...isimStil }}>{r.isim_soyisim}</td>
                        <td style={tdS}>
                          <Badge text={r.cihaz_eslesti ? 'Eşleşmiş' : 'Eşleşmemiş'} bg={r.cihaz_eslesti ? T.greenLight : T.amberLight} fg={r.cihaz_eslesti ? T.green : T.amber} />
                        </td>
                        <td style={tdS}>{r.ust_lokasyon_adi || <span style={{ color: T.textSoft, fontStyle: 'italic' }}>—</span>}</td>
                        <td style={tdS}>
                          <Badge text={r.aktif ? 'Aktif' : 'Pasif'} bg={r.aktif ? T.greenLight : T.redLight} fg={r.aktif ? T.green : T.red} />
                        </td>
                        <td style={{ ...tdS, textAlign: 'right', fontWeight: 700, color: T.green }}>{r.tamamlandi_sayi}</td>
                        <td style={{ ...tdS, textAlign: 'right', fontWeight: 700, color: r.iptal_sayi > 0 ? T.red : T.textSoft }}>{r.iptal_sayi}</td>
                        <td style={{ ...tdS, textAlign: 'right', fontWeight: 600 }}>{fmtSure(r.ortalama_sure_saniye)}</td>
                        <td style={{ ...tdS, textAlign: 'right', fontWeight: 700, color: r.aktif_gun_sayisi > 0 ? T.text : T.textSoft }}>{r.aktif_gun_sayisi}</td>
                        <td style={{ ...tdS, textAlign: 'right', fontWeight: 700, color: r.basari_kategori ? BASARI_RENK[r.basari_kategori].fg : T.textSoft }}
                            title="Başarı kategorisi bu süreden hesaplanır (toplam aktif süre / aktif gün sayısı)">
                          {fmtSure(r.gunluk_ortalama_saniye)}
                        </td>
                        <td style={tdS}>
                          {r.basari_kategori ? (
                            <Badge text={r.basari_kategori} bg={BASARI_RENK[r.basari_kategori].bg} fg={BASARI_RENK[r.basari_kategori].fg} />
                          ) : (
                            <span style={{ color: T.textSoft, fontStyle: 'italic' }}>—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes pdr-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 }
const lblTxt: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }
const thS: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 11.5, fontWeight: 800,
  color: T.gray, textTransform: 'uppercase', letterSpacing: '0.04em',
}
// Sticky header — tablo scroll'da en üstte sabit kalır.
const thSticky: React.CSSProperties = {
  ...thS,
  position: 'sticky',
  top: 0,
  background: T.grayLight,
  zIndex: 3,
  boxShadow: `inset 0 -1px 0 ${T.border}`,
}
// Sticky kolon-filtre satırı (ana başlığın hemen altında).
const thFilterSticky: React.CSSProperties = {
  padding: 6,
  position: 'sticky',
  top: 38,  // thSticky satır yüksekliği (~38px: padding 10*2 + ~18 line)
  background: '#fff',
  zIndex: 2,
  boxShadow: `inset 0 -2px 0 ${T.border}`,
}
const tdS: React.CSSProperties = { padding: '10px 14px', color: T.text, verticalAlign: 'middle' }

function ThS({ children, k, sortKey, sortDir, onClick, align, sticky }: {
  children: React.ReactNode; k: SortKey; sortKey: SortKey; sortDir: SortDir; onClick: () => void; align?: 'left' | 'right'; sticky?: boolean
}) {
  const aktif = sortKey === k
  const baseStyle = sticky ? thSticky : thS
  return (
    <th onClick={onClick}
      style={{ ...baseStyle, textAlign: align ?? 'left', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {children}
        {aktif && (sortDir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
      </span>
    </th>
  )
}

function Badge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: bg, color: fg, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

function KpiKart({ Icon, label, value, color }: { Icon: any; label: string; value: string; color: string }) {
  return (
    <div className="verde-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: color + '18', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: T.text, lineHeight: 1.1 }}>{value}</div>
      </div>
    </div>
  )
}
