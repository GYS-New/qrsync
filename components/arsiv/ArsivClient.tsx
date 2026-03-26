'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDateTime, CANLI_DURUM_LABEL } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'
import {
  Trash2, RotateCcw, Download, FileSpreadsheet, Printer,
  RefreshCw, Archive, Users, Star, ClipboardList,
} from 'lucide-react'

const DURUM_RENK: Record<string, string> = {
  TAMAMLANDI: 'status-tamamlandi', ZAMANINDA_YAPILAMAYAN: 'status-zamaninda',
  ZAMANI_GECMIS: 'status-zamaninda', IPTAL: 'status-iptal', SILINDI: 'status-silindi',
  KAPATILDI: 'status-kapatildi', ACIK: 'status-islemde',
  BEKLEMEDE: 'status-beklemede', HAZIR: 'status-hazir',
}

const ARSIV_NEDEN_LABEL: Record<string, string> = {
  gun_sonu: 'Gün Sonu', manuel: 'Manuel', lokasyon_silindi: 'Lokasyon Silindi',
}

const YILDIZ_ETIKET = ['', 'Çok Kötü', 'Kötü', 'Orta', 'İyi', 'Mükemmel']

type Sekme = 'frekansiyel' | 'personel' | 'musteri' | 'spesifik'

const SEKMELER: { id: Sekme; label: string; icon: React.ReactNode }[] = [
  { id: 'frekansiyel', label: 'Frekansiyel Görevler',      icon: <Archive size={14} /> },
  { id: 'personel',   label: 'Personel Takibi',            icon: <Users size={14} /> },
  { id: 'musteri',    label: 'Müşteri Değerlendirmeleri',  icon: <Star size={14} /> },
  { id: 'spesifik',  label: 'Spesifik Görevler',           icon: <ClipboardList size={14} /> },
]

