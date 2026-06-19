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
  yikama_gunleri: number[]
  varsayilan_lokasyon_id: string | null
  yikama_frekans_tip: 'HAFTALIK' | 'BIHAFTA' | 'AYLIK' | null
  yikama_frekans_aralik: number | null
  yikama_referans_tarih: string | null
  son_yikama_tarihi: string | null
  aktif: boolean
  notlar: string | null
  kullanici_adi_soyadi: string | null
  kullanici_telefon: string | null
  kullanici_email: string | null
  olusturma_tarihi: string
  guncelleme_tarihi: string
}

type LokasyonOpt = { id: string; tanim: string }

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  grayLight: '#f8fafc',
}

const BOS_FORM = {
  plaka: '', marka: '', model: '', renk: '', departman: '', periyot_gun: 7,
  yikama_gunleri: [] as number[], notlar: '',
  kullanici_adi_soyadi: '', kullanici_telefon: '', kullanici_email: '',
  varsayilan_lokasyon_id: '' as string,
  yikama_frekans_tip: 'HAFTALIK' as 'HAFTALIK' | 'BIHAFTA' | 'AYLIK',
  yikama_frekans_aralik: 1 as number,
  yikama_referans_tarih: '' as string,
}

const GUN_KISA = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const GUN_UZUN = ['', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

export default function AraclarClient({ firmaId, projeId }: { firmaId: string; projeId: string | null }) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [araclar, setAraclar] = useState<Arac[]>([])
  const [istasyonlar, setIstasyonlar] = useState<LokasyonOpt[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [q, setQ] = useState('')
  const [filterDepartman, setFilterDepartman] = useState('')
  const [filterAktif, setFilterAktif] = useState<'all' | 'aktif' | 'pasif'>('aktif')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Arac | null>(null)
  const [form, setForm] = useState(BOS_FORM)
  const [kaydetLoading, setKaydetLoading] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [importPreview, setImportPreview] = useState<{
    eklenecek: number
    guncellenecek: number
    dokunulmayan: number
    silinecek: number
    ornek?: { eklenecek: string[]; guncellenecek?: string[]; silinecek: string[] }
    satirlar: any[]
  } | null>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importHata, setImportHata] = useState<{
    baslik: string
    aciklama: string
    hatali_satirlar?: { satir: number; plaka: string; eksik: string[] }[]
    toplam_hatali?: number
  } | null>(null)

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

  // Yıkama istasyonları (alt lokasyonlar) — Araç formundaki varsayılan istasyon dropdown'u
  useEffect(() => {
    if (!firmaId) return
    fetch(`/api/oto-yikama/lokasyonlar?firma_id=${firmaId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (!j.ok) return
        // Sadece alt istasyonlar (parent_id dolu)
        const list = (j.data ?? [])
          .filter((l: any) => l.parent_id != null && l.aktif !== false)
          .map((l: any) => ({ id: l.id as string, tanim: l.tanim as string }))
        setIstasyonlar(list)
      })
      .catch(() => {})
  }, [firmaId])

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
      yikama_gunleri: Array.isArray(a.yikama_gunleri) ? [...a.yikama_gunleri].sort((x, y) => x - y) : [],
      notlar: a.notlar ?? '',
      kullanici_adi_soyadi: a.kullanici_adi_soyadi ?? '',
      kullanici_telefon: a.kullanici_telefon ?? '',
      kullanici_email: a.kullanici_email ?? '',
      varsayilan_lokasyon_id: a.varsayilan_lokasyon_id ?? '',
      yikama_frekans_tip: a.yikama_frekans_tip ?? 'HAFTALIK',
      yikama_frekans_aralik: a.yikama_frekans_aralik ?? 1,
      yikama_referans_tarih: a.yikama_referans_tarih ?? '',
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

    // ── SHEET 1: TALİMATLAR ──────────────────────────────────
    const wsHelp = wb.addWorksheet('TALİMATLAR')
    wsHelp.columns = [
      { header: 'SÜTUN', key: 'sutun', width: 26 },
      { header: 'ZORUNLU', key: 'zorunlu', width: 12 },
      { header: 'AÇIKLAMA', key: 'aciklama', width: 70 },
      { header: 'ÖRNEK', key: 'ornek', width: 22 },
    ]
    wsHelp.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    wsHelp.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } }
    wsHelp.getRow(1).alignment = { vertical: 'middle', horizontal: 'left' }

    const helpRows: { sutun: string; zorunlu: string; aciklama: string; ornek: string }[] = [
      { sutun: 'plaka',                  zorunlu: 'EVET', aciklama: 'Aracın plakası. Boşluk olmadan, BÜYÜK harf. Sistem otomatik normalize eder.', ornek: '06ABC123' },
      { sutun: 'kullanici_adi_soyadi',   zorunlu: 'EVET', aciklama: 'Aracı kullanan kişinin adı soyadı.', ornek: 'Ahmet Yılmaz' },
      { sutun: 'departman',              zorunlu: 'EVET', aciklama: 'Aracın departmanı (POOL, YÖNETİCİ, Üretim Hattı 3 vb.). Sistemde gruplama için kullanılır.', ornek: 'POOL' },
      { sutun: 'marka',                  zorunlu: 'hayır', aciklama: 'Aracın markası (TOYOTA, FORD, OPEL vb.). Boş bırakılabilir.', ornek: 'FORD' },
      { sutun: 'model',                  zorunlu: 'hayır', aciklama: 'Aracın modeli (Corolla, Focus, Astra vb.). Boş bırakılabilir.', ornek: 'Focus' },
      { sutun: 'renk',                   zorunlu: 'hayır', aciklama: 'Aracın rengi (Beyaz, Gri, Siyah vb.). Boş bırakılabilir.', ornek: 'Gri' },
      { sutun: 'yikama_gunleri',         zorunlu: 'HAFTALIK/BIHAFTA için EVET', aciklama: 'Hangi günler yıkanacak. 1=Pzt, 2=Sal, 3=Çar, 4=Per, 5=Cum, 6=Cmt, 7=Paz. Virgülle ayır.', ornek: '1,3,5' },
      { sutun: 'yikama_frekans_tip',     zorunlu: 'hayır (default: HAFTALIK)', aciklama: 'HAFTALIK = her hafta yıkama_gunleri\'nde. BIHAFTA = N haftada bir, yıkama_gunleri\'nde. AYLIK = ayda bir, referans tarihin günü.', ornek: 'HAFTALIK' },
      { sutun: 'yikama_frekans_aralik',  zorunlu: 'BIHAFTA için EVET (default 1)', aciklama: 'BIHAFTA tipinde "kaç haftada bir" sayısı. 2 = her 2 haftada bir, 3 = her 3 haftada bir.', ornek: '2' },
      { sutun: 'yikama_referans_tarih',  zorunlu: 'BIHAFTA/AYLIK için EVET', aciklama: 'BIHAFTA: modulo başlangıç tarihi (bu tarihten sonraki her N haftada). AYLIK: bu tarihin gün sayısı her ay tetikler. Format: YYYY-MM-DD.', ornek: '2026-06-15' },
      { sutun: 'varsayilan_istasyon',    zorunlu: 'EVET (otomatik üretim için)', aciklama: 'Yıkamanın yapılacağı istasyonun TANIMI (alt lokasyon adı). Sistemde Yıkama İstasyonları sayfasındaki tanımla birebir aynı olmalı.', ornek: 'İSTASYON - 1' },
      { sutun: 'kullanici_telefon',      zorunlu: 'hayır', aciklama: 'Kullanıcının telefon numarası. Boş bırakılabilir.', ornek: '5551234567' },
      { sutun: 'kullanici_email',        zorunlu: 'hayır', aciklama: 'Kullanıcının e-posta adresi. Boş bırakılabilir.', ornek: 'ahmet@firma.com' },
    ]
    for (const r of helpRows) wsHelp.addRow(r)
    // Zorunlu sütun satırlarını kırmızımsı vurgula
    helpRows.forEach((r, i) => {
      const rowIdx = i + 2
      if (/EVET/i.test(r.zorunlu)) {
        wsHelp.getRow(rowIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } }
      }
      wsHelp.getCell(`B${rowIdx}`).font = { bold: true, color: { argb: /EVET/i.test(r.zorunlu) ? 'FF991B1B' : 'FF64748B' } }
    })

    // Frekans tipi tablosu ek bölüm
    wsHelp.addRow([])
    wsHelp.addRow([])
    const ft1 = wsHelp.addRow(['FREKANS TİPİ', '', 'AÇIKLAMA', ''])
    ft1.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ft1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } }
    wsHelp.addRow(['HAFTALIK', '', 'yikama_gunleri listesinin her hafta tekrarlanması. Referans tarih gerekmez.', ''])
    wsHelp.addRow(['BIHAFTA',  '', 'yikama_gunleri + yikama_frekans_aralik (örn 2). Referans tarihten itibaren her N haftada bir tetiklenir.', ''])
    wsHelp.addRow(['AYLIK',    '', 'Ayda bir kez referans tarihin gününde tetiklenir (yikama_gunleri kullanılmaz).', ''])

    // Gün numarası tablosu
    wsHelp.addRow([])
    wsHelp.addRow([])
    const gn1 = wsHelp.addRow(['YIKAMA GÜNLERİ TABLOSU', '', '', ''])
    gn1.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    gn1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16A34A' } }
    wsHelp.addRow(['1 = Pazartesi', '2 = Salı', '3 = Çarşamba', '4 = Perşembe'])
    wsHelp.addRow(['5 = Cuma',      '6 = Cumartesi', '7 = Pazar', ''])

    // Sync davranışı uyarısı
    wsHelp.addRow([])
    wsHelp.addRow([])
    const sb = wsHelp.addRow(['⚠️ IMPORT DAVRANIŞI', '', '', ''])
    sb.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sb.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } }
    wsHelp.mergeCells(`A${sb.number}:D${sb.number}`)
    const sb2 = wsHelp.addRow(['Bu Excel TÜM araç listesinin geçerli halidir. Import sonrası:'])
    sb2.font = { italic: true }; wsHelp.mergeCells(`A${sb2.number}:D${sb2.number}`)
    wsHelp.addRow(['• Excel\'de OLMAYAN aktif araçlar PASİFLEŞTİRİLİR (görev kayıtları korunur — silinmez).'])
    wsHelp.addRow(['• Excel\'de OLAN ama sistemde olmayan plakalar EKLENİR.'])
    wsHelp.addRow(['• Excel\'de OLAN ve sistemde de OLAN plakalarda fark varsa GÜNCELLENİR (yıkama kuralı yenilenir).'])
    wsHelp.addRow(['• Excel\'de OLAN ama sistemde PASİF olan plakalar tekrar AKTİVE EDİLİR.'])
    wsHelp.addRow(['• Pasifleşen araçların geçmiş görev kayıtları DB\'de tutulmaya devam eder.'])
    for (let i = sb2.number + 1; i <= sb2.number + 5; i++) wsHelp.mergeCells(`A${i}:D${i}`)

    // ── SHEET 2: Araç Listesi (ana data) ─────────────────────
    const ws = wb.addWorksheet('Araç Listesi')
    // Zorunlu sütunlar: plaka, kullanici_adi_soyadi, departman
    ws.columns = [
      { header: 'plaka',                  key: 'plaka',                  width: 14 },
      { header: 'kullanici_adi_soyadi',   key: 'kullanici_adi_soyadi',   width: 24 },
      { header: 'departman',              key: 'departman',              width: 22 },
      { header: 'marka',                  key: 'marka',                  width: 14 },
      { header: 'model',                  key: 'model',                  width: 14 },
      { header: 'renk',                   key: 'renk',                   width: 12 },
      { header: 'yikama_gunleri',         key: 'yikama_gunleri',         width: 16 },
      { header: 'yikama_frekans_tip',     key: 'yikama_frekans_tip',     width: 18 },
      { header: 'yikama_frekans_aralik',  key: 'yikama_frekans_aralik',  width: 20 },
      { header: 'yikama_referans_tarih',  key: 'yikama_referans_tarih',  width: 20 },
      { header: 'varsayilan_istasyon',    key: 'varsayilan_istasyon',    width: 22 },
      { header: 'kullanici_telefon',      key: 'kullanici_telefon',      width: 18 },
      { header: 'kullanici_email',        key: 'kullanici_email',        width: 24 },
    ]
    ws.addRow({ plaka: '06ABC123', kullanici_adi_soyadi: 'Ahmet Yılmaz', departman: 'Üretim Hattı 3', marka: 'TOYOTA', model: 'Corolla', renk: 'Beyaz', yikama_gunleri: '1,3',  yikama_frekans_tip: 'HAFTALIK', yikama_frekans_aralik: 1, yikama_referans_tarih: '', varsayilan_istasyon: 'İSTASYON - 1', kullanici_telefon: '5551234567', kullanici_email: 'ahmet@firma.com' })
    ws.addRow({ plaka: '34XYZ789', kullanici_adi_soyadi: 'Mehmet Demir',  departman: 'Yönetim',         marka: 'FORD',   model: 'Focus',   renk: 'Gri',   yikama_gunleri: '2,4',  yikama_frekans_tip: 'BIHAFTA',  yikama_frekans_aralik: 2, yikama_referans_tarih: '2026-06-23', varsayilan_istasyon: 'İSTASYON - 2', kullanici_telefon: '',          kullanici_email: '' })
    ws.addRow({ plaka: '16BGB710', kullanici_adi_soyadi: 'Ayşe Kaya',    departman: 'POOL',             marka: 'OPEL',   model: 'Astra',   renk: 'Siyah', yikama_gunleri: '',     yikama_frekans_tip: 'AYLIK',    yikama_frekans_aralik: 1, yikama_referans_tarih: '2026-06-15', varsayilan_istasyon: 'İSTASYON - 1', kullanici_telefon: '',          kullanici_email: '' })
    // Başlık satırı: bold + zorunlu sütunlar kırmızı vurgulu
    const header = ws.getRow(1)
    header.font = { bold: true }
    // Zorunlu sütunlar: plaka (A), kullanici_adi_soyadi (B), departman (C)
    ;['A1', 'B1', 'C1'].forEach(addr => {
      const c = ws.getCell(addr)
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
      c.font = { bold: true, color: { argb: 'FF991B1B' } }
    })
    // Not satırı ekle (5. satır — örnek satırlardan sonra)
    ws.insertRow(5, { plaka: '* Zorunlu: plaka, kullanici_adi_soyadi, departman   |   yikama_gunleri: 1=Pzt..7=Paz virgülle (örn "1,3")   |   yikama_frekans_tip: HAFTALIK/BIHAFTA/AYLIK (default HAFTALIK)   |   BIHAFTA/AYLIK için yikama_referans_tarih (YYYY-MM-DD) zorunlu   |   varsayilan_istasyon: alt istasyon TANIMI (yıkama kuralı için)' })
    ws.getRow(5).font = { italic: true, color: { argb: 'FF991B1B' } }
    ws.mergeCells('A5:M5')
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
      // Önce "Araç Listesi" sheet'ini ara, yoksa "TALİMATLAR" değilse ilk sheet
      let ws = wb.getWorksheet('Araç Listesi')
      if (!ws) {
        ws = wb.worksheets.find(s => s.name !== 'TALİMATLAR') ?? wb.worksheets[0]
      }
      if (!ws) throw new Error('Excel\'de okunabilir sheet bulunamadı.')
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
      const idxGun = headers.indexOf('yikama_gunleri')
      const idxFrekTip = headers.indexOf('yikama_frekans_tip')
      const idxFrekArl = headers.indexOf('yikama_frekans_aralik')
      const idxRefTar = headers.indexOf('yikama_referans_tarih')
      const idxIstasyon = headers.indexOf('varsayilan_istasyon')
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
        // yikama_gunleri: "1,3" veya "1, 3" veya "1;3" gibi → [1,3], sınır 1-7, distinct
        const gunStr = idxGun >= 0 ? cellStr(row.getCell(idxGun + 1).value) : ''
        const yikamaGunleri = gunStr
          ? [...new Set(gunStr.split(/[,;\s]+/).map(s => Number(s)).filter(n => Number.isInteger(n) && n >= 1 && n <= 7))].sort((a, b) => a - b)
          : []
        // Tarih hücresi: Excel'den Date objesi veya string gelebilir
        const refTarRaw = idxRefTar >= 0 ? row.getCell(idxRefTar + 1).value : null
        let refTar: string | null = null
        if (refTarRaw instanceof Date) {
          refTar = refTarRaw.toISOString().slice(0, 10)
        } else if (refTarRaw) {
          const s = cellStr(refTarRaw)
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) refTar = s
        }
        satirlar.push({
          plaka,
          kullanici_adi_soyadi: kulAd || null,
          departman: dep || null,
          marka: idxMarka >= 0 ? cellStr(row.getCell(idxMarka + 1).value) || null : null,
          model: idxModel >= 0 ? cellStr(row.getCell(idxModel + 1).value) || null : null,
          renk:  idxRenk >= 0 ? cellStr(row.getCell(idxRenk + 1).value) || null : null,
          periyot_gun: idxPer >= 0 ? Number(row.getCell(idxPer + 1).value) || 7 : 7,
          yikama_gunleri: yikamaGunleri,
          yikama_frekans_tip: idxFrekTip >= 0 ? cellStr(row.getCell(idxFrekTip + 1).value).toUpperCase() || null : null,
          yikama_frekans_aralik: idxFrekArl >= 0 ? Number(row.getCell(idxFrekArl + 1).value) || null : null,
          yikama_referans_tarih: refTar,
          varsayilan_istasyon: idxIstasyon >= 0 ? cellStr(row.getCell(idxIstasyon + 1).value) || null : null,
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
        if (Array.isArray(j.hatali_satirlar) && j.hatali_satirlar.length > 0) {
          // Detaylı doldurma hatası — modal'da satır satır göster
          setImportHata({
            baslik: 'Excel\'de Hatalı Doldurma',
            aciklama: j.error ?? 'Bazı satırlarda zorunlu alanlar eksik veya formatı yanlış.',
            hatali_satirlar: j.hatali_satirlar,
            toplam_hatali: j.toplam_hatali ?? j.hatali_satirlar.length,
          })
          return
        }
        // Genel hata (modül kapalı, yetki vs.)
        setImportHata({
          baslik: 'Excel İmport Edilemedi',
          aciklama: j.error ?? 'Bilinmeyen hata.',
        })
        return
      }
      setImportPreview({ ...j, satirlar })
    } catch (err: any) {
      setImportHata({
        baslik: 'Excel Okunamadı',
        aciklama: err.message ?? 'Excel dosyası okunurken hata oluştu. Şablonu yeniden indirip aynı format ile doldurun.',
      })
    } finally {
      setImportLoading(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  async function importOnayla() {
    if (!importPreview) return
    const ok = await confirm({
      title: '⚠️ Araç Listesi Senkronizasyonu',
      message: `Bu işlem:
• ${importPreview.eklenecek} yeni araç ekleyecek
• ${importPreview.guncellenecek} mevcut aracı güncelleyecek (yıkama kuralı/lokasyon vs. değişmişse)
• ${importPreview.dokunulmayan} araca dokunmayacak (Excel ile birebir aynı)
• ${importPreview.silinecek} aracı PASİF yapacak (Excel'de olmayan; geçmiş görev kayıtları korunur)

Devam etmek istiyor musunuz?`,
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
        message: `+${j.eklenen} eklendi, ~${j.guncellenen} güncellendi, ${j.dokunulmayan} korundu, -${j.silinen} pasifleştirildi`,
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 10 }}>
            <div style={{ padding: 10, background: '#fff', borderRadius: 8, border: `1px solid ${T.green}40` }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: T.green }}>+{importPreview.eklenecek}</div>
              <div style={{ fontSize: 11, color: T.textSoft }}>Yeni eklenecek</div>
              {importPreview.ornek?.eklenecek?.length ? (
                <div style={{ fontSize: 11, color: T.textSoft, marginTop: 4, fontFamily: 'monospace' }}>{importPreview.ornek.eklenecek.join(', ')}{importPreview.eklenecek > 5 ? '…' : ''}</div>
              ) : null}
            </div>
            <div style={{ padding: 10, background: '#fff', borderRadius: 8, border: `1px solid ${T.blue}40` }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: T.blue }}>~{importPreview.guncellenecek}</div>
              <div style={{ fontSize: 11, color: T.textSoft }}>Güncellenecek</div>
              {importPreview.ornek?.guncellenecek?.length ? (
                <div style={{ fontSize: 11, color: T.textSoft, marginTop: 4, fontFamily: 'monospace' }}>{importPreview.ornek.guncellenecek.join(', ')}{importPreview.guncellenecek > 5 ? '…' : ''}</div>
              ) : null}
            </div>
            <div style={{ padding: 10, background: '#fff', borderRadius: 8, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: T.textSoft }}>{importPreview.dokunulmayan}</div>
              <div style={{ fontSize: 11, color: T.textSoft }}>Birebir aynı, korunur</div>
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
              <th>Yıkama Günü</th>
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
                    <td style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 16, color: T.text }}>{a.plaka}</td>
                    <td style={{ color: T.text, fontSize: 14 }}>
                      <div>{a.kullanici_adi_soyadi ?? <span style={{ color: T.textSoft }}>—</span>}</div>
                      {(a.kullanici_telefon || a.kullanici_email) && (
                        <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2 }}>
                          {a.kullanici_telefon}{a.kullanici_telefon && a.kullanici_email ? ' · ' : ''}{a.kullanici_email}
                        </div>
                      )}
                    </td>
                    <td style={{ color: T.textSoft, fontSize: 14 }}>{a.departman ?? '—'}</td>
                    <td style={{ color: T.text, fontSize: 14 }}>{[a.marka, a.model].filter(Boolean).join(' ') || '—'}</td>
                    <td style={{ color: T.textSoft, fontSize: 14 }}>{a.renk ?? '—'}</td>
                    <td style={{ color: T.textSoft, fontSize: 14 }}>
                      {Array.isArray(a.yikama_gunleri) && a.yikama_gunleri.length > 0
                        ? [...a.yikama_gunleri].sort((x, y) => x - y).map(g => GUN_KISA[g] ?? g).join(', ')
                        : <span style={{ color: '#cbd5e1' }}>—</span>}
                    </td>
                    <td style={{ color: T.textSoft, fontSize: 13 }}>
                      {a.son_yikama_tarihi
                        ? <>
                            {new Date(a.son_yikama_tarihi).toLocaleDateString('tr-TR')}
                            {gecikme !== null && gecikme > 0 && <span style={{ marginLeft: 6, color: T.red, fontWeight: 700 }}>+{gecikme}g geç</span>}
                          </>
                        : <span style={{ color: T.amber }}>Hiç yıkanmamış</span>}
                    </td>
                    <td>
                      {a.aktif
                        ? <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: T.greenLight, color: T.green }}>AKTİF</span>
                        : <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: '#f1f5f9', color: T.textSoft }}>PASİF</span>}
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
      {/* IMPORT HATA MODAL'I — detaylı satır bazlı hata listesi */}
      {importHata && (
        <div
          onClick={() => setImportHata(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
            padding: 20,
          }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 12, maxWidth: 720, width: '100%',
              maxHeight: '85vh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(15,23,42,0.35)', overflow: 'hidden',
            }}>
            {/* Başlık */}
            <div style={{
              padding: '16px 20px', borderBottom: `1px solid ${T.border}`,
              display: 'flex', alignItems: 'center', gap: 12,
              background: T.redLight,
            }}>
              <AlertTriangle size={22} color={T.red} />
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.red }}>{importHata.baslik}</div>
                <div style={{ fontSize: 13, color: '#7f1d1d', marginTop: 2 }}>{importHata.aciklama}</div>
              </div>
            </div>

            {/* Hatalı satırlar tablosu */}
            {importHata.hatali_satirlar && importHata.hatali_satirlar.length > 0 && (
              <div style={{ padding: '12px 20px', overflowY: 'auto', flex: 1 }}>
                <div style={{ fontSize: 12, color: T.textSoft, marginBottom: 8 }}>
                  <strong style={{ color: T.text }}>{importHata.toplam_hatali}</strong> satırda hata var
                  {importHata.toplam_hatali! > importHata.hatali_satirlar.length && (
                    <span> — ilk {importHata.hatali_satirlar.length} tanesi gösteriliyor</span>
                  )}
                  :
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: T.grayLight }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: T.text, border: `1px solid ${T.border}`, width: 70 }}>Satır</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: T.text, border: `1px solid ${T.border}`, width: 130 }}>Plaka</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: T.text, border: `1px solid ${T.border}` }}>Eksik / Hatalı Alanlar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importHata.hatali_satirlar.map((h, i) => (
                      <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ padding: '6px 10px', border: `1px solid ${T.border}`, fontFamily: 'monospace', fontWeight: 700 }}>#{h.satir}</td>
                        <td style={{ padding: '6px 10px', border: `1px solid ${T.border}`, fontFamily: 'monospace', fontWeight: 700, color: T.text }}>{h.plaka}</td>
                        <td style={{ padding: '6px 10px', border: `1px solid ${T.border}`, color: T.red }}>
                          {h.eksik.map((e, idx) => (
                            <span key={idx} style={{
                              display: 'inline-block', marginRight: 6, marginBottom: 3,
                              padding: '2px 8px', borderRadius: 4,
                              background: T.redLight, color: T.red, fontSize: 12, fontWeight: 600,
                            }}>{e}</span>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{
                  marginTop: 12, padding: 10, background: '#fffbeb', border: '1px solid #fde68a',
                  borderRadius: 6, fontSize: 12, color: '#78350f', lineHeight: 1.5,
                }}>
                  <strong>İpucu:</strong> Şablonu indirin (sağ üstte "Şablon İndir") — içindeki <strong>TALİMATLAR</strong> sheet'inde her sütunun nasıl doldurulacağı, zorunlu alanlar ve örnekler bulunur.
                </div>
              </div>
            )}

            {/* Tek buton: Anladım */}
            <div style={{
              padding: '12px 20px', borderTop: `1px solid ${T.border}`,
              display: 'flex', justifyContent: 'flex-end',
            }}>
              <button onClick={() => setImportHata(null)}
                style={{
                  padding: '8px 22px', borderRadius: 7, border: 'none',
                  background: T.text, color: '#fff', cursor: 'pointer',
                  fontSize: 13, fontWeight: 700,
                }}>
                Anladım
              </button>
            </div>
          </div>
        </div>
      )}

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
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 12, color: T.textSoft, fontWeight: 600 }}>
                  Yıkama Günleri <span style={{ color: T.textSoft, fontWeight: 400 }}>(haftada 1-3 gün önerilir)</span>
                </label>
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  {[1, 2, 3, 4, 5, 6, 7].map(g => {
                    const aktif = form.yikama_gunleri.includes(g)
                    return (
                      <button key={g} type="button"
                        onClick={() => setForm(f => ({
                          ...f,
                          yikama_gunleri: aktif
                            ? f.yikama_gunleri.filter(x => x !== g)
                            : [...f.yikama_gunleri, g].sort((a, b) => a - b),
                        }))}
                        style={{
                          flex: 1, minWidth: 50, padding: '8px 4px', borderRadius: 6,
                          border: `1px solid ${aktif ? T.blue : T.border}`,
                          background: aktif ? T.blue : '#fff',
                          color: aktif ? '#fff' : T.text,
                          cursor: 'pointer', fontSize: 12, fontWeight: 700,
                          transition: 'all 0.15s',
                        }}>
                        {GUN_KISA[g]}
                      </button>
                    )
                  })}
                </div>
                {form.yikama_gunleri.length === 0 && form.yikama_frekans_tip !== 'AYLIK' && (
                  <div style={{ fontSize: 11, color: T.textSoft, marginTop: 4, fontStyle: 'italic' }}>
                    Gün seçilmezse araç için otomatik görev oluşturulmaz, sadece manuel oluşturulabilir.
                  </div>
                )}
              </div>

              {/* Yıkama kuralı: frekans tipi + aralık + referans tarih */}
              <div style={{ gridColumn: 'span 2', padding: '12px 14px', background: T.grayLight, border: `1px solid ${T.border}`, borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
                  📅 Yıkama Kuralı (otomatik görev üretimi)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {(['HAFTALIK', 'BIHAFTA', 'AYLIK'] as const).map(tip => {
                    const aktif = form.yikama_frekans_tip === tip
                    return (
                      <button key={tip} type="button"
                        onClick={() => setForm(f => ({ ...f, yikama_frekans_tip: tip }))}
                        style={{
                          padding: '8px 6px', borderRadius: 6,
                          border: `1.5px solid ${aktif ? T.blue : T.border}`,
                          background: aktif ? T.blueLight : '#fff',
                          color: aktif ? T.blue : T.text,
                          cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        }}>
                        {tip === 'HAFTALIK' ? 'Her Hafta' : tip === 'BIHAFTA' ? 'N Haftada Bir' : 'Ayda Bir'}
                      </button>
                    )
                  })}
                </div>
                {form.yikama_frekans_tip === 'BIHAFTA' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, color: T.textSoft, fontWeight: 600 }}>Hafta aralığı</label>
                      <input type="number" min={2} max={12}
                        className="verde-input"
                        value={form.yikama_frekans_aralik}
                        onChange={e => setForm({ ...form, yikama_frekans_aralik: Math.max(2, parseInt(e.target.value || '2', 10)) })}
                        style={{ width: '100%', marginTop: 4 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: T.textSoft, fontWeight: 600 }}>Referans tarih (modulo başlangıcı)</label>
                      <input type="date"
                        className="verde-input"
                        value={form.yikama_referans_tarih}
                        onChange={e => setForm({ ...form, yikama_referans_tarih: e.target.value })}
                        style={{ width: '100%', marginTop: 4 }} />
                    </div>
                  </div>
                )}
                {form.yikama_frekans_tip === 'AYLIK' && (
                  <div>
                    <label style={{ fontSize: 11, color: T.textSoft, fontWeight: 600 }}>Referans tarih (ayın bu gününde yıkanır)</label>
                    <input type="date"
                      className="verde-input"
                      value={form.yikama_referans_tarih}
                      onChange={e => setForm({ ...form, yikama_referans_tarih: e.target.value })}
                      style={{ width: '100%', marginTop: 4 }} />
                    <div style={{ fontSize: 10.5, color: T.textSoft, marginTop: 4, fontStyle: 'italic' }}>
                      Yukarıdaki "Yıkama Günleri" aylık tipte kullanılmaz, sadece referans tarihin günü tetikler.
                    </div>
                  </div>
                )}
              </div>

              {/* Varsayılan istasyon */}
              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ fontSize: 12, color: T.textSoft, fontWeight: 600 }}>
                  Varsayılan İstasyon <span style={{ color: T.red }}>(otomatik üretim için gerekli)</span>
                </label>
                <select className="verde-input"
                  value={form.varsayilan_lokasyon_id}
                  onChange={e => setForm({ ...form, varsayilan_lokasyon_id: e.target.value })}
                  style={{ width: '100%', marginTop: 4 }}>
                  <option value="">— Atanmadı (otomatik görev üretilmez) —</option>
                  {istasyonlar.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                </select>
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
