'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { RefreshCw, Plus, Search, Trash2, Pencil, Upload, Download, FileSpreadsheet, AlertTriangle, CheckCircle2 } from 'lucide-react'

type Arac = {
  id: string
  firma_id: string
  proje_id: string | null
  plaka: string
  marka: string | null
  model: string | null
  renk: string | null
  departman: string | null
  periyot_gun: number
  son_yikama_tarihi: string | null
  aktif: boolean
  notlar: string | null
  kullanici_adi_soyadi: string | null
  kullanici_telefon: string | null
  kullanici_email: string | null
  olusturma_tarihi: string
  guncelleme_tarihi: string
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  grayLight: '#f8fafc',
}

const BOS_FORM = {
  plaka: '', marka: '', model: '', renk: '', departman: '', periyot_gun: 7, notlar: '',
  kullanici_adi_soyadi: '', kullanici_telefon: '', kullanici_email: '',
}

export default function AraclarClient({ firmaId, projeId }: { firmaId: string; projeId: string | null }) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [araclar, setAraclar] = useState<Arac[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [q, setQ] = useState('')
  const [filterDepartman, setFilterDepartman] = useState('')
  const [filterAktif, setFilterAktif] = useState<'all' | 'aktif' | 'pasif'>('aktif')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Arac | null>(null)
  const [form, setForm] = useState(BOS_FORM)
  const [kaydetLoading, setKaydetLoading] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [importPreview, setImportPreview] = useState<{ eklenecek: number; dokunulmayan: number; silinecek: number; ornek?: { eklenecek: string[]; silinecek: string[] }; satirlar: any[] } | null>(null)
  const [importLoading, setImportLoading] = useState(false)

  async function yukle() {
    setYukleniyor(true)
    try {
      const qp = new URLSearchParams({ firma_id: firmaId })
      if (projeId) qp.set('proje_id', projeId)
      if (filterAktif === 'aktif') qp.set('aktif', 'true')
      if (filterAktif === 'pasif') qp.set('aktif', 'false')
      const res = await fetch(`/api/oto-yikama/araclar?${qp}`, { cache: 'no-store' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error)
      setAraclar(j.data)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { yukle() }, [firmaId, projeId, filterAktif])

  const departmanlar = useMemo(() => {
    const set = new Set<string>()
    for (const a of araclar) if (a.departman) set.add(a.departman)
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'))
  }, [araclar])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return araclar.filter(a => {
      if (filterDepartman && a.departman !== filterDepartman) return false
      if (s) {
        const hay = `${a.plaka} ${a.marka ?? ''} ${a.model ?? ''} ${a.departman ?? ''} ${a.kullanici_adi_soyadi ?? ''}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [araclar, q, filterDepartman])

  function openCreate() {
    setEditing(null)
    setForm(BOS_FORM)
    setModalOpen(true)
  }

  function openEdit(a: Arac) {
    setEditing(a)
    setForm({
      plaka: a.plaka, marka: a.marka ?? '', model: a.model ?? '', renk: a.renk ?? '',
      departman: a.departman ?? '', periyot_gun: a.periyot_gun,
      notlar: a.notlar ?? '',
      kullanici_adi_soyadi: a.kullanici_adi_soyadi ?? '',
      kullanici_telefon: a.kullanici_telefon ?? '',
      kullanici_email: a.kullanici_email ?? '',
    })
    setModalOpen(true)
  }

  async function kaydet() {
    if (!form.plaka.trim()) { toast({ type: 'error', title: 'Hata', message: 'Plaka gerekli' }); return }
    if (!form.kullanici_adi_soyadi.trim()) { toast({ type: 'error', title: 'Hata', message: 'Kullanıcı adı soyadı gerekli' }); return }
    if (!form.departman.trim()) { toast({ type: 'error', title: 'Hata', message: 'Departman gerekli' }); return }
    setKaydetLoading(true)
    try {
      const url = editing ? `/api/oto-yikama/araclar/${editing.id}` : `/api/oto-yikama/araclar`
      const method = editing ? 'PATCH' : 'POST'
      const body: any = { ...form, firma_id: firmaId, proje_id: projeId }
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error)
      toast({ type: 'success', title: editing ? 'Güncellendi' : 'Eklendi', message: `${form.plaka} kaydedildi` })
      setModalOpen(false)
      yukle()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setKaydetLoading(false)
    }
  }

  async function sil(a: Arac) {
    const ok = await confirm({
      title: 'Aracı Pasif Yap',
      message: `"${a.plaka}" pasif duruma alınacak. Geçmiş yıkama görevleri etkilenmez. Onaylıyor musunuz?`,
      confirmText: 'Pasif Yap',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/oto-yikama/araclar/${a.id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error)
      toast({ type: 'success', title: 'Pasif yapıldı', message: a.plaka })
      yukle()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
  }

  // ── Excel sablonu indir ──────────────────────────────────────
  async function sablonIndir() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Araç Listesi')
    // Zorunlu sütunlar: plaka, kullanici_adi_soyadi, departman
    ws.columns = [
      { header: 'plaka',                key: 'plaka',                width: 14 },
      { header: 'kullanici_adi_soyadi', key: 'kullanici_adi_soyadi', width: 24 },
      { header: 'departman',            key: 'departman',            width: 22 },
      { header: 'marka',                key: 'marka',                width: 14 },
      { header: 'model',                key: 'model',                width: 14 },
      { header: 'renk',                 key: 'renk',                 width: 12 },
      { header: 'periyot_gun',          key: 'periyot_gun',          width: 12 },
      { header: 'kullanici_telefon',    key: 'kullanici_telefon',    width: 18 },
      { header: 'kullanici_email',      key: 'kullanici_email',      width: 24 },
    ]
    ws.addRow({ plaka: '06ABC123', kullanici_adi_soyadi: 'Ahmet Yılmaz', departman: 'Üretim Hattı 3', marka: 'TOYOTA', model: 'Corolla', renk: 'Beyaz', periyot_gun: 7,  kullanici_telefon: '5551234567', kullanici_email: 'ahmet@firma.com' })
    ws.addRow({ plaka: '34XYZ789', kullanici_adi_soyadi: 'Mehmet Demir',  departman: 'Yönetim',         marka: 'FORD',   model: 'Focus',   renk: 'Gri',   periyot_gun: 14, kullanici_telefon: '',           kullanici_email: '' })
    // Başlık satırı: bold + zorunlu sütunlar kırmızı vurgulu
    const header = ws.getRow(1)
    header.font = { bold: true }
    // Zorunlu sütunlar: plaka (A), kullanici_adi_soyadi (B), departman (C)
    ;['A1', 'B1', 'C1'].forEach(addr => {
      const c = ws.getCell(addr)
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }  // kırmızımsı
      c.font = { bold: true, color: { argb: 'FF991B1B' } }
    })
    // Not satırı ekle (3. satır)
    ws.insertRow(4, { plaka: '* Zorunlu alanlar: plaka, kullanici_adi_soyadi, departman' })
    ws.getRow(4).font = { italic: true, color: { argb: 'FF991B1B' } }
    ws.mergeCells('A4:I4')
    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'arac-listesi-sablon.xlsx'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // ── Excel parse + sync önizleme ──────────────────────────────
  async function importDosyaSec(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportLoading(true)
    setImportPreview(null)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(await file.arrayBuffer())
      const ws = wb.worksheets[0]
      const headers: string[] = []
      ws.getRow(1).eachCell((c) => headers.push(String(c.value ?? '').toLowerCase().trim()))
      const idxPlaka = headers.indexOf('plaka')
      if (idxPlaka < 0) throw new Error('Excel\'de "plaka" sütunu bulunamadı.')
      const idxKulAd = headers.indexOf('kullanici_adi_soyadi')
      if (idxKulAd < 0) throw new Error('Excel\'de "kullanici_adi_soyadi" sütunu bulunamadı.')
      const idxDep = headers.indexOf('departman')
      if (idxDep < 0) throw new Error('Excel\'de "departman" sütunu bulunamadı.')
      const idxMarka = headers.indexOf('marka')
      const idxModel = headers.indexOf('model')
      const idxRenk = headers.indexOf('renk')
      const idxPer = headers.indexOf('periyot_gun')
      const idxKulTel = headers.indexOf('kullanici_telefon')
      const idxKulMail = headers.indexOf('kullanici_email')

      // Excel hücre değerini düz string'e çevir (email obj { text, hyperlink } da olabilir)
      const cellStr = (val: any): string => {
        if (val == null) return ''
        if (typeof val === 'string') return val.trim()
        if (typeof val === 'number') return String(val)
        if (typeof val === 'object') {
          if ('text' in val) return String(val.text ?? '').trim()
          if ('result' in val) return String(val.result ?? '').trim()
          if ('richText' in val && Array.isArray(val.richText)) return val.richText.map((r: any) => r.text ?? '').join('').trim()
        }
        return String(val).trim()
      }

      const satirlar: any[] = []
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return
        const plaka = cellStr(row.getCell(idxPlaka + 1).value).toUpperCase().replace(/\s+/g, '')
        const kulAd = cellStr(row.getCell(idxKulAd + 1).value)
        const dep = cellStr(row.getCell(idxDep + 1).value)
        // Tamamen boş satırları (yorum/not satırı dahil) atla
        if (!plaka && !kulAd && !dep) return
        satirlar.push({
          plaka,
          kullanici_adi_soyadi: kulAd || null,
          departman: dep || null,
          marka: idxMarka >= 0 ? cellStr(row.getCell(idxMarka + 1).value) || null : null,
          model: idxModel >= 0 ? cellStr(row.getCell(idxModel + 1).value) || null : null,
          renk:  idxRenk >= 0 ? cellStr(row.getCell(idxRenk + 1).value) || null : null,
          periyot_gun: idxPer >= 0 ? Number(row.getCell(idxPer + 1).value) || 7 : 7,
          kullanici_telefon: idxKulTel >= 0 ? cellStr(row.getCell(idxKulTel + 1).value) || null : null,
          kullanici_email: idxKulMail >= 0 ? cellStr(row.getCell(idxKulMail + 1).value) || null : null,
        })
      })
      if (satirlar.length === 0) throw new Error('Excel\'de geçerli satır bulunamadı.')

      // Dry-run ile önizleme al
      const res = await fetch('/api/oto-yikama/araclar/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firma_id: firmaId, proje_id: projeId, araclar: satirlar, dry_run: true }),
      })
      const j = await res.json()
      if (!j.ok) {
        if (j.hatali_satirlar?.length) {
          const ornek = j.hatali_satirlar.slice(0, 5).map((h: any) => `Satır ${h.satir} (${h.plaka}): ${h.eksik.join(', ')}`).join('\n')
          throw new Error(`${j.error}\n\nİlk hatalı satırlar:\n${ornek}${j.toplam_hatali > 5 ? `\n…ve ${j.toplam_hatali - 5} satır daha` : ''}`)
        }
        throw new Error(j.error)
      }
      setImportPreview({ ...j, satirlar })
    } catch (err: any) {
      toast({ type: 'error', title: 'Excel hatası', message: err.message })
    } finally {
      setImportLoading(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  async function importOnayla() {
    if (!importPreview) return
    const ok = await confirm({
      title: '⚠️ Araç Listesi Senkronizasyonu',
      message: `Bu işlem:\n• ${importPreview.eklenecek} yeni araç ekleyecek\n• ${importPreview.dokunulmayan} mevcut araca dokunmayacak\n• ${importPreview.silinecek} aracı PASİF yapacak (excel'de olmayan)\n\nDevam etmek istiyor musunuz?`,
      confirmText: 'Onayla',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return
    setImportLoading(true)
    try {
      const res = await fetch('/api/oto-yikama/araclar/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firma_id: firmaId, proje_id: projeId, araclar: importPreview.satirlar }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? (j.hata?.join('; ') ?? 'Sync başarısız'))
      toast({
        type: 'success',
        title: 'Sync tamamlandı',
        message: `+${j.eklenen} eklendi, ${j.dokunulmayan} korundu, -${j.silinen} pasif yapıldı`,
      })
      setImportPreview(null)
      yukle()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setImportLoading(false)
    }
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Üst bar — filter + actions */}
      <div className="verde-card" style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <input
          className="verde-input" placeholder="Plaka, marka, departman, kullanıcı..." value={q}
          onChange={e => setQ(e.target.value)} style={{ maxWidth: 240 }}
        />
        <select className="verde-select" value={filterDepartman} onChange={e => setFilterDepartman(e.target.value)} style={{ width: 180 }}>
          <option value="">Departman (Tümü)</option>
          {departmanlar.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="verde-select" value={filterAktif} onChange={e => setFilterAktif(e.target.value as any)} style={{ width: 120 }}>
          <option value="aktif">Aktif</option>
          <option value="pasif">Pasif</option>
          <option value="all">Tümü</option>
        </select>
        <span style={{ fontSize: 12, color: T.textSoft }}>{filtered.length}/{araclar.length}</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={importInputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={importDosyaSec} />
          <button onClick={() => importInputRef.current?.click()} disabled={importLoading}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            {importLoading ? <RefreshCw size={13} style={{ animation: 'spin 0.9s linear infinite' }} /> : <Upload size={13} />}
            Excel ile Sync
          </button>
          <button onClick={sablonIndir}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <Download size={13} /> Şablon
          </button>
          <button onClick={yukle}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <RefreshCw size={13} style={yukleniyor ? { animation: 'spin 0.9s linear infinite' } : undefined} /> Yenile
          </button>
          <button onClick={openCreate}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: T.text, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
            <Plus size={13} /> Yeni Araç
          </button>
        </div>
      </div>

      {/* Import preview banner */}
      {importPreview && (
        <div className="verde-card" style={{ padding: '14px 18px', marginBottom: 12, border: `2px solid ${T.amber}`, background: T.amberLight }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <FileSpreadsheet size={18} color={T.amber} />
            <strong style={{ fontSize: 15, color: T.text }}>Excel Sync Önizleme</strong>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: T.textSoft }}>Excel'de {importPreview.satirlar.length} satır</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
            <div style={{ padding: 10, background: '#fff', borderRadius: 8, border: `1px solid ${T.green}40` }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: T.green }}>+{importPreview.eklenecek}</div>
              <div style={{ fontSize: 11, color: T.textSoft }}>Yeni eklenecek</div>
              {importPreview.ornek?.eklenecek?.length ? (
                <div style={{ fontSize: 11, color: T.textSoft, marginTop: 4, fontFamily: 'monospace' }}>{importPreview.ornek.eklenecek.join(', ')}{importPreview.eklenecek > 5 ? '…' : ''}</div>
              ) : null}
            </div>
            <div style={{ padding: 10, background: '#fff', borderRadius: 8, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: T.textSoft }}>{importPreview.dokunulmayan}</div>
              <div style={{ fontSize: 11, color: T.textSoft }}>Mevcut, korunur</div>
            </div>
            <div style={{ padding: 10, background: '#fff', borderRadius: 8, border: `1px solid ${T.red}40` }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: T.red }}>-{importPreview.silinecek}</div>
              <div style={{ fontSize: 11, color: T.textSoft }}>Pasif yapılacak</div>
              {importPreview.ornek?.silinecek?.length ? (
                <div style={{ fontSize: 11, color: T.textSoft, marginTop: 4, fontFamily: 'monospace' }}>{importPreview.ornek.silinecek.join(', ')}{importPreview.silinecek > 5 ? '…' : ''}</div>
              ) : null}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={importOnayla} disabled={importLoading}
              style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: T.green, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
              {importLoading ? 'Uygulanıyor…' : 'Onayla ve Uygula'}
            </button>
            <button onClick={() => setImportPreview(null)}
              style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 13, color: T.text }}>
              İptal
            </button>
          </div>
        </div>
      )}

      {/* Tablo — tam genişlik, sticky başlık, sayfa scroll */}
      <div className="verde-card" style={{ overflow: 'visible' }}>
        <table className="verde-table" style={{ width: '100%' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: T.grayLight, boxShadow: `0 1px 0 ${T.border}` }}>
            <tr>
              <th>Plaka</th>
              <th>Kullanıcı</th>
              <th>Departman</th>
              <th>Marka / Model</th>
              <th>Renk</th>
              <th>Periyot</th>
              <th>Son Yıkama</th>
              <th>Durum</th>
              <th style={{ width: 110, textAlign: 'right' }}>İşlem</th>
            </tr>
          </thead>
            <tbody>
              {yukleniyor ? (
                <tr><td colSpan={9} style={{ padding: 30, textAlign: 'center', color: T.textSoft }}>Yükleniyor…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 30, textAlign: 'center', color: T.textSoft }}>Kayıt bulunamadı.</td></tr>
              ) : filtered.map(a => {
                const gecikme = a.son_yikama_tarihi ? (
                  Math.floor((Date.now() - new Date(a.son_yikama_tarihi).getTime()) / 86400000) - a.periyot_gun
                ) : null
                return (
                  <tr key={a.id} style={{ opacity: a.aktif ? 1 : 0.55 }}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, color: T.text }}>{a.plaka}</td>
                    <td style={{ color: T.text }}>
                      <div>{a.kullanici_adi_soyadi ?? <span style={{ color: T.textSoft }}>—</span>}</div>
                      {(a.kullanici_telefon || a.kullanici_email) && (
                        <div style={{ fontSize: 11, color: T.textSoft, marginTop: 2 }}>
                          {a.kullanici_telefon}{a.kullanici_telefon && a.kullanici_email ? ' · ' : ''}{a.kullanici_email}
                        </div>
                      )}
                    </td>
                    <td style={{ color: T.textSoft }}>{a.departman ?? '—'}</td>
                    <td style={{ color: T.text }}>{[a.marka, a.model].filter(Boolean).join(' ') || '—'}</td>
                    <td style={{ color: T.textSoft }}>{a.renk ?? '—'}</td>
                    <td style={{ color: T.textSoft }}>{a.periyot_gun} gün</td>
                    <td style={{ color: T.textSoft, fontSize: 12 }}>
                      {a.son_yikama_tarihi
                        ? <>
                            {new Date(a.son_yikama_tarihi).toLocaleDateString('tr-TR')}
                            {gecikme !== null && gecikme > 0 && <span style={{ marginLeft: 6, color: T.red, fontWeight: 700 }}>+{gecikme}g geç</span>}
                          </>
                        : <span style={{ color: T.amber }}>Hiç yıkanmamış</span>}
                    </td>
                    <td>
                      {a.aktif
                        ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: T.greenLight, color: T.green }}>AKTİF</span>
                        : <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#f1f5f9', color: T.textSoft }}>PASİF</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button onClick={() => openEdit(a)} title="Düzenle"
                        style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: T.text }}>
                        <Pencil size={14} />
                      </button>
                      {a.aktif && (
                        <button onClick={() => sil(a)} title="Pasif yap"
                          style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: T.red }}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
      </div>

      {/* Ekle/Düzenle modal */}
      {modalOpen && (
        <div onClick={() => !kaydetLoading && setModalOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="verde-card" style={{ width: 'min(520px, 96vw)', padding: 20 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 16 }}>
              {editing ? 'Aracı Düzenle' : 'Yeni Araç Ekle'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 12, color: T.red, fontWeight: 600 }}>Plaka *</label>
                <input className="verde-input" value={form.plaka} onChange={e => setForm({ ...form, plaka: e.target.value.toUpperCase() })} style={{ width: '100%', marginTop: 4, fontFamily: 'monospace', fontWeight: 700 }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 12, color: T.red, fontWeight: 600 }}>Kullanıcı Adı Soyadı *</label>
                <input className="verde-input" value={form.kullanici_adi_soyadi} onChange={e => setForm({ ...form, kullanici_adi_soyadi: e.target.value })} style={{ width: '100%', marginTop: 4 }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 12, color: T.red, fontWeight: 600 }}>Departman *</label>
                <input className="verde-input" value={form.departman} onChange={e => setForm({ ...form, departman: e.target.value })} style={{ width: '100%', marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: T.textSoft, fontWeight: 600 }}>Telefon</label>
                <input className="verde-input" value={form.kullanici_telefon} onChange={e => setForm({ ...form, kullanici_telefon: e.target.value })} style={{ width: '100%', marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: T.textSoft, fontWeight: 600 }}>E-posta</label>
                <input className="verde-input" type="email" value={form.kullanici_email} onChange={e => setForm({ ...form, kullanici_email: e.target.value })} style={{ width: '100%', marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: T.textSoft, fontWeight: 600 }}>Marka</label>
                <input className="verde-input" value={form.marka} onChange={e => setForm({ ...form, marka: e.target.value })} style={{ width: '100%', marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: T.textSoft, fontWeight: 600 }}>Model</label>
                <input className="verde-input" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} style={{ width: '100%', marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: T.textSoft, fontWeight: 600 }}>Renk</label>
                <input className="verde-input" value={form.renk} onChange={e => setForm({ ...form, renk: e.target.value })} style={{ width: '100%', marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: T.textSoft, fontWeight: 600 }}>Periyot (gün)</label>
                <input className="verde-input" type="number" min={1} value={form.periyot_gun} onChange={e => setForm({ ...form, periyot_gun: Number(e.target.value) || 7 })} style={{ width: '100%', marginTop: 4 }} />
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 12, color: T.textSoft, fontWeight: 600 }}>Notlar</label>
                <textarea className="verde-input" value={form.notlar} onChange={e => setForm({ ...form, notlar: e.target.value })} style={{ width: '100%', marginTop: 4, minHeight: 60 }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setModalOpen(false)} disabled={kaydetLoading}
                style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                İptal
              </button>
              <button onClick={kaydet} disabled={kaydetLoading}
                style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: T.text, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {kaydetLoading ? 'Kaydediliyor…' : (editing ? 'Güncelle' : 'Ekle')}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