function csvIndir(baslik: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${baslik}-arsiv-${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}

function saat(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

function sureFmt(giris: string | null, cikis: string | null) {
  if (!giris) return '—'
  const dk = Math.floor((new Date(cikis ?? Date.now()).getTime() - new Date(giris).getTime()) / 60000)
  return `${Math.floor(dk/60)}s ${dk%60}dk`
}

export default function ArsivClient({
  base, initialArsiv, tenantFirmaId,
}: {
  base: string
  initialArsiv: any[]
  tenantFirmaId?: string | null
}) {
  const supabase    = createClient()
  const { toast }   = useToast()
  const { confirm } = useConfirm()
  const { firmaId: saFirmaId } = useFirma()
  const { aktifProje, loading: projeLoading } = useProje()

  const firmaId = base.startsWith('/ta') ? (tenantFirmaId ?? null) : saFirmaId
  const projeId = aktifProje?.id ?? ''
  const isTA    = base.startsWith('/ta')

  const [aktifSekme, setAktifSekme] = useState<Sekme>('frekansiyel')

  // ── Frekansiyel state ────────────────────────────────────────────────────
  const [frekData,    setFrekData]    = useState<any[]>(initialArsiv)
  const [frekLoading, setFrekLoading] = useState(false)
  const [frekQ,       setFrekQ]       = useState('')
  const [frekDurum,   setFrekDurum]   = useState('')
  const [frekNeden,   setFrekNeden]   = useState('')
  const [frekFrom,    setFrekFrom]    = useState('')
  const [frekTo,      setFrekTo]      = useState('')

  // ── Personel state ───────────────────────────────────────────────────────
  const [personelData,    setPersonelData]    = useState<any[]>([])
  const [personelLoading, setPersonelLoading] = useState(false)
  const [personelQ,       setPersonelQ]       = useState('')
  const [personelFrom,    setPersonelFrom]    = useState('')
  const [personelTo,      setPersonelTo]      = useState('')

  // ── Müşteri state ────────────────────────────────────────────────────────
  const [musteriData,    setMusteriData]    = useState<any[]>([])
  const [musteriLoading, setMusteriLoading] = useState(false)
  const [musteriFrom,    setMusteriFrom]    = useState('')
  const [musteriTo,      setMusteriTo]      = useState('')
  const [musteriYildiz,  setMusteriYildiz]  = useState(0)

  // ── Spesifik state ───────────────────────────────────────────────────────
  const [spesifikData,    setSpesifikData]    = useState<any[]>([])
  const [spesifikLoading, setSpesifikLoading] = useState(false)
  const [spesifikQ,       setSpesifikQ]       = useState('')
  const [spesifikFrom,    setSpesifikFrom]    = useState('')
  const [spesifikTo,      setSpesifikTo]      = useState('')

  // ── Toplu sil modal ───────────────────────────────────────────────────────
  const [topluSilSekme,  setTopluSilSekme]  = useState<Sekme | null>(null)
  const [topluSilFrom,   setTopluSilFrom]   = useState('')
  const [topluSilTo,     setTopluSilTo]     = useState('')
  const [topluSilYukleniyor, setTopluSilYukleniyor] = useState(false)

  // ── Lokasyon hiyerarşisi ──────────────────────────────────────────────────
  const [lokasyonlarTum, setLokasyonlarTum] = useState<any[]>([])

  useEffect(() => {
    if (!firmaId) return
    supabase.from('lokasyonlar').select('id,tanim,parent_id').eq('firma_id', firmaId)
      .then(({ data }) => { if (data) setLokasyonlarTum(data) })
  }, [firmaId])

  const locMap = useMemo(() => {
    const m: Record<string, { tanim: string; parent_id: string | null }> = {}
    lokasyonlarTum.forEach(l => { m[l.id] = { tanim: l.tanim, parent_id: l.parent_id ?? null } })
    return m
  }, [lokasyonlarTum])

  const getLocPath = useCallback((lokasyonId: string | null | undefined): string => {
    if (!lokasyonId) return '—'
    const parts: string[] = []
    let cur: string | null = lokasyonId
    let guard = 0
    while (cur && guard < 8) {
      const node: { tanim: string; parent_id: string | null } | undefined = locMap[cur]
      if (!node) break
      parts.push(node.tanim)
      cur = node.parent_id
      guard++
    }
    return parts.reverse().join(' / ') || '—'
  }, [locMap])

  // ── Yükleme fonksiyonları ─────────────────────────────────────────────────

  const yukle_frekansiyel = useCallback(async () => {
    if (!firmaId) { setFrekData([]); return }
    if (isTA && (projeLoading || !projeId)) { setFrekData([]); return }
    setFrekLoading(true)
    try {
      const sel = `*, lokasyonlar(id,tanim), atanan:users!atanan_kullanici_id(isim_soyisim), olusturan:users!olusturan_id(isim_soyisim), tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim), iptalEden:users!iptal_eden_id(isim_soyisim), islemi_yapan:users!islemi_yapan_id(isim_soyisim), kural:gorev_kurallari!arsiv_kural_fkey(tanim)`
      let q = supabase.from('canli_gorevler_arsiv').select(sel)
        .eq('firma_id', firmaId).order('arsiv_tarihi', { ascending: false }).limit(1000)
      if (projeId) q = (q as any).eq('proje_id', projeId)
      const { data, error } = await q
      if (error) throw error
      setFrekData((data as any) ?? [])
    } catch (e: any) { toast({ type: 'error', title: 'Yüklenemedi', message: e.message })
    } finally { setFrekLoading(false) }
  }, [firmaId, projeId, projeLoading, isTA])

  const yukle_personel = useCallback(async () => {
    if (!firmaId) { setPersonelData([]); return }
    setPersonelLoading(true)
    try {
      const p = new URLSearchParams({ firma_id: firmaId })
      if (projeId)     p.set('proje_id', projeId)
      if (personelFrom) p.set('baslangic', personelFrom)
      if (personelTo)   p.set('bitis', personelTo)
      const res  = await fetch(`/api/mesai/arsiv?${p}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setPersonelData(json.data ?? [])
    } catch (e: any) { toast({ type: 'error', title: 'Yüklenemedi', message: e.message })
    } finally { setPersonelLoading(false) }
  }, [firmaId, projeId, personelFrom, personelTo])

  const yukle_musteri = useCallback(async () => {
    if (!firmaId) { setMusteriData([]); return }
    setMusteriLoading(true)
    try {
      const p = new URLSearchParams({ firma_id: firmaId, arsivlendi: 'true' })
      if (projeId)     p.set('proje_id', projeId)
      if (musteriFrom) p.set('baslangic', musteriFrom)
      if (musteriTo)   p.set('bitis', musteriTo)
      const res  = await fetch(`/api/raporlar/musteri-degerlendirme?${p}`)
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)
      setMusteriData(json.data ?? [])
    } catch (e: any) { toast({ type: 'error', title: 'Yüklenemedi', message: e.message })
    } finally { setMusteriLoading(false) }
  }, [firmaId, projeId, musteriFrom, musteriTo])

  const yukle_spesifik = useCallback(async () => {
    if (!firmaId) { setSpesifikData([]); return }
    setSpesifikLoading(true)
    try {
      const sinir24s = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      let q2 = supabase
        .from('gorevler')
        .select(`id,tanim,durum,lokasyon_id,olusturma_tarihi,tamamlanma_tarihi,durum_degisim_tarihi,
          atanan:users!atanan_kullanici_id(isim_soyisim),
          olusturan:users!olusturan_id(isim_soyisim)`)
        .eq('firma_id', firmaId)
        .or(`durum.eq.IPTAL,and(durum.eq.TAMAMLANDI,tamamlanma_tarihi.lt.${sinir24s})`)
        .order('olusturma_tarihi', { ascending: false })
        .limit(1000)
      if (projeId) q2 = (q2 as any).eq('proje_id', projeId)
      const { data, error } = await q2 as any
      if (error) throw error
      setSpesifikData(data ?? [])
    } catch (e: any) { toast({ type: 'error', title: 'Yüklenemedi', message: e.message })
    } finally { setSpesifikLoading(false) }
  }, [firmaId, projeId])

  useEffect(() => {
    if (aktifSekme === 'frekansiyel') yukle_frekansiyel()
    if (aktifSekme === 'personel')   yukle_personel()
    if (aktifSekme === 'musteri')    yukle_musteri()
    if (aktifSekme === 'spesifik')   yukle_spesifik()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktifSekme, firmaId, projeId, projeLoading])

  // ── Aksiyon: Frekansiyel ─────────────────────────────────────────────────
  async function frekRestore(row: any) {
    const ok = await confirm({ title: 'Geri Yükle', message: `"${row.tanim}" arşivden geri yüklensin mi?`, confirmText: 'Geri Yükle' })
    if (!ok) return
    try {
      const { arsiv_tarihi, arsiv_nedeni, ...rest } = row
      const { error: insErr } = await supabase.from('canli_gorevler')
        .insert({ ...rest, durum: 'HAZIR', durum_degisim_tarihi: new Date().toISOString() })
      if (insErr) throw insErr
      await supabase.from('canli_gorevler_arsiv').delete().eq('id', row.id)
      setFrekData(p => p.filter(r => r.id !== row.id))
      toast({ type: 'success', title: 'Geri yüklendi', message: 'Görev aktif listeye alındı.' })
    } catch (e: any) { toast({ type: 'error', title: 'Hata', message: e.message }) }
  }

  async function frekSil(row: any) {
    const ok = await confirm({ title: 'Kalıcı Sil', message: `"${row.tanim}" kalıcı silinsin mi?`, confirmText: 'Kalıcı Sil', variant: 'danger' })
    if (!ok) return
    try {
      await supabase.from('canli_gorevler_arsiv').delete().eq('id', row.id)
      setFrekData(p => p.filter(r => r.id !== row.id))
      toast({ type: 'success', title: 'Silindi', message: 'Arşiv kaydı kalıcı olarak silindi.' })
    } catch (e: any) { toast({ type: 'error', title: 'Hata', message: e.message }) }
  }

  // ── Aksiyon: Müşteri ─────────────────────────────────────────────────────
  async function musteriCikar(row: any) {
    const ok = await confirm({ title: 'Arşivden Çıkar', message: 'Bu değerlendirme aktif listeye taşınsın mı?', confirmText: 'Arşivden Çıkar' })
    if (!ok) return
    try {
      const res = await fetch('/api/raporlar/musteri-degerlendirme', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, arsivlendi: false }),
      })
      if (!(await res.json()).ok) throw new Error('İşlem başarısız')
      setMusteriData(p => p.filter(r => r.id !== row.id))
      toast({ type: 'success', title: 'Arşivden çıkarıldı', message: 'Değerlendirme aktif listeye taşındı.' })
    } catch (e: any) { toast({ type: 'error', title: 'Hata', message: e.message }) }
  }

  async function musteriSil(row: any) {
    const ok = await confirm({ title: 'Kalıcı Sil', message: 'Bu değerlendirme kalıcı silinsin mi?', confirmText: 'Kalıcı Sil', variant: 'danger' })
    if (!ok) return
    try {
      const res = await fetch(`/api/raporlar/musteri-degerlendirme?id=${row.id}`, { method: 'DELETE' })
      if (!(await res.json()).ok) throw new Error('Silinemedi')
      setMusteriData(p => p.filter(r => r.id !== row.id))
      toast({ type: 'success', title: 'Silindi', message: 'Değerlendirme kalıcı olarak silindi.' })
    } catch (e: any) { toast({ type: 'error', title: 'Hata', message: e.message }) }
  }

  // ── Aksiyon: Spesifik ────────────────────────────────────────────────────
  async function spesifikRestore(row: any) {
    const ok = await confirm({ title: 'Geri Yükle', message: `"${row.tanim}" görevi tekrar aktif listeye alınsın mı?\nDurum "Açık" olarak güncellenecek.`, confirmText: 'Geri Yükle' })
    if (!ok) return
    try {
      const { error } = await supabase.from('gorevler')
        .update({ durum: 'ACIK', durum_degisim_tarihi: new Date().toISOString(), tamamlanma_tarihi: null, tamamlanma_suresi_saniye: null })
        .eq('id', row.id)
      if (error) throw error
      setSpesifikData(p => p.filter(r => r.id !== row.id))
      toast({ type: 'success', title: 'Geri yüklendi', message: 'Görev aktif listeye alındı.' })
    } catch (e: any) { toast({ type: 'error', title: 'Hata', message: e.message }) }
  }

  async function spesifikSil(row: any) {
    const ok = await confirm({ title: 'Kalıcı Sil', message: `"${row.tanim}" kalıcı silinsin mi?\nBu işlem geri alınamaz.`, confirmText: 'Kalıcı Sil', variant: 'danger' })
    if (!ok) return
    try {
      const { error } = await supabase.from('gorevler').delete().eq('id', row.id)
      if (error) throw error
      setSpesifikData(p => p.filter(r => r.id !== row.id))
      toast({ type: 'success', title: 'Silindi', message: 'Görev kalıcı olarak silindi.' })
    } catch (e: any) { toast({ type: 'error', title: 'Hata', message: e.message }) }
  }

  // ── Toplu sil ─────────────────────────────────────────────────────────────
  async function topluSilUygula() {
    if (!topluSilSekme || !firmaId) return
    const ok = await confirm({
      title: '⚠️ Toplu Kalıcı Silme',
      message: `Seçilen tarih aralığındaki tüm kayıtlar kalıcı olarak silinecek.\n\nBu işlem GERİ ALINAMAZ. Onaylıyor musunuz?`,
      confirmText: 'Evet, Kalıcı Sil',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return
    setTopluSilYukleniyor(true)
    try {
      const fromISO = topluSilFrom ? new Date(topluSilFrom + 'T00:00:00').toISOString() : null
      const toISO   = topluSilTo   ? new Date(topluSilTo   + 'T23:59:59').toISOString() : null

      if (topluSilSekme === 'frekansiyel') {
        let q = supabase.from('canli_gorevler_arsiv').delete().eq('firma_id', firmaId)
        if (projeId) q = (q as any).eq('proje_id', projeId)
        if (fromISO) q = (q as any).gte('arsiv_tarihi', fromISO)
        if (toISO)   q = (q as any).lte('arsiv_tarihi', toISO)
        const { error } = await q
        if (error) throw error
        await yukle_frekansiyel()

      } else if (topluSilSekme === 'personel') {
        let q = supabase.from('personel_mesai_kayitlari').delete().eq('firma_id', firmaId).eq('arsivlendi', true)
        if (fromISO) q = (q as any).gte('giris_saati', fromISO)
        if (toISO)   q = (q as any).lte('giris_saati', toISO)
        const { error } = await q
        if (error) throw error
        await yukle_personel()

      } else if (topluSilSekme === 'musteri') {
        let q = supabase.from('musteri_degerlendirmeleri').delete().eq('firma_id', firmaId).eq('arsivlendi', true)
        if (fromISO) q = (q as any).gte('olusturma_tarihi', fromISO)
        if (toISO)   q = (q as any).lte('olusturma_tarihi', toISO)
        const { error } = await q
        if (error) throw error
        await yukle_musteri()

      } else if (topluSilSekme === 'spesifik') {
        const sinir24s = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        let q = supabase.from('gorevler').delete().eq('firma_id', firmaId)
          .or(`durum.eq.IPTAL,and(durum.eq.TAMAMLANDI,tamamlanma_tarihi.lt.${sinir24s})`)
        if (projeId) q = (q as any).eq('proje_id', projeId)
        if (fromISO) q = (q as any).gte('olusturma_tarihi', fromISO)
        if (toISO)   q = (q as any).lte('olusturma_tarihi', toISO)
        const { error } = await q
        if (error) throw error
        await yukle_spesifik()
      }

      toast({ type: 'success', title: 'Tamamlandı', message: 'Seçilen kayıtlar kalıcı olarak silindi.' })
      setTopluSilSekme(null); setTopluSilFrom(''); setTopluSilTo('')
    } catch (e: any) { toast({ type: 'error', title: 'Hata', message: e.message })
    } finally { setTopluSilYukleniyor(false) }
  }

  // ── Filtreli listeler ─────────────────────────────────────────────────────
  const filtreFrek = useMemo(() => {
    const s = frekQ.trim().toLowerCase()
    const fromD = frekFrom ? new Date(frekFrom + 'T00:00:00') : null
    const toD   = frekTo   ? new Date(frekTo   + 'T23:59:59') : null
    return frekData.filter((r: any) => {
      if (s && ![ r.tanim, r.lokasyonlar?.tanim, r.atanan?.isim_soyisim, r.kural?.tanim ].join(' ').toLowerCase().includes(s)) return false
      if (frekDurum && r.durum !== frekDurum) return false
      if (frekNeden && r.arsiv_nedeni !== frekNeden) return false
      if (fromD || toD) {
        const d = r.arsiv_tarihi ? new Date(r.arsiv_tarihi) : null
        if (!d || (fromD && d < fromD) || (toD && d > toD)) return false
      }
      return true
    })
  }, [frekData, frekQ, frekDurum, frekNeden, frekFrom, frekTo])

  const filtrePersonel = useMemo(() => {
    const s = personelQ.trim().toLowerCase()
    return personelData.filter((r: any) =>
      !s || [r.isim_soyisim, r.email].join(' ').toLowerCase().includes(s)
    )
  }, [personelData, personelQ])

  const filtreMusteri = useMemo(() =>
    musteriData.filter((r: any) => !musteriYildiz || r.yildiz === musteriYildiz)
  , [musteriData, musteriYildiz])

  const filtreSpesifik = useMemo(() => {
    const s = spesifikQ.trim().toLowerCase()
    return spesifikData.filter((r: any) =>
      !s || [r.tanim, r.lokasyonlar?.tanim, r.atanan?.isim_soyisim].join(' ').toLowerCase().includes(s)
    )
  }, [spesifikData, spesifikQ])

  // ── Frekansiyel dışa aktar ────────────────────────────────────────────────
  async function frekExcel() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(); wb.creator = 'QR-Sync'
    const ws = wb.addWorksheet('Frekansiyel Arşiv')
    ws.columns = [
      { header: 'Görev', key: 'tanim', width: 32 }, { header: 'Lokasyon', key: 'lokasyon', width: 24 },
      { header: 'Atanan', key: 'atanan', width: 20 }, { header: 'Durum', key: 'durum', width: 18 },
      { header: 'Aktif Saat', key: 'aktif', width: 20 }, { header: 'Arşiv Tarihi', key: 'arsiv_tarihi', width: 20 },
      { header: 'Arşiv Nedeni', key: 'arsiv_nedeni', width: 18 }, { header: 'Kural', key: 'kural', width: 24 },
    ]
    const hr = ws.getRow(1)
    hr.font = { bold: true, color: { argb: 'FF1F6B1F' } }
    hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCF0DC' } }
    hr.height = 20
    filtreFrek.forEach((r: any) => ws.addRow({
      tanim: r.tanim, lokasyon: r.lokasyonlar?.tanim, atanan: r.atanan?.isim_soyisim,
      durum: CANLI_DURUM_LABEL[r.durum] ?? r.durum,
      aktif: r.aktif_olma_tarihi ? formatDateTime(r.aktif_olma_tarihi) : '',
      arsiv_tarihi: r.arsiv_tarihi ? formatDateTime(r.arsiv_tarihi) : '',
      arsiv_nedeni: ARSIV_NEDEN_LABEL[r.arsiv_nedeni] ?? r.arsiv_nedeni, kural: r.kural?.tanim,
    }))
    const buf = await wb.xlsx.writeBuffer()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    a.download = `frekansiyel-arsiv-${new Date().toISOString().slice(0,10)}.xlsx`
    a.click(); URL.revokeObjectURL(a.href)
  }

  function frekYazdir() {
    const rows = filtreFrek.map((r: any) =>
      `<tr><td>${r.tanim??''}</td><td>${r.lokasyonlar?.tanim??'—'}</td><td>${r.atanan?.isim_soyisim??'—'}</td><td>${CANLI_DURUM_LABEL[r.durum]??r.durum}</td><td>${r.arsiv_tarihi?formatDateTime(r.arsiv_tarihi):'—'}</td><td>${ARSIV_NEDEN_LABEL[r.arsiv_nedeni]??r.arsiv_nedeni??'—'}</td></tr>`
    ).join('')
    const w = window.open('','_blank','width=1000,height=700')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><title>Frekansiyel Arşiv</title>
      <style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}table{width:100%;border-collapse:collapse}
      th{background:#dcf0dc;color:#1f6b1f;font-weight:700;padding:6px 8px;border:1px solid #b8e0b8;text-align:left}
      td{padding:5px 8px;border:1px solid #d6e4d6}tr:nth-child(even)td{background:#f3faf3}</style>
      </head><body><h2 style="color:#1f6b1f">Frekansiyel Görevler Arşivi</h2>
      <table><thead><tr><th>Görev</th><th>Lokasyon</th><th>Atanan</th><th>Durum</th><th>Arşiv Tarihi</th><th>Neden</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`)
    w.document.close(); setTimeout(() => w.print(), 400)
  }

  // ── Ortak stil yardımcıları ───────────────────────────────────────────────
  const sekmeBtn = (id: Sekme): React.CSSProperties => ({
    height: 36, padding: '0 16px', border: 'none', cursor: 'pointer', fontWeight: 700,
    fontSize: 13, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6,
    background: aktifSekme === id ? '#1f6b1f' : 'transparent',
    color:      aktifSekme === id ? '#fff'    : '#475569',
  })

  const td = (e?: React.CSSProperties): React.CSSProperties => ({
    padding: '9px 13px', borderBottom: '1px solid #e8f0e8', fontSize: 13, verticalAlign: 'middle', ...e,
  })

  const aksBtn = (color: string, bg: string): React.CSSProperties => ({
    width: 30, height: 30, border: 'none', borderRadius: 7, background: bg,
    color, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  })

  const inp: React.CSSProperties = {
    height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff',
  }

  const filterRow: React.CSSProperties = { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }

  const spinning: React.CSSProperties = { animation: 'spin 0.9s linear infinite' }

  const applyBtn: React.CSSProperties = { ...inp, background: '#1f6b1f', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }

  function YukleniyorSatir({ cols }: { cols: number }) {
    return <tr><td colSpan={cols} style={{ padding: 32, textAlign: 'center' }}>
      <RefreshCw size={20} style={{ ...spinning, color: '#1f6b1f', display: 'block', margin: '0 auto' }} />
    </td></tr>
  }
  function BosKayit({ cols, mesaj }: { cols: number; mesaj: string }) {
    return <tr><td colSpan={cols} style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>{mesaj}</td></tr>
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="verde-card" style={{ padding: 16 }}>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: '#0f1a0f' }}>ARŞİV YÖNETİMİ</div>
        <div style={{ fontSize: 13, color: '#7a907a', marginTop: 2 }}>Arşivlenmiş kayıtları görüntüle, geri yükle veya kalıcı sil</div>
      </div>

      {/* Sekme çubuğu */}
      <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: 18, flexWrap: 'wrap' }}>
        {SEKMELER.map(s => (
          <button key={s.id} style={sekmeBtn(s.id)} onClick={() => setAktifSekme(s.id)}>
            {s.icon}{s.label}
          </button>
        ))}
      </div>

      {!firmaId && (
        <div style={{ color: '#7a907a', fontSize: 14, padding: '28px 0', textAlign: 'center' }}>
          Arşivi görüntülemek için önce firma seçin.
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          1 — FREKANSİYEL GÖREVLER
      ═══════════════════════════════════════════════════════════ */}
      {firmaId && aktifSekme === 'frekansiyel' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#64748b' }}><strong style={{ color: '#1f6b1f' }}>{filtreFrek.length}</strong> kayıt</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => csvIndir('frekansiyel', ['Görev','Lokasyon','Atanan','Durum','Arşiv Tarihi','Neden'],
                filtreFrek.map((r:any) => [r.tanim,r.lokasyonlar?.tanim??'',r.atanan?.isim_soyisim??'',CANLI_DURUM_LABEL[r.durum]??r.durum,r.arsiv_tarihi?formatDateTime(r.arsiv_tarihi):'',ARSIV_NEDEN_LABEL[r.arsiv_nedeni]??r.arsiv_nedeni??'']))}
                disabled={!filtreFrek.length} className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40">
                <Download size={13} /> CSV
              </button>
              <button onClick={frekExcel} disabled={!filtreFrek.length}
                className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40" style={{ color: '#1d6f42' }}>
                <FileSpreadsheet size={13} /> Excel
              </button>
              <button onClick={frekYazdir} disabled={!filtreFrek.length}
                className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40" style={{ color: '#185a9b' }}>
                <Printer size={13} /> Yazdır
              </button>
              <button onClick={() => { setTopluSilSekme('frekansiyel'); setTopluSilFrom(''); setTopluSilTo('') }}
                className="border px-3 py-2 rounded-[10px] text-[13px] flex items-center gap-2" style={{ borderColor:'#fca5a5', background:'#fff1f2', color:'#dc2626', fontWeight:600 }}>
                <Trash2 size={13} /> Kayıtları Sil
              </button>
            </div>
          </div>

          <div style={filterRow}>
            <input className="verde-input" placeholder="Ara…" value={frekQ} onChange={e => setFrekQ(e.target.value)} style={{ ...inp, flex: '1 1 180px' }} />
            <select className="verde-select" value={frekDurum} onChange={e => setFrekDurum(e.target.value)} style={{ ...inp, minWidth: 150 }}>
              <option value="">Durum (Tümü)</option>
              {Object.entries(CANLI_DURUM_LABEL).map(([k,v]) => <option key={k} value={k}>{v as string}</option>)}
            </select>
            <select className="verde-select" value={frekNeden} onChange={e => setFrekNeden(e.target.value)} style={{ ...inp, minWidth: 150 }}>
              <option value="">Arşiv Nedeni (Tümü)</option>
              {Object.entries(ARSIV_NEDEN_LABEL).map(([k,v]) => <option key={k} value={k}>{v as string}</option>)}
            </select>
            <input type="date" value={frekFrom} onChange={e => setFrekFrom(e.target.value)} style={inp} />
            <span style={{ color: '#94a3b8' }}>—</span>
            <input type="date" value={frekTo} onChange={e => setFrekTo(e.target.value)} style={inp} />
            <button onClick={() => { setFrekQ(''); setFrekDurum(''); setFrekNeden(''); setFrekFrom(''); setFrekTo('') }}
              className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3]">
              Temizle
            </button>
          </div>

          <div className="verde-table-wrap">
            <table className="verde-table">
              <thead><tr>
                <th>Görev</th><th>Lokasyon</th><th>Atanan</th><th>Durum</th>
                <th>Aktif Saat</th><th>Arşiv Tarihi</th><th>Arşiv Nedeni</th><th>Kural</th>
                <th style={{ textAlign:'center' }}>İşlem</th>
              </tr></thead>
              <tbody>
                {frekLoading ? <YukleniyorSatir cols={9} /> :
                 filtreFrek.length === 0 ? <BosKayit cols={9} mesaj="Arşiv kaydı bulunamadı." /> :
                 filtreFrek.map((r: any) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{r.tanim}</td>
                    <td style={td({ color:'#64748b' })}>{getLocPath(r.lokasyon_id)}</td>
                    <td style={td({ color:'#64748b' })}>{r.atanan?.isim_soyisim ?? '—'}</td>
                    <td><span className={`verde-badge ${DURUM_RENK[r.durum] ?? 'status-acik'}`}>{CANLI_DURUM_LABEL[r.durum] ?? r.durum}</span></td>
                    <td style={{ whiteSpace:'nowrap', color:'#94a3b8', fontSize:12 }}>{r.aktif_olma_tarihi ? formatDateTime(r.aktif_olma_tarihi) : '—'}</td>
                    <td style={{ whiteSpace:'nowrap', color:'#94a3b8', fontSize:12 }}>{r.arsiv_tarihi ? formatDateTime(r.arsiv_tarihi) : '—'}</td>
                    <td>
                      <span style={{ padding:'2px 8px', borderRadius:6, fontSize:12, fontWeight:600,
                        background: r.arsiv_nedeni==='gun_sonu'?'#e8f4e8':r.arsiv_nedeni==='lokasyon_silindi'?'#fde8e8':'#f0f4ff',
                        color:      r.arsiv_nedeni==='gun_sonu'?'#2e7a2e':r.arsiv_nedeni==='lokasyon_silindi'?'#c0392b':'#2c5aa0' }}>
                        {ARSIV_NEDEN_LABEL[r.arsiv_nedeni] ?? r.arsiv_nedeni ?? '—'}
                      </span>
                    </td>
                    <td style={{ color:'#64748b', fontSize:12 }}>{r.kural?.tanim ?? '—'}</td>
                    <td><div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                      <button onClick={() => frekRestore(r)} title="Geri Yükle" style={aksBtn('#2e8b2e','#e8f4e8')}><RotateCcw size={13} /></button>
                      <button onClick={() => frekSil(r)}     title="Kalıcı Sil" style={aksBtn('#c0392b','#fde8e8')}><Trash2 size={13} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
          2 — PERSONEL TAKİBİ ARŞİVİ
      ═══════════════════════════════════════════════════════════ */}
      {firmaId && aktifSekme === 'personel' && (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
            <span style={{ fontSize:13, color:'#64748b' }}><strong style={{ color:'#1f6b1f' }}>{filtrePersonel.length}</strong> kayıt</span>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => csvIndir('personel', ['Personel','Email','Tarih','İş Başı','İş Bitimi','Çalışma Süresi'],
                filtrePersonel.map((r:any) => [r.isim_soyisim,r.email,r.kayit_tarihi,saat(r.giris_saati),saat(r.cikis_saati),sureFmt(r.giris_saati,r.cikis_saati)]))}
                disabled={!filtrePersonel.length} className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40">
                <Download size={13} /> CSV
              </button>
              <button onClick={async () => {
                const ExcelJS = (await import('exceljs')).default
                const wb = new ExcelJS.Workbook(); wb.creator = 'QR-Sync'
                const ws = wb.addWorksheet('Personel Arşiv')
                ws.columns = [
                  { header: 'Personel', key: 'isim', width: 24 }, { header: 'Email', key: 'email', width: 28 },
                  { header: 'Tarih', key: 'tarih', width: 14 }, { header: 'İş Başı', key: 'giris', width: 12 },
                  { header: 'İş Bitimi', key: 'cikis', width: 12 }, { header: 'Çalışma Süresi', key: 'sure', width: 18 },
                ]
                const hr = ws.getRow(1); hr.font = { bold: true, color: { argb: 'FF1F6B1F' } }; hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCF0DC' } }; hr.height = 20
                filtrePersonel.forEach((r:any) => ws.addRow({ isim: r.isim_soyisim, email: r.email, tarih: r.kayit_tarihi, giris: saat(r.giris_saati), cikis: saat(r.cikis_saati), sure: sureFmt(r.giris_saati, r.cikis_saati) }))
                const buf = await wb.xlsx.writeBuffer(); const a = document.createElement('a')
                a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
                a.download = `personel-arsiv-${new Date().toISOString().slice(0,10)}.xlsx`; a.click(); URL.revokeObjectURL(a.href)
              }} disabled={!filtrePersonel.length}
                className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40" style={{ color:'#1d6f42' }}>
                <FileSpreadsheet size={13} /> Excel
              </button>
              <button onClick={() => {
                const rows = filtrePersonel.map((r:any) =>
                  `<tr><td>${r.isim_soyisim}</td><td>${r.email}</td><td>${r.kayit_tarihi}</td><td>${saat(r.giris_saati)}</td><td>${saat(r.cikis_saati)}</td><td>${sureFmt(r.giris_saati,r.cikis_saati)}</td></tr>`).join('')
                const w = window.open('','_blank','width=1000,height=700'); if (!w) return
                w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><title>Personel Arşivi</title>
                  <style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}table{width:100%;border-collapse:collapse}
                  th{background:#dcf0dc;color:#1f6b1f;font-weight:700;padding:6px 8px;border:1px solid #b8e0b8;text-align:left}
                  td{padding:5px 8px;border:1px solid #d6e4d6}tr:nth-child(even)td{background:#f3faf3}</style>
                  </head><body><h2 style="color:#1f6b1f">Personel Takibi Arşivi</h2>
                  <table><thead><tr><th>Personel</th><th>Email</th><th>Tarih</th><th>İş Başı</th><th>İş Bitimi</th><th>Çalışma Süresi</th></tr></thead>
                  <tbody>${rows}</tbody></table></body></html>`)
                w.document.close(); setTimeout(() => w.print(), 400)
              }} disabled={!filtrePersonel.length}
                className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40" style={{ color:'#185a9b' }}>
                <Printer size={13} /> Yazdır
              </button>
              <button onClick={() => { setTopluSilSekme('personel'); setTopluSilFrom(''); setTopluSilTo('') }}
                className="border px-3 py-2 rounded-[10px] text-[13px] flex items-center gap-2" style={{ borderColor:'#fca5a5', background:'#fff1f2', color:'#dc2626', fontWeight:600 }}>
                <Trash2 size={13} /> Kayıtları Sil
              </button>
            </div>
          </div>

          <div style={filterRow}>
            <input className="verde-input" placeholder="Personel ara…" value={personelQ} onChange={e => setPersonelQ(e.target.value)} style={{ ...inp, flex:'1 1 180px' }} />
            <input type="date" value={personelFrom} onChange={e => setPersonelFrom(e.target.value)} style={inp} />
            <span style={{ color:'#94a3b8' }}>—</span>
            <input type="date" value={personelTo} onChange={e => setPersonelTo(e.target.value)} style={inp} />
            <button onClick={yukle_personel} disabled={personelLoading} style={applyBtn}>
              <RefreshCw size={12} style={personelLoading ? spinning : {}} /> Uygula
            </button>
          </div>

          <div className="verde-table-wrap">
            <table className="verde-table">
              <thead><tr>
                <th>Personel</th><th>Tarih</th><th>İş Başı</th><th>İş Bitimi</th>
                <th>Çalışma Süresi</th><th>Arşivlenme Tarihi</th>
              </tr></thead>
              <tbody>
                {personelLoading ? <YukleniyorSatir cols={6} /> :
                 filtrePersonel.length === 0 ? <BosKayit cols={6} mesaj="Personel arşiv kaydı bulunamadı." /> :
                 filtrePersonel.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight:700, fontSize:13 }}>{r.isim_soyisim}</div>
                      <div style={{ fontSize:11.5, color:'#94a3b8' }}>{r.email}</div>
                    </td>
                    <td style={{ color:'#64748b', whiteSpace:'nowrap' }}>{r.kayit_tarihi}</td>
                    <td style={{ fontWeight:600 }}>{saat(r.giris_saati)}</td>
                    <td style={{ color: r.cikis_saati ? '#0f1a0f' : '#94a3b8' }}>{saat(r.cikis_saati)}</td>
                    <td style={{ color:'#475569' }}>{sureFmt(r.giris_saati, r.cikis_saati)}</td>
                    <td style={{ fontSize:12, color:'#94a3b8' }}>{r.arsivleme_tarihi ? formatDateTime(r.arsivleme_tarihi) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
          3 — MÜŞTERİ DEĞERLENDİRMELERİ ARŞİVİ
      ═══════════════════════════════════════════════════════════ */}
      {firmaId && aktifSekme === 'musteri' && (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
            <span style={{ fontSize:13, color:'#64748b' }}><strong style={{ color:'#1f6b1f' }}>{filtreMusteri.length}</strong> kayıt</span>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => csvIndir('musteri', ['Tarih','Lokasyon','Kanal','Puan','Yorum','Ad Soyad'],
                filtreMusteri.map((r:any) => [r.olusturma_tarihi,r.lokasyon_tanim,r.kanal,String(r.yildiz),r.yorum??'',r.ad_soyad??'']))}
                disabled={!filtreMusteri.length} className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40">
                <Download size={13} /> CSV
              </button>
              <button onClick={async () => {
                const ExcelJS = (await import('exceljs')).default
                const wb = new ExcelJS.Workbook(); wb.creator = 'QR-Sync'
                const ws = wb.addWorksheet('Müşteri Değerlendirme Arşivi')
                ws.columns = [
                  { header: 'Tarih', key: 'tarih', width: 20 }, { header: 'Lokasyon', key: 'lokasyon', width: 24 },
                  { header: 'Kanal', key: 'kanal', width: 10 }, { header: 'Puan', key: 'puan', width: 8 },
                  { header: 'Yorum', key: 'yorum', width: 40 }, { header: 'Ad Soyad', key: 'ad', width: 20 },
                ]
                const hr = ws.getRow(1); hr.font = { bold: true, color: { argb: 'FF1F6B1F' } }; hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCF0DC' } }; hr.height = 20
                filtreMusteri.forEach((r:any) => ws.addRow({ tarih: r.olusturma_tarihi, lokasyon: r.lokasyon_tanim, kanal: r.kanal, puan: r.yildiz, yorum: r.yorum??'', ad: r.ad_soyad??'' }))
                const buf = await wb.xlsx.writeBuffer(); const a = document.createElement('a')
                a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
                a.download = `musteri-degerlendirme-arsiv-${new Date().toISOString().slice(0,10)}.xlsx`; a.click(); URL.revokeObjectURL(a.href)
              }} disabled={!filtreMusteri.length}
                className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40" style={{ color:'#1d6f42' }}>
                <FileSpreadsheet size={13} /> Excel
              </button>
              <button onClick={() => {
                const rows = filtreMusteri.map((r:any) =>
                  `<tr><td>${new Date(r.olusturma_tarihi).toLocaleString('tr-TR')}</td><td>${r.lokasyon_tanim}</td><td>${r.kanal}</td><td>${'★'.repeat(r.yildiz)}</td><td>${r.yorum??'—'}</td><td>${r.ad_soyad??'—'}</td></tr>`).join('')
                const w = window.open('','_blank','width=1000,height=700'); if (!w) return
                w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><title>Müşteri Değerlendirme Arşivi</title>
                  <style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}table{width:100%;border-collapse:collapse}
                  th{background:#dcf0dc;color:#1f6b1f;font-weight:700;padding:6px 8px;border:1px solid #b8e0b8;text-align:left}
                  td{padding:5px 8px;border:1px solid #d6e4d6}tr:nth-child(even)td{background:#f3faf3}</style>
                  </head><body><h2 style="color:#1f6b1f">Müşteri Değerlendirmeleri Arşivi</h2>
                  <table><thead><tr><th>Tarih</th><th>Lokasyon</th><th>Kanal</th><th>Puan</th><th>Yorum</th><th>Ad Soyad</th></tr></thead>
                  <tbody>${rows}</tbody></table></body></html>`)
                w.document.close(); setTimeout(() => w.print(), 400)
              }} disabled={!filtreMusteri.length}
                className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40" style={{ color:'#185a9b' }}>
                <Printer size={13} /> Yazdır
              </button>
              <button onClick={() => { setTopluSilSekme('musteri'); setTopluSilFrom(''); setTopluSilTo('') }}
                className="border px-3 py-2 rounded-[10px] text-[13px] flex items-center gap-2" style={{ borderColor:'#fca5a5', background:'#fff1f2', color:'#dc2626', fontWeight:600 }}>
                <Trash2 size={13} /> Kayıtları Sil
              </button>
            </div>
          </div>

          <div style={filterRow}>
            <select value={musteriYildiz} onChange={e => setMusteriYildiz(Number(e.target.value))} style={{ ...inp, minWidth:140 }}>
              <option value={0}>Puan (Tümü)</option>
              {[5,4,3,2,1].map(n => <option key={n} value={n}>{'★'.repeat(n)} — {YILDIZ_ETIKET[n]}</option>)}
            </select>
            <input type="date" value={musteriFrom} onChange={e => setMusteriFrom(e.target.value)} style={inp} />
            <span style={{ color:'#94a3b8' }}>—</span>
            <input type="date" value={musteriTo} onChange={e => setMusteriTo(e.target.value)} style={inp} />
            <button onClick={yukle_musteri} disabled={musteriLoading} style={applyBtn}>
              <RefreshCw size={12} style={musteriLoading ? spinning : {}} /> Uygula
            </button>
          </div>

          <div className="verde-table-wrap">
            <table className="verde-table">
              <thead><tr>
                <th>Tarih</th><th>Lokasyon</th><th>Kanal</th><th>Puan</th>
                <th>Yorum</th><th>Ad Soyad</th><th>Arşivlenme</th>
                <th style={{ textAlign:'center' }}>İşlem</th>
              </tr></thead>
              <tbody>
                {musteriLoading ? <YukleniyorSatir cols={8} /> :
                 filtreMusteri.length === 0 ? <BosKayit cols={8} mesaj="Müşteri değerlendirme arşivi boş." /> :
                 filtreMusteri.map((r: any) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace:'nowrap', color:'#64748b', fontSize:12 }}>
                      {new Date(r.olusturma_tarihi).toLocaleString('tr-TR',{ day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                    </td>
                    <td style={{ fontWeight:600 }}>{r.lokasyon_tanim}</td>
                    <td>
                      <span style={{ padding:'2px 8px', borderRadius:12, fontSize:11.5, fontWeight:700,
                        background: r.kanal==='QR'?'#e0f2fe':'#f0fdf4',
                        color:      r.kanal==='QR'?'#0369a1':'#166534' }}>{r.kanal}
                      </span>
                    </td>
                    <td style={{ whiteSpace:'nowrap' }}>
                      {'★'.repeat(r.yildiz)}<span style={{ fontSize:11, color:'#94a3b8', marginLeft:4 }}>{YILDIZ_ETIKET[r.yildiz]}</span>
                    </td>
                    <td style={{ maxWidth:220, color:'#334155', fontSize:12 }}>
                      <span title={r.yorum??''} style={{ display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as any, overflow:'hidden' }}>
                        {r.yorum || <span style={{ color:'#cbd5e1' }}>—</span>}
                      </span>
                    </td>
                    <td style={{ color: r.ad_soyad?'#0f1a0f':'#cbd5e1', fontSize:13 }}>{r.ad_soyad||'—'}</td>
                    <td style={{ fontSize:12, color:'#94a3b8' }}>{r.arsivleme_tarihi ? formatDateTime(r.arsivleme_tarihi) : '—'}</td>
                    <td><div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                      <button onClick={() => musteriCikar(r)} title="Arşivden Çıkar" style={aksBtn('#d97706','#fef3c7')}><RotateCcw size={13} /></button>
                      <button onClick={() => musteriSil(r)}   title="Kalıcı Sil"    style={aksBtn('#c0392b','#fde8e8')}><Trash2 size={13} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
          4 — SPESİFİK GÖREVLER ARŞİVİ
      ═══════════════════════════════════════════════════════════ */}
      {firmaId && aktifSekme === 'spesifik' && (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
            <span style={{ fontSize:13, color:'#64748b' }}><strong style={{ color:'#1f6b1f' }}>{filtreSpesifik.length}</strong> kayıt</span>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => csvIndir('spesifik', ['Görev','Lokasyon','Atanan','Durum','Oluşturma','Tamamlanma'],
                filtreSpesifik.map((r:any) => [r.tanim,r.lokasyonlar?.tanim??'',r.atanan?.isim_soyisim??'',r.durum,r.olusturma_tarihi,r.tamamlanma_tarihi??'']))}
                disabled={!filtreSpesifik.length} className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40">
                <Download size={13} /> CSV
              </button>
              <button onClick={async () => {
                const ExcelJS = (await import('exceljs')).default
                const wb = new ExcelJS.Workbook(); wb.creator = 'QR-Sync'
                const ws = wb.addWorksheet('Spesifik Görevler Arşivi')
                ws.columns = [
                  { header: 'Görev', key: 'tanim', width: 32 }, { header: 'Lokasyon', key: 'lokasyon', width: 24 },
                  { header: 'Atanan', key: 'atanan', width: 20 }, { header: 'Durum', key: 'durum', width: 14 },
                  { header: 'Oluşturma', key: 'olusturma', width: 20 }, { header: 'Tamamlanma', key: 'tamamlanma', width: 20 },
                ]
                const hr = ws.getRow(1); hr.font = { bold: true, color: { argb: 'FF1F6B1F' } }; hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCF0DC' } }; hr.height = 20
                filtreSpesifik.forEach((r:any) => ws.addRow({ tanim: r.tanim, lokasyon: r.lokasyonlar?.tanim??'', atanan: r.atanan?.isim_soyisim??'', durum: r.durum, olusturma: r.olusturma_tarihi ? formatDateTime(r.olusturma_tarihi) : '', tamamlanma: r.tamamlanma_tarihi ? formatDateTime(r.tamamlanma_tarihi) : '' }))
                const buf = await wb.xlsx.writeBuffer(); const a = document.createElement('a')
                a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
                a.download = `spesifik-arsiv-${new Date().toISOString().slice(0,10)}.xlsx`; a.click(); URL.revokeObjectURL(a.href)
              }} disabled={!filtreSpesifik.length}
                className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40" style={{ color:'#1d6f42' }}>
                <FileSpreadsheet size={13} /> Excel
              </button>
              <button onClick={() => {
                const rows = filtreSpesifik.map((r:any) =>
                  `<tr><td>${r.tanim}</td><td>${r.lokasyonlar?.tanim??'—'}</td><td>${r.atanan?.isim_soyisim??'—'}</td><td>${r.durum}</td><td>${r.olusturma_tarihi ? formatDateTime(r.olusturma_tarihi) : '—'}</td><td>${r.tamamlanma_tarihi ? formatDateTime(r.tamamlanma_tarihi) : '—'}</td></tr>`).join('')
                const w = window.open('','_blank','width=1000,height=700'); if (!w) return
                w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><title>Spesifik Görevler Arşivi</title>
                  <style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}table{width:100%;border-collapse:collapse}
                  th{background:#dcf0dc;color:#1f6b1f;font-weight:700;padding:6px 8px;border:1px solid #b8e0b8;text-align:left}
                  td{padding:5px 8px;border:1px solid #d6e4d6}tr:nth-child(even)td{background:#f3faf3}</style>
                  </head><body><h2 style="color:#1f6b1f">Spesifik Görevler Arşivi</h2>
                  <table><thead><tr><th>Görev</th><th>Lokasyon</th><th>Atanan</th><th>Durum</th><th>Oluşturma</th><th>Tamamlanma</th></tr></thead>
                  <tbody>${rows}</tbody></table></body></html>`)
                w.document.close(); setTimeout(() => w.print(), 400)
              }} disabled={!filtreSpesifik.length}
                className="border border-[#d6e4d6] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#f3faf3] flex items-center gap-2 disabled:opacity-40" style={{ color:'#185a9b' }}>
                <Printer size={13} /> Yazdır
              </button>
              <button onClick={() => { setTopluSilSekme('spesifik'); setTopluSilFrom(''); setTopluSilTo('') }}
                className="border px-3 py-2 rounded-[10px] text-[13px] flex items-center gap-2" style={{ borderColor:'#fca5a5', background:'#fff1f2', color:'#dc2626', fontWeight:600 }}>
                <Trash2 size={13} /> Kayıtları Sil
              </button>
            </div>
          </div>

          <div style={filterRow}>
            <input className="verde-input" placeholder="Görev / lokasyon ara…" value={spesifikQ} onChange={e => setSpesifikQ(e.target.value)} style={{ ...inp, flex:'1 1 180px' }} />
            <input type="date" value={spesifikFrom} onChange={e => setSpesifikFrom(e.target.value)} style={inp} />
            <span style={{ color:'#94a3b8' }}>—</span>
            <input type="date" value={spesifikTo} onChange={e => setSpesifikTo(e.target.value)} style={inp} />
            <button onClick={yukle_spesifik} disabled={spesifikLoading} style={applyBtn}>
              <RefreshCw size={12} style={spesifikLoading ? spinning : {}} /> Uygula
            </button>
          </div>

          <div className="verde-table-wrap">
            <table className="verde-table">
              <thead><tr>
                <th>Görev</th><th>Lokasyon</th><th>Atanan</th><th>Durum</th>
                <th>Oluşturma</th><th>Tamamlanma</th><th>Arşivlenme</th><th style={{ textAlign:'center' }}>İşlem</th>
              </tr></thead>
              <tbody>
                {spesifikLoading ? <YukleniyorSatir cols={8} /> :
                 filtreSpesifik.length === 0 ? <BosKayit cols={8} mesaj="Spesifik görev arşivi boş." /> :
                 filtreSpesifik.map((r: any) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight:600 }}>{r.tanim}</td>
                    <td style={{ color:'#64748b' }}>{getLocPath(r.lokasyon_id)}</td>
                    <td style={{ color:'#64748b' }}>{r.atanan?.isim_soyisim ?? '—'}</td>
                    <td>
                      <span style={{ padding:'2px 8px', borderRadius:12, fontSize:12, fontWeight:700,
                        background: r.durum==='TAMAMLANDI'?'#dcfce7':'#fee2e2',
                        color:      r.durum==='TAMAMLANDI'?'#166534':'#991b1b' }}>
                        {r.durum}
                      </span>
                    </td>
                    <td style={{ whiteSpace:'nowrap', color:'#94a3b8', fontSize:12 }}>{r.olusturma_tarihi ? formatDateTime(r.olusturma_tarihi) : '—'}</td>
                    <td style={{ whiteSpace:'nowrap', color:'#94a3b8', fontSize:12 }}>{r.tamamlanma_tarihi ? formatDateTime(r.tamamlanma_tarihi) : '—'}</td>
                    <td style={{ whiteSpace:'nowrap', color:'#94a3b8', fontSize:12 }}>
                      {r.durum === 'TAMAMLANDI' && r.tamamlanma_tarihi
                        ? formatDateTime(new Date(new Date(r.tamamlanma_tarihi).getTime() + 24 * 60 * 60 * 1000).toISOString())
                        : r.durum_degisim_tarihi ? formatDateTime(r.durum_degisim_tarihi) : '—'}
                    </td>
                    <td><div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                      <button onClick={() => spesifikRestore(r)} title="Geri Yükle" style={aksBtn('#2e8b2e','#e8f4e8')}><RotateCcw size={13} /></button>
                      <button onClick={() => spesifikSil(r)}     title="Kalıcı Sil" style={aksBtn('#c0392b','#fde8e8')}><Trash2 size={13} /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* ── Toplu Sil Modalı ─────────────────────────────────────────────── */}
      {topluSilSekme && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:80, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => !topluSilYukleniyor && setTopluSilSekme(null)}>
          <div className="verde-card" style={{ width:420, padding:0, overflow:'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #fca5a5', background:'#fff1f2', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#dc2626' }}>
                <Trash2 size={14} style={{ display:'inline', marginRight:6 }} />
                Kayıtları Kalıcı Sil — {
                  topluSilSekme === 'frekansiyel' ? 'Frekansiyel Görevler' :
                  topluSilSekme === 'personel'   ? 'Personel Takibi' :
                  topluSilSekme === 'musteri'    ? 'Müşteri Değerlendirmeleri' :
                  'Spesifik Görevler'
                }
              </div>
              {!topluSilYukleniyor && (
                <button onClick={() => setTopluSilSekme(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:16 }}>✕</button>
              )}
            </div>
            <div style={{ padding:18 }}>
              <div style={{ fontSize:13, color:'#475569', marginBottom:14 }}>
                Silmek istediğiniz tarih aralığını seçin. Aralık seçilmezse <strong>tüm kayıtlar</strong> silinir.
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:18 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>Başlangıç</div>
                  <input type="date" value={topluSilFrom} onChange={e => setTopluSilFrom(e.target.value)}
                    style={{ width:'100%', height:34, padding:'0 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13 }} />
                </div>
                <div style={{ marginTop:18, color:'#94a3b8' }}>—</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>Bitiş</div>
                  <input type="date" value={topluSilTo} onChange={e => setTopluSilTo(e.target.value)}
                    style={{ width:'100%', height:34, padding:'0 10px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13 }} />
                </div>
              </div>
              <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#9a3412', marginBottom:16 }}>
                ⚠️ Bu işlem geri alınamaz. Seçilen aralıktaki tüm kayıtlar veritabanından kalıcı olarak silinir.
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={topluSilUygula} disabled={topluSilYukleniyor}
                  style={{ flex:1, height:38, borderRadius:8, border:'none', background:'#dc2626', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, opacity: topluSilYukleniyor ? 0.7 : 1 }}>
                  {topluSilYukleniyor ? <><RefreshCw size={13} style={spinning} /> Siliniyor…</> : <><Trash2 size={13} /> Kalıcı Sil</>}
                </button>
                <button onClick={() => setTopluSilSekme(null)} disabled={topluSilYukleniyor}
                  style={{ height:38, padding:'0 18px', borderRadius:8, border:'1px solid #e2e8f0', background:'#fff', cursor:'pointer', fontSize:13 }}>
                  İptal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
