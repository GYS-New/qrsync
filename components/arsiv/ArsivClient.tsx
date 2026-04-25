'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDateTime, CANLI_DURUM_LABEL } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'
import { useYetki } from '@/lib/yetki/useYetki'
import ChecklistModal from '@/components/checklist/ChecklistModal'
import { KANAL_RENK, KANAL_LABEL } from '@/components/shared/KanalBadge'
import {
  Trash2, RotateCcw, Download, FileSpreadsheet, Printer,
  RefreshCw, Archive, Users, Star, ClipboardList, ClipboardCheck,
  ChevronDown, ChevronRight, ExternalLink,
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

type Sekme = 'frekansiyel' | 'personel' | 'musteri' | 'spesifik' | 'ceklist'

const SEKMELER: { id: Sekme; label: string; icon: React.ReactNode }[] = [
  { id: 'frekansiyel', label: 'Frekansiyel Görevler',      icon: <Archive size={14} /> },
  { id: 'personel',   label: 'Personel Takibi',            icon: <Users size={14} /> },
  { id: 'musteri',    label: 'Müşteri Değerlendirmeleri',  icon: <Star size={14} /> },
  { id: 'spesifik',  label: 'Spesifik Görevler',           icon: <ClipboardList size={14} /> },
  { id: 'ceklist',   label: 'Çeklist Raporları',           icon: <ClipboardCheck size={14} /> },
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
  const yetki = useYetki('arsiv')
  const { firmaId: saFirmaId } = useFirma()
  const { aktifProje, loading: projeLoading } = useProje()

  const firmaId = base.startsWith('/ta') ? (tenantFirmaId ?? null) : saFirmaId
  const projeId = aktifProje?.id ?? null
  const isTA    = base.startsWith('/ta')

  const [aktifSekme, setAktifSekme] = useState<Sekme>('frekansiyel')

  // ── Frekansiyel state (server-side pagination) ───────────────────────────
  const [frekData,    setFrekData]    = useState<any[]>([])
  const [frekTotal,   setFrekTotal]   = useState(0)
  const [frekLoading, setFrekLoading] = useState(false)
  const [frekQ,       setFrekQ]       = useState('')
  const [frekDurum,   setFrekDurum]   = useState('')
  const [frekNeden,   setFrekNeden]   = useState('')
  const [frekFrom,    setFrekFrom]    = useState('')
  const [frekTo,      setFrekTo]      = useState('')
  const [frekSayfa,   setFrekSayfa]   = useState(1)
  const FREK_PER_PAGE = 50

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
  const [musteriQ,       setMusteriQ]       = useState('')

  // ── Spesifik state ───────────────────────────────────────────────────────
  const [spesifikData,    setSpesifikData]    = useState<any[]>([])
  const [spesifikLoading, setSpesifikLoading] = useState(false)
  const [spesifikQ,       setSpesifikQ]       = useState('')
  const [spesifikFrom,    setSpesifikFrom]    = useState('')
  const [spesifikTo,      setSpesifikTo]      = useState('')

  // ── Kapasite state ───────────────────────────────────────────────────────
  const [kapasite, setKapasite] = useState<{
    scope?: 'firma' | 'global'
    genel: { toplam_kayit: number; toplam_bytes: number; toplam_label: string; doluluk: number; durum: string; db_limit: string; db_limit_label: string }
    tablolar: Array<{ tablo: string; label: string; kayit: number; boyut_bytes: number; boyut_label: string; doluluk: number; durum: string }>
  } | null>(null)

  // ── Toplu sil modal ───────────────────────────────────────────────────────
  const [topluSilSekme,  setTopluSilSekme]  = useState<Sekme | null>(null)
  const [topluSilFrom,   setTopluSilFrom]   = useState('')
  const [topluSilTo,     setTopluSilTo]     = useState('')
  const [topluSilYukleniyor, setTopluSilYukleniyor] = useState(false)
  const [topluSilProgress, setTopluSilProgress] = useState<{ done: number; total: number } | null>(null)

  // ── Lokasyon hiyerarşisi ──────────────────────────────────────────────────
  const [lokasyonlarTum, setLokasyonlarTum] = useState<any[]>([])

  useEffect(() => {
    if (!firmaId) return
    supabase.from('lokasyonlar').select('id,tanim,parent_id').eq('firma_id', firmaId)
      .then(({ data }) => { if (data) setLokasyonlarTum(data) })
  }, [firmaId])

  // Kapasite verisini çek — SA global ya da firma seçiliyse firma bazlı; TA kendi firması
  useEffect(() => {
    const url = firmaId
      ? `/api/arsiv/kapasite?firma_id=${firmaId}`
      : '/api/arsiv/kapasite'
    setKapasite(null)
    fetch(url).then(r => r.json()).then(d => { if (d.ok) setKapasite(d) }).catch(() => {})
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

  const yukle_frekansiyel = useCallback(async (sayfa?: number) => {
    if (!firmaId) { setFrekData([]); setFrekTotal(0); return }
    if (isTA && (projeLoading || !projeId)) { setFrekData([]); setFrekTotal(0); return }
    setFrekLoading(true)
    try {
      const pg = sayfa ?? frekSayfa
      const qp = new URLSearchParams({ firma_id: firmaId, page: String(pg), limit: String(FREK_PER_PAGE) })
      if (projeId) qp.set('proje_id', projeId)
      if (frekQ.trim()) qp.set('q', frekQ.trim())
      if (frekDurum) qp.set('durum', frekDurum)
      if (frekNeden) qp.set('neden', frekNeden)
      if (frekFrom) qp.set('from', frekFrom)
      if (frekTo) qp.set('to', frekTo)

      const res = await fetch(`/api/arsiv/frekansiyel?${qp}`)
      const j = await res.json()
      if (j.error) throw new Error(j.error)
      setFrekData(j.data ?? [])
      setFrekTotal(j.total ?? 0)
    } catch (e: any) { toast({ type: 'error', title: 'Yüklenemedi', message: e.message })
    } finally { setFrekLoading(false) }
  }, [firmaId, projeId, projeLoading, isTA, frekSayfa, frekQ, frekDurum, frekNeden, frekFrom, frekTo])

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
      const res = await fetch('/api/tasks/sil', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [row.id], tablo: 'canli_gorevler_arsiv', firma_id: firmaId }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Silinemedi')
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
      const res = await fetch('/api/tasks/sil', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [row.id], tablo: 'gorevler', firma_id: firmaId }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Silinemedi')
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
    setTopluSilProgress(null)
    try {
      const fromISO = topluSilFrom ? new Date(topluSilFrom + 'T00:00:00').toISOString() : null
      const toISO   = topluSilTo   ? new Date(topluSilTo   + 'T23:59:59').toISOString() : null

      // Endpoint'in URL limit'ine takılmamak için 200'lü chunk halinde POST atılır
      // (5000+ ID'lik tek istekler PostgREST .in() URL limit'ini aşıp 500 dönüyordu)
      const CHUNK = 200
      const silChunked = async (allIds: string[], tablo: 'canli_gorevler_arsiv' | 'gorevler') => {
        setTopluSilProgress({ done: 0, total: allIds.length })
        for (let i = 0; i < allIds.length; i += CHUNK) {
          const batch = allIds.slice(i, i + CHUNK)
          const res = await fetch('/api/tasks/sil', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: batch, tablo, firma_id: firmaId }),
          })
          const json = await res.json()
          if (!json.ok) throw new Error(json.error ?? `Batch ${i / CHUNK + 1} silinemedi`)
          setTopluSilProgress({ done: Math.min(i + batch.length, allIds.length), total: allIds.length })
        }
      }

      if (topluSilSekme === 'frekansiyel') {
        let q = supabase.from('canli_gorevler_arsiv').select('id').eq('firma_id', firmaId)
        if (projeId) q = (q as any).eq('proje_id', projeId)
        if (fromISO) q = (q as any).gte('arsiv_tarihi', fromISO)
        if (toISO)   q = (q as any).lte('arsiv_tarihi', toISO)
        const { data: rows, error: selErr } = await q
        if (selErr) throw selErr
        const ids = (rows ?? []).map((r: any) => r.id)
        if (ids.length > 0) await silChunked(ids, 'canli_gorevler_arsiv')
        await yukle_frekansiyel()

      } else if (topluSilSekme === 'personel') {
        // ARŞİV tablosundan sil — cron eski 'arsivlendi=true' kayıtlarını
        // personel_mesai_kayitlari_arsiv'a taşıyor; aktif tabloda arsivlendi=true
        // pratikte hiç kayıt kalmaz → eski kod 0 satır etkileyip 'silindi' toast'u veriyordu
        let q = supabase.from('personel_mesai_kayitlari_arsiv').delete({ count: 'exact' }).eq('firma_id', firmaId)
        if (projeId) q = (q as any).eq('proje_id', projeId)
        if (fromISO) q = (q as any).gte('giris_saati', fromISO)
        if (toISO)   q = (q as any).lte('giris_saati', toISO)
        const { error, count } = await q
        if (error) throw error
        await yukle_personel()
        toast({ type: 'success', title: 'Tamamlandı', message: `${count ?? 0} mesai kaydı silindi.` })
        setTopluSilSekme(null); setTopluSilFrom(''); setTopluSilTo('')
        return

      } else if (topluSilSekme === 'musteri') {
        // ARŞİV tablosundan sil (aynı sebep)
        let q = supabase.from('musteri_degerlendirmeleri_arsiv').delete({ count: 'exact' }).eq('firma_id', firmaId)
        if (projeId) q = (q as any).eq('proje_id', projeId)
        if (fromISO) q = (q as any).gte('olusturma_tarihi', fromISO)
        if (toISO)   q = (q as any).lte('olusturma_tarihi', toISO)
        const { error, count } = await q
        if (error) throw error
        await yukle_musteri()
        toast({ type: 'success', title: 'Tamamlandı', message: `${count ?? 0} değerlendirme silindi.` })
        setTopluSilSekme(null); setTopluSilFrom(''); setTopluSilTo('')
        return

      } else if (topluSilSekme === 'spesifik') {
        const sinir24s = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        let q = supabase.from('gorevler').select('id').eq('firma_id', firmaId)
          .or(`durum.eq.IPTAL,and(durum.eq.TAMAMLANDI,tamamlanma_tarihi.lt.${sinir24s})`)
        if (projeId) q = (q as any).eq('proje_id', projeId)
        if (fromISO) q = (q as any).gte('olusturma_tarihi', fromISO)
        if (toISO)   q = (q as any).lte('olusturma_tarihi', toISO)
        const { data: rows, error: selErr } = await q
        if (selErr) throw selErr
        const ids = (rows ?? []).map((r: any) => r.id)
        if (ids.length > 0) await silChunked(ids, 'gorevler')
        await yukle_spesifik()

      }

      toast({ type: 'success', title: 'Tamamlandı', message: 'Seçilen kayıtlar kalıcı olarak silindi.' })
      setTopluSilSekme(null); setTopluSilFrom(''); setTopluSilTo('')
    } catch (e: any) { toast({ type: 'error', title: 'Hata', message: e.message })
    } finally { setTopluSilYukleniyor(false); setTopluSilProgress(null) }
  }

  // ── Filtreli listeler ─────────────────────────────────────────────────────
  // Server-side pagination — filtreFrek = server'dan gelen sayfa verisi
  const filtreFrek = frekData
  const frekToplamSayfa = Math.max(1, Math.ceil(frekTotal / FREK_PER_PAGE))

  const filtrePersonel = useMemo(() => {
    const s = personelQ.trim().toLowerCase()
    return personelData.filter((r: any) =>
      !s || [r.isim_soyisim, r.email].join(' ').toLowerCase().includes(s)
    )
  }, [personelData, personelQ])

  const filtreMusteri = useMemo(() => {
    const s = musteriQ.trim().toLowerCase()
    return musteriData.filter((r: any) => {
      if (musteriYildiz && r.yildiz !== musteriYildiz) return false
      if (s && ![r.lokasyon_yol, r.ad_soyad, r.yorum].join(' ').toLowerCase().includes(s)) return false
      return true
    })
  }, [musteriData, musteriYildiz, musteriQ])

  const filtreSpesifik = useMemo(() => {
    const s = spesifikQ.trim().toLowerCase()
    return spesifikData.filter((r: any) =>
      !s || [r.tanim, r.lokasyonlar?.tanim, r.atanan?.isim_soyisim].join(' ').toLowerCase().includes(s)
    )
  }, [spesifikData, spesifikQ])

  // ── Frekansiyel dışa aktar ────────────────────────────────────────────────
  async function frekExcel() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(); wb.creator = 'İOGYS'
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
      th{background:#e5e7eb;color:#1f2937;font-weight:700;padding:6px 8px;border:1px solid #d1d5db;text-align:left}
      td{padding:5px 8px;border:1px solid #e5e7eb}tr:nth-child(even)td{background:#fafafa}</style>
      </head><body><h2 style="color:#1f2937">Frekansiyel Görevler Arşivi</h2>
      <table><thead><tr><th>Görev</th><th>Lokasyon</th><th>Atanan</th><th>Durum</th><th>Arşiv Tarihi</th><th>Neden</th></tr></thead>
      <tbody>${rows}</tbody></table></body></html>`)
    w.document.close(); setTimeout(() => w.print(), 400)
  }

  // ── Ortak stil yardımcıları ───────────────────────────────────────────────
  const sekmeBtn = (id: Sekme): React.CSSProperties => ({
    height: 36, padding: '0 16px', border: 'none', cursor: 'pointer', fontWeight: 700,
    fontSize: 13, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 6,
    background: aktifSekme === id ? '#1f2937' : 'transparent',
    color:      aktifSekme === id ? '#fff'    : '#475569',
  })

  const td = (e?: React.CSSProperties): React.CSSProperties => ({
    padding: '9px 13px', borderBottom: '1px solid #f3f4f6', fontSize: 13, verticalAlign: 'middle', ...e,
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

  const applyBtn: React.CSSProperties = { ...inp, background: '#1f2937', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }

  function YukleniyorSatir({ cols }: { cols: number }) {
    return <tr><td colSpan={cols} style={{ padding: 32, textAlign: 'center' }}>
      <RefreshCw size={20} style={{ ...spinning, color: '#1f2937', display: 'block', margin: '0 auto' }} />
    </td></tr>
  }
  function BosKayit({ cols, mesaj }: { cols: number; mesaj: string }) {
    return <tr><td colSpan={cols} style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>{mesaj}</td></tr>
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="verde-card" style={{ padding: 16 }}>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: '#111827' }}>ARŞİV YÖNETİMİ</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>Arşivlenmiş kayıtları görüntüle, geri yükle veya kalıcı sil</div>
      </div>

      {/* Kapasite Göstergesi */}
      {kapasite && (
        <div style={{ marginBottom: 16, padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#334155', letterSpacing: '0.03em' }}>
              ARŞİV DEPOLAMA KAPASİTESİ
              {kapasite.scope === 'firma' && <span style={{ fontSize: 10, fontWeight: 700, color:'#64748b', marginLeft: 8 }}>(FİRMA KOTASI)</span>}
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {kapasite.genel.toplam_label} / {kapasite.genel.db_limit} {kapasite.scope === 'firma' ? '' : 'DB'}
            </div>
          </div>
          {/* Genel bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1, height: 10, background: '#e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{
                width: `${Math.max(Math.min(kapasite.genel.doluluk, 100), 0.5)}%`, height: '100%', borderRadius: 6,
                background: kapasite.genel.durum === 'kritik' ? '#ef4444' : kapasite.genel.durum === 'uyari' ? '#f59e0b' : '#22c55e',
                transition: 'width 0.5s ease',
              }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: kapasite.genel.durum === 'kritik' ? '#ef4444' : kapasite.genel.durum === 'uyari' ? '#f59e0b' : '#22c55e', minWidth: 48 }}>
              %{kapasite.genel.doluluk}
            </span>
          </div>
          {/* Tablo detayları */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {kapasite.tablolar.map(t => (
              <div key={t.tablo} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, color: '#475569' }}>{t.label}</span>
                    <span style={{ color: '#94a3b8', fontSize: 11 }}>{t.boyut_label} · {t.kayit.toLocaleString('tr-TR')} kayıt</span>
                  </div>
                  <div style={{ height: 5, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.max(Math.min(t.doluluk, 100), 0.5)}%`, height: '100%', borderRadius: 4,
                      background: t.durum === 'kritik' ? '#ef4444' : t.durum === 'uyari' ? '#f59e0b' : '#22c55e',
                    }} />
                  </div>
                </div>
                <span style={{ fontWeight: 700, color: t.durum === 'kritik' ? '#ef4444' : t.durum === 'uyari' ? '#f59e0b' : '#64748b', minWidth: 36, textAlign: 'right' }}>
                  %{t.doluluk}
                </span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
            Toplam: {kapasite.genel.toplam_kayit.toLocaleString('tr-TR')} kayıt · Arşiv alanı: {kapasite.genel.toplam_label} / {kapasite.genel.db_limit}
          </div>
        </div>
      )}

      {/* Sekme çubuğu */}
      <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 4, marginBottom: 18, flexWrap: 'wrap' }}>
        {SEKMELER.map(s => {
          const sekmeTabloMap: Record<Sekme, string> = {
            frekansiyel: 'canli_gorevler_arsiv',
            personel: 'personel_mesai_kayitlari_arsiv',
            musteri: 'musteri_degerlendirmeleri_arsiv',
            spesifik: 'gorevler_arsiv',
            ceklist: 'checklist_sonuc_basliklari_arsiv',
          }
          const tabloInfo = kapasite?.tablolar.find(t => t.tablo === sekmeTabloMap[s.id])
          return (
            <button key={s.id} style={sekmeBtn(s.id)} onClick={() => setAktifSekme(s.id)}>
              {s.icon}{s.label}
              {tabloInfo && (
                <span style={{
                  fontSize: 10, fontWeight: 700, marginLeft: 4,
                  padding: '1px 5px', borderRadius: 6,
                  background: tabloInfo.durum === 'kritik' ? '#fee2e2' : tabloInfo.durum === 'uyari' ? '#fef3c7' : '#f0fdf4',
                  color: tabloInfo.durum === 'kritik' ? '#dc2626' : tabloInfo.durum === 'uyari' ? '#d97706' : '#16a34a',
                }}>
                  {tabloInfo.boyut_label}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {!firmaId && (
        <div style={{ color: '#6b7280', fontSize: 14, padding: '28px 0', textAlign: 'center' }}>
          Arşivi görüntülemek için önce firma seçin.
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          1 — FREKANSİYEL GÖREVLER
      ═══════════════════════════════════════════════════════════ */}
      {firmaId && aktifSekme === 'frekansiyel' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#64748b' }}><strong style={{ color: '#1f2937' }}>{frekTotal}</strong> kayıt · Sayfa {frekSayfa}/{frekToplamSayfa}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => csvIndir('frekansiyel', ['Görev','Lokasyon','Atanan','Durum','Arşiv Tarihi','Neden'],
                filtreFrek.map((r:any) => [r.tanim,r.lokasyonlar?.tanim??'',r.atanan?.isim_soyisim??'',CANLI_DURUM_LABEL[r.durum]??r.durum,r.arsiv_tarihi?formatDateTime(r.arsiv_tarihi):'',ARSIV_NEDEN_LABEL[r.arsiv_nedeni]??r.arsiv_nedeni??'']))}
                disabled={!filtreFrek.length} className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa] flex items-center gap-2 disabled:opacity-40">
                <Download size={13} /> CSV
              </button>
              <button onClick={frekExcel} disabled={!filtreFrek.length}
                className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa] flex items-center gap-2 disabled:opacity-40" style={{ color: '#1d6f42' }}>
                <FileSpreadsheet size={13} /> Excel
              </button>
              <button onClick={frekYazdir} disabled={!filtreFrek.length}
                className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa] flex items-center gap-2 disabled:opacity-40" style={{ color: '#185a9b' }}>
                <Printer size={13} /> Yazdır
              </button>
              {yetki.silebilir && <button onClick={() => { setTopluSilSekme('frekansiyel'); setTopluSilFrom(''); setTopluSilTo('') }}
                className="border px-3 py-2 rounded-[10px] text-[13px] flex items-center gap-2" style={{ borderColor:'#fca5a5', background:'#fff1f2', color:'#dc2626', fontWeight:600 }}>
                <Trash2 size={13} /> Kayıtları Sil
              </button>}
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
            <button onClick={() => { setFrekSayfa(1); yukle_frekansiyel(1) }} disabled={frekLoading} style={applyBtn}>
              <RefreshCw size={12} style={frekLoading ? spinning : {}} /> Uygula
            </button>
            <button onClick={() => { setFrekQ(''); setFrekDurum(''); setFrekNeden(''); setFrekFrom(''); setFrekTo(''); setFrekSayfa(1) }}
              className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa]">
              Temizle
            </button>
          </div>

          <div className="verde-table-wrap" style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
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
                    <td style={{ fontWeight: 600, color: r.simule_tamamlandi ? '#9ca3af' : undefined }}>{r.tanim}</td>
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
                      {yetki.duzenleyebilir && <button onClick={() => frekRestore(r)} title="Geri Yükle" style={aksBtn('#374151','#e8f4e8')}><RotateCcw size={13} /></button>}
                      {yetki.silebilir && <button onClick={() => frekSil(r)}     title="Kalıcı Sil" style={aksBtn('#c0392b','#fde8e8')}><Trash2 size={13} /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {frekToplamSayfa > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}>
              <button onClick={() => { setFrekSayfa(1); yukle_frekansiyel(1) }} disabled={frekSayfa === 1 || frekLoading}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: frekSayfa === 1 ? 0.4 : 1 }}>
                «
              </button>
              <button onClick={() => { const p = Math.max(1, frekSayfa - 1); setFrekSayfa(p); yukle_frekansiyel(p) }} disabled={frekSayfa === 1 || frekLoading}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: frekSayfa === 1 ? 0.4 : 1 }}>
                ‹ Önceki
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{frekSayfa} / {frekToplamSayfa}</span>
              <button onClick={() => { const p = Math.min(frekToplamSayfa, frekSayfa + 1); setFrekSayfa(p); yukle_frekansiyel(p) }} disabled={frekSayfa >= frekToplamSayfa || frekLoading}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: frekSayfa >= frekToplamSayfa ? 0.4 : 1 }}>
                Sonraki ›
              </button>
              <button onClick={() => { setFrekSayfa(frekToplamSayfa); yukle_frekansiyel(frekToplamSayfa) }} disabled={frekSayfa >= frekToplamSayfa || frekLoading}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: frekSayfa >= frekToplamSayfa ? 0.4 : 1 }}>
                »
              </button>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
          2 — PERSONEL TAKİBİ ARŞİVİ
      ═══════════════════════════════════════════════════════════ */}
      {firmaId && aktifSekme === 'personel' && (
        <>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexWrap:'wrap', gap:8 }}>
            <span style={{ fontSize:13, color:'#64748b' }}><strong style={{ color:'#1f2937' }}>{filtrePersonel.length}</strong> kayıt</span>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => csvIndir('personel', ['Personel','Email','Tarih','İş Başı','İş Bitimi','Çalışma Süresi'],
                filtrePersonel.map((r:any) => [r.isim_soyisim,r.email,r.kayit_tarihi,saat(r.giris_saati),saat(r.cikis_saati),sureFmt(r.giris_saati,r.cikis_saati)]))}
                disabled={!filtrePersonel.length} className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa] flex items-center gap-2 disabled:opacity-40">
                <Download size={13} /> CSV
              </button>
              <button onClick={async () => {
                const ExcelJS = (await import('exceljs')).default
                const wb = new ExcelJS.Workbook(); wb.creator = 'İOGYS'
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
                className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa] flex items-center gap-2 disabled:opacity-40" style={{ color:'#1d6f42' }}>
                <FileSpreadsheet size={13} /> Excel
              </button>
              <button onClick={() => {
                const rows = filtrePersonel.map((r:any) =>
                  `<tr><td>${r.isim_soyisim}</td><td>${r.email}</td><td>${r.kayit_tarihi}</td><td>${saat(r.giris_saati)}</td><td>${saat(r.cikis_saati)}</td><td>${sureFmt(r.giris_saati,r.cikis_saati)}</td></tr>`).join('')
                const w = window.open('','_blank','width=1000,height=700'); if (!w) return
                w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><title>Personel Arşivi</title>
                  <style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}table{width:100%;border-collapse:collapse}
                  th{background:#e5e7eb;color:#1f2937;font-weight:700;padding:6px 8px;border:1px solid #d1d5db;text-align:left}
                  td{padding:5px 8px;border:1px solid #e5e7eb}tr:nth-child(even)td{background:#fafafa}</style>
                  </head><body><h2 style="color:#1f2937">Personel Takibi Arşivi</h2>
                  <table><thead><tr><th>Personel</th><th>Email</th><th>Tarih</th><th>İş Başı</th><th>İş Bitimi</th><th>Çalışma Süresi</th></tr></thead>
                  <tbody>${rows}</tbody></table></body></html>`)
                w.document.close(); setTimeout(() => w.print(), 400)
              }} disabled={!filtrePersonel.length}
                className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa] flex items-center gap-2 disabled:opacity-40" style={{ color:'#185a9b' }}>
                <Printer size={13} /> Yazdır
              </button>
              {yetki.silebilir && <button onClick={() => { setTopluSilSekme('personel'); setTopluSilFrom(''); setTopluSilTo('') }}
                className="border px-3 py-2 rounded-[10px] text-[13px] flex items-center gap-2" style={{ borderColor:'#fca5a5', background:'#fff1f2', color:'#dc2626', fontWeight:600 }}>
                <Trash2 size={13} /> Kayıtları Sil
              </button>}
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
            <button onClick={() => { setPersonelQ(''); setPersonelFrom(''); setPersonelTo('') }}
              className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa]">
              Temizle
            </button>
          </div>

          <div className="verde-table-wrap" style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
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
                    <td style={{ color: r.cikis_saati ? '#111827' : '#94a3b8' }}>{saat(r.cikis_saati)}</td>
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
            <span style={{ fontSize:13, color:'#64748b' }}><strong style={{ color:'#1f2937' }}>{filtreMusteri.length}</strong> kayıt</span>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => csvIndir('musteri', ['Tarih','Lokasyon','Puan','Yorum','Ad Soyad'],
                filtreMusteri.map((r:any) => [r.olusturma_tarihi,r.lokasyon_yol,String(r.yildiz),r.yorum??'',r.ad_soyad??'']))}
                disabled={!filtreMusteri.length} className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa] flex items-center gap-2 disabled:opacity-40">
                <Download size={13} /> CSV
              </button>
              <button onClick={async () => {
                const ExcelJS = (await import('exceljs')).default
                const wb = new ExcelJS.Workbook(); wb.creator = 'İOGYS'
                const ws = wb.addWorksheet('Müşteri Değerlendirme Arşivi')
                ws.columns = [
                  { header: 'Tarih', key: 'tarih', width: 20 }, { header: 'Lokasyon', key: 'lokasyon', width: 24 },
                  { header: 'Puan', key: 'puan', width: 8 },
                  { header: 'Yorum', key: 'yorum', width: 60 }, { header: 'Ad Soyad', key: 'ad', width: 20 },
                ]
                const hr = ws.getRow(1); hr.font = { bold: true, color: { argb: 'FF1F6B1F' } }; hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCF0DC' } }; hr.height = 20
                filtreMusteri.forEach((r:any) => ws.addRow({ tarih: r.olusturma_tarihi, lokasyon: r.lokasyon_yol, puan: r.yildiz, yorum: r.yorum??'', ad: r.ad_soyad??'' }))
                const buf = await wb.xlsx.writeBuffer(); const a = document.createElement('a')
                a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
                a.download = `musteri-degerlendirme-arsiv-${new Date().toISOString().slice(0,10)}.xlsx`; a.click(); URL.revokeObjectURL(a.href)
              }} disabled={!filtreMusteri.length}
                className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa] flex items-center gap-2 disabled:opacity-40" style={{ color:'#1d6f42' }}>
                <FileSpreadsheet size={13} /> Excel
              </button>
              <button onClick={() => {
                const rows = filtreMusteri.map((r:any) =>
                  `<tr><td>${new Date(r.olusturma_tarihi).toLocaleString('tr-TR')}</td><td>${r.lokasyon_yol}</td><td>${'★'.repeat(r.yildiz)}</td><td>${r.yorum??'—'}</td><td>${r.ad_soyad??'—'}</td></tr>`).join('')
                const w = window.open('','_blank','width=1000,height=700'); if (!w) return
                w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><title>Müşteri Değerlendirme Arşivi</title>
                  <style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}table{width:100%;border-collapse:collapse}
                  th{background:#e5e7eb;color:#1f2937;font-weight:700;padding:6px 8px;border:1px solid #d1d5db;text-align:left}
                  td{padding:5px 8px;border:1px solid #e5e7eb}tr:nth-child(even)td{background:#fafafa}</style>
                  </head><body><h2 style="color:#1f2937">Müşteri Değerlendirmeleri Arşivi</h2>
                  <table><thead><tr><th>Tarih</th><th>Lokasyon</th><th>Puan</th><th>Yorum</th><th>Ad Soyad</th></tr></thead>
                  <tbody>${rows}</tbody></table></body></html>`)
                w.document.close(); setTimeout(() => w.print(), 400)
              }} disabled={!filtreMusteri.length}
                className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa] flex items-center gap-2 disabled:opacity-40" style={{ color:'#185a9b' }}>
                <Printer size={13} /> Yazdır
              </button>
              {yetki.silebilir && <button onClick={() => { setTopluSilSekme('musteri'); setTopluSilFrom(''); setTopluSilTo('') }}
                className="border px-3 py-2 rounded-[10px] text-[13px] flex items-center gap-2" style={{ borderColor:'#fca5a5', background:'#fff1f2', color:'#dc2626', fontWeight:600 }}>
                <Trash2 size={13} /> Kayıtları Sil
              </button>}
            </div>
          </div>

          <div style={filterRow}>
            <input className="verde-input" placeholder="Lokasyon / yorum / ad ara…" value={musteriQ} onChange={e => setMusteriQ(e.target.value)} style={{ ...inp, flex:'1 1 180px' }} />
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
            <button onClick={() => { setMusteriQ(''); setMusteriYildiz(0); setMusteriFrom(''); setMusteriTo('') }}
              className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa]">
              Temizle
            </button>
          </div>

          <div className="verde-table-wrap" style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
            <table className="verde-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                <col style={{ width: 140 }} />
                <col style={{ width: 220 }} />
                <col style={{ width: 130 }} />
                <col />
                <col style={{ width: 160 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 90 }} />
              </colgroup>
              <thead><tr>
                <th>Tarih</th><th>Lokasyon</th><th>Puan</th>
                <th>Yorum</th><th>Ad Soyad</th><th>Arşivlenme</th>
                <th style={{ textAlign:'center' }}>İşlem</th>
              </tr></thead>
              <tbody>
                {musteriLoading ? <YukleniyorSatir cols={7} /> :
                 filtreMusteri.length === 0 ? <BosKayit cols={7} mesaj="Müşteri değerlendirme arşivi boş." /> :
                 filtreMusteri.map((r: any) => (
                  <tr key={r.id}>
                    <td style={{ whiteSpace:'nowrap', color:'#64748b', fontSize:13 }}>
                      {new Date(r.olusturma_tarihi).toLocaleString('tr-TR',{ day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                    </td>
                    <td style={{ fontWeight:600, fontSize:13 }}>{r.lokasyon_yol}</td>
                    <td style={{ whiteSpace:'nowrap' }}>
                      <span style={{ fontSize:16, letterSpacing:1, color:'#f59e0b' }}>{'★'.repeat(r.yildiz)}</span>
                      <span style={{ fontSize:13, color:'#64748b', marginLeft:6, fontWeight:600 }}>{YILDIZ_ETIKET[r.yildiz]}</span>
                    </td>
                    <td style={{ color:'#334155', fontSize:13.5, lineHeight:1.45 }}>
                      <span title={r.yorum??''} style={{ display:'-webkit-box', WebkitLineClamp:3, WebkitBoxOrient:'vertical' as any, overflow:'hidden' }}>
                        {r.yorum || <span style={{ color:'#cbd5e1' }}>—</span>}
                      </span>
                    </td>
                    <td style={{ color: r.ad_soyad?'#111827':'#cbd5e1', fontSize:14 }}>{r.ad_soyad||'—'}</td>
                    <td style={{ fontSize:13, color:'#94a3b8', whiteSpace:'nowrap' }}>{r.arsivleme_tarihi ? formatDateTime(r.arsivleme_tarihi) : '—'}</td>
                    <td><div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                      {yetki.duzenleyebilir && <button onClick={() => musteriCikar(r)} title="Arşivden Çıkar" style={aksBtn('#d97706','#fef3c7')}><RotateCcw size={13} /></button>}
                      {yetki.silebilir && <button onClick={() => musteriSil(r)}   title="Kalıcı Sil"    style={aksBtn('#c0392b','#fde8e8')}><Trash2 size={13} /></button>}
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
            <span style={{ fontSize:13, color:'#64748b' }}><strong style={{ color:'#1f2937' }}>{filtreSpesifik.length}</strong> kayıt</span>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => csvIndir('spesifik', ['Görev','Lokasyon','Atanan','Durum','Oluşturma','Tamamlanma'],
                filtreSpesifik.map((r:any) => [r.tanim,r.lokasyonlar?.tanim??'',r.atanan?.isim_soyisim??'',r.durum,r.olusturma_tarihi,r.tamamlanma_tarihi??'']))}
                disabled={!filtreSpesifik.length} className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa] flex items-center gap-2 disabled:opacity-40">
                <Download size={13} /> CSV
              </button>
              <button onClick={async () => {
                const ExcelJS = (await import('exceljs')).default
                const wb = new ExcelJS.Workbook(); wb.creator = 'İOGYS'
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
                className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa] flex items-center gap-2 disabled:opacity-40" style={{ color:'#1d6f42' }}>
                <FileSpreadsheet size={13} /> Excel
              </button>
              <button onClick={() => {
                const rows = filtreSpesifik.map((r:any) =>
                  `<tr><td>${r.tanim}</td><td>${r.lokasyonlar?.tanim??'—'}</td><td>${r.atanan?.isim_soyisim??'—'}</td><td>${r.durum}</td><td>${r.olusturma_tarihi ? formatDateTime(r.olusturma_tarihi) : '—'}</td><td>${r.tamamlanma_tarihi ? formatDateTime(r.tamamlanma_tarihi) : '—'}</td></tr>`).join('')
                const w = window.open('','_blank','width=1000,height=700'); if (!w) return
                w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/><title>Spesifik Görevler Arşivi</title>
                  <style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}table{width:100%;border-collapse:collapse}
                  th{background:#e5e7eb;color:#1f2937;font-weight:700;padding:6px 8px;border:1px solid #d1d5db;text-align:left}
                  td{padding:5px 8px;border:1px solid #e5e7eb}tr:nth-child(even)td{background:#fafafa}</style>
                  </head><body><h2 style="color:#1f2937">Spesifik Görevler Arşivi</h2>
                  <table><thead><tr><th>Görev</th><th>Lokasyon</th><th>Atanan</th><th>Durum</th><th>Oluşturma</th><th>Tamamlanma</th></tr></thead>
                  <tbody>${rows}</tbody></table></body></html>`)
                w.document.close(); setTimeout(() => w.print(), 400)
              }} disabled={!filtreSpesifik.length}
                className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa] flex items-center gap-2 disabled:opacity-40" style={{ color:'#185a9b' }}>
                <Printer size={13} /> Yazdır
              </button>
              {yetki.silebilir && <button onClick={() => { setTopluSilSekme('spesifik'); setTopluSilFrom(''); setTopluSilTo('') }}
                className="border px-3 py-2 rounded-[10px] text-[13px] flex items-center gap-2" style={{ borderColor:'#fca5a5', background:'#fff1f2', color:'#dc2626', fontWeight:600 }}>
                <Trash2 size={13} /> Kayıtları Sil
              </button>}
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
            <button onClick={() => { setSpesifikQ(''); setSpesifikFrom(''); setSpesifikTo('') }}
              className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa]">
              Temizle
            </button>
          </div>

          <div className="verde-table-wrap" style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
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
                      {yetki.duzenleyebilir && <button onClick={() => spesifikRestore(r)} title="Geri Yükle" style={aksBtn('#374151','#e8f4e8')}><RotateCcw size={13} /></button>}
                      {yetki.silebilir && <button onClick={() => spesifikSil(r)}     title="Kalıcı Sil" style={aksBtn('#c0392b','#fde8e8')}><Trash2 size={13} /></button>}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
          5 — ÇEKLİST RAPORLARI (ARŞİV)
      ═══════════════════════════════════════════════════════════ */}
      {firmaId && aktifSekme === 'ceklist' && (
        <CeklistArsivSekme
          firmaId={firmaId}
          projeId={projeId}
          getLocPath={getLocPath}
        />
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
              <div style={{ background:'#f9fafb', border:'1px solid #fed7aa', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#9a3412', marginBottom:16 }}>
                ⚠️ Bu işlem geri alınamaz. Seçilen aralıktaki tüm kayıtlar veritabanından kalıcı olarak silinir.
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={topluSilUygula} disabled={topluSilYukleniyor}
                  style={{ flex:1, height:38, borderRadius:8, border:'none', background:'#dc2626', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, opacity: topluSilYukleniyor ? 0.7 : 1 }}>
                  {topluSilYukleniyor ? (
                    <><RefreshCw size={13} style={spinning} /> {topluSilProgress ? `Siliniyor… ${topluSilProgress.done}/${topluSilProgress.total}` : 'Siliniyor…'}</>
                  ) : <><Trash2 size={13} /> Kalıcı Sil</>}
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

// ═══════════════════════════════════════════════════════════════════════════
// CeklistArsivSekme — Arşiv içindeki Çeklist Raporları sekmesi
// Raporlar sayfasındaki 24 saat penceresini aşan (durum değişimine göre) çeklist kayıtları.
// ═══════════════════════════════════════════════════════════════════════════

const CEKLIST_DURUM_LABEL: Record<string, string> = {
  TAMAMLANDI: 'Tamamlandı',
  ZAMANINDA_YAPILAMAYAN: 'Gecikmeli Tamamlandı',
}

const CEKLIST_DURUM_RENK: Record<string, { bg: string; color: string }> = {
  TAMAMLANDI:            { bg: '#dcfce7', color: '#166534' },
  ZAMANINDA_YAPILAMAYAN: { bg: '#fef9c3', color: '#854d0e' },
}

// Kanal rozetleri shared helper'da — components/shared/KanalBadge.tsx
const CEKLIST_KANAL_RENK = KANAL_RENK
const CEKLIST_KANAL_LABEL = KANAL_LABEL

function ckPct(dol: number, top: number) {
  if (!top) return 0
  return Math.round((dol / top) * 100)
}

function CeklistArsivSekme({
  firmaId,
  projeId,
  getLocPath,
}: {
  firmaId: string
  projeId: string | null
  getLocPath: (id: string | null | undefined) => string
}) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const yetki = useYetki('arsiv')
  const [data,       setData]       = useState<any[]>([])
  const [ckTotal,    setCkTotal]    = useState(0)
  const [loading,    setLoading]    = useState(false)
  const [islemId,    setIslemId]    = useState<string | null>(null)
  const [topluSilYuk, setTopluSilYuk] = useState(false)
  const [aramaQ,     setAramaQ]     = useState('')
  const [durumF,     setDurumF]     = useState('')
  const [kanaliF,    setKanaliF]    = useState('')
  const [fromD,      setFromD]      = useState('')
  const [toD,        setToD]        = useState('')
  const [modal,      setModal]      = useState<{ id: string } | null>(null)
  const [ckSayfa,    setCkSayfa]    = useState(1)
  const CK_PER_PAGE = 50

  const yukle = useCallback(async (sayfa?: number) => {
    setLoading(true)
    try {
      const pg = sayfa ?? ckSayfa
      const p = new URLSearchParams({ firma_id: firmaId, page: String(pg), limit: String(CK_PER_PAGE) })
      if (projeId) p.set('proje_id', projeId)
      if (aramaQ.trim()) p.set('q', aramaQ.trim())
      if (fromD) p.set('from', fromD)
      if (toD) p.set('to', toD)
      const res = await fetch(`/api/arsiv/ceklist?${p}`)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json.data ?? [])
      setCkTotal(json.total ?? 0)
    } catch (e: any) {
      toast({ type: 'error', title: 'Yüklenemedi', message: e.message })
    } finally {
      setLoading(false)
    }
  }, [firmaId, projeId, ckSayfa, aramaQ, fromD, toD])

  useEffect(() => { yukle() }, [yukle])

  // Client-side durum/kanal filtresi (hafif — sadece sayfa verisi üzerinde)
  const filtre = useMemo(() => {
    return data.filter((r: any) => {
      if (durumF && r.gorev_durum !== durumF) return false
      if (kanaliF && r.kanal !== kanaliF) return false
      return true
    })
  }, [data, durumF, kanaliF])

  const ckToplamSayfa = Math.max(1, Math.ceil(ckTotal / CK_PER_PAGE))

  const inp: React.CSSProperties = {
    height: 34, padding: '0 10px', borderRadius: 8,
    border: '1px solid #e2e8f0', fontSize: 13, background: '#fff',
  }
  const applyBtn: React.CSSProperties = {
    ...inp, background: '#1f2937', color: '#fff', border: 'none',
    fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
  }
  const spinning: React.CSSProperties = { animation: 'spin 0.9s linear infinite' }

  // ── Toplu Sil ────────────────────────────────────────────────────────────
  async function topluSil() {
    const ok = await confirm({
      title: 'Tüm Çeklist Kayıtlarını Sil',
      message: 'Arşivdeki tüm çeklist kayıtları kalıcı olarak silinecek. Bu işlem geri alınamaz. Onaylıyor musunuz?',
      confirmText: 'Evet, Kalıcı Sil',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return
    setTopluSilYuk(true)
    try {
      const res  = await fetch('/api/raporlar/ceklist-arsiv-islem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toplu-sil', firma_id: firmaId, proje_id: projeId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ type: 'success', title: 'Silindi', message: `${json.silinen} kayıt silindi.` })
      await yukle()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setTopluSilYuk(false)
    }
  }

  // ── Tekil Sil ────────────────────────────────────────────────────────────
  async function tekSil(r: any) {
    const ok = await confirm({
      title: 'Çeklist Kaydını Sil',
      message: `"${r.gorev_tanim}" görevine ait çeklist kaydı kalıcı olarak silinecek. Onaylıyor musunuz?`,
      confirmText: 'Evet, Sil',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return
    setIslemId(r.id)
    try {
      const res  = await fetch('/api/raporlar/ceklist-arsiv-islem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sil', id: r.id, firma_id: firmaId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ type: 'success', title: 'Silindi', message: 'Çeklist kaydı silindi.' })
      await yukle()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setIslemId(null)
    }
  }

  // ── Geri Yükle ───────────────────────────────────────────────────────────
  async function geriYukle(r: any) {
    const ok = await confirm({
      title: 'Görevi Geri Yükle',
      message: `"${r.gorev_tanim}" görevi ve çeklist kaydı arşivden ilgili tabloya geri taşınacak. Onaylıyor musunuz?`,
      confirmText: 'Evet, Geri Yükle',
      cancelText: 'İptal',
    })
    if (!ok) return
    setIslemId(r.id)
    try {
      const res  = await fetch('/api/raporlar/ceklist-arsiv-islem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'geri-yukle',
          id: r.id,
          gorev_id: r.gorev_id,
          gorev_task_type: r.gorev_task_type ?? 'canli_gorevler',
          firma_id: firmaId,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ type: 'success', title: 'Geri Yüklendi', message: 'Görev ve çeklist başarıyla geri yüklendi.' })
      await yukle()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setIslemId(null)
    }
  }

  // ── Dışa aktar ───────────────────────────────────────────────────────────
  function csvIndir2() {
    const headers = ['Kayıt Tarihi', 'Görev', 'Lokasyon', 'Şablon', 'Durum', 'Kanal', 'Dolduran', 'Doldurulma %']
    const rows = filtre.map((r: any) => [
      r.kayit_tarihi ? formatDateTime(r.kayit_tarihi) : '',
      r.gorev_tanim, r.lokasyon_yol, r.sablon_adi,
      CEKLIST_DURUM_LABEL[r.gorev_durum] ?? r.gorev_durum,
      r.kanal, r.kullanici,
      `%${ckPct(r.doldurulan_madde, r.toplam_madde)}`,
    ])
    const csv = [headers, ...rows]
      .map(row => row.map((c: string) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `ceklist-arsiv-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(a.href)
  }

  async function excelIndir2() {
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(); wb.creator = 'İOGYS'
    const ws = wb.addWorksheet('Çeklist Raporları Arşiv')
    ws.columns = [
      { header: 'Kayıt Tarihi',  key: 'kayit',     width: 20 },
      { header: 'Görev',         key: 'gorev',     width: 32 },
      { header: 'Lokasyon',      key: 'lokasyon',  width: 24 },
      { header: 'Şablon',        key: 'sablon',    width: 24 },
      { header: 'Durum',         key: 'durum',     width: 22 },
      { header: 'Kanal',         key: 'kanal',     width: 10 },
      { header: 'Dolduran',      key: 'kullanici', width: 20 },
      { header: 'Doldurulma %',  key: 'oran',      width: 14 },
    ]
    const hr = ws.getRow(1)
    hr.font = { bold: true, color: { argb: 'FF1F6B1F' } }
    hr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCF0DC' } }
    hr.height = 20
    filtre.forEach((r: any) => ws.addRow({
      kayit:     r.kayit_tarihi ? formatDateTime(r.kayit_tarihi) : '',
      gorev:     r.gorev_tanim,
      lokasyon:  r.lokasyon_yol,
      sablon:    r.sablon_adi,
      durum:     CEKLIST_DURUM_LABEL[r.gorev_durum] ?? r.gorev_durum,
      kanal:     r.kanal,
      kullanici: r.kullanici,
      oran:      `%${ckPct(r.doldurulan_madde, r.toplam_madde)}`,
    }))
    const buf = await wb.xlsx.writeBuffer()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    a.download = `ceklist-arsiv-${new Date().toISOString().slice(0, 10)}.xlsx`
    a.click(); URL.revokeObjectURL(a.href)
  }

  function yazdir2() {
    const rows = filtre.map((r: any) =>
      `<tr>
        <td>${r.kayit_tarihi ? formatDateTime(r.kayit_tarihi) : '—'}</td>
        <td>${r.gorev_tanim}</td><td>${r.lokasyon_yol}</td>
        <td>${r.sablon_adi}</td>
        <td>${CEKLIST_DURUM_LABEL[r.gorev_durum] ?? r.gorev_durum}</td>
        <td>${r.kanal}</td><td>${r.kullanici}</td>
        <td>%${ckPct(r.doldurulan_madde, r.toplam_madde)} (${r.doldurulan_madde}/${r.toplam_madde})</td>
      </tr>`
    ).join('')
    const w = window.open('', '_blank', 'width=1100,height=700')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"/>
      <title>Çeklist Raporları Arşivi</title>
      <style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}
      table{width:100%;border-collapse:collapse}
      th{background:#e5e7eb;color:#1f2937;font-weight:700;padding:6px 8px;border:1px solid #d1d5db;text-align:left}
      td{padding:5px 8px;border:1px solid #e5e7eb}tr:nth-child(even)td{background:#fafafa}</style>
      </head><body><h2 style="color:#1f2937">Çeklist Raporları Arşivi</h2>
      <table><thead><tr>
        <th>Kayıt Tarihi</th><th>Görev</th><th>Lokasyon</th><th>Şablon</th>
        <th>Durum</th><th>Kanal</th><th>Dolduran</th><th>Doldurulma</th>
      </tr></thead><tbody>${rows}</tbody></table></body></html>`)
    w.document.close(); setTimeout(() => w.print(), 400)
  }

  return (
    <>
      {/* Üst bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>
          <strong style={{ color: '#1f2937' }}>{ckTotal}</strong> kayıt · Sayfa {ckSayfa}/{ckToplamSayfa}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={csvIndir2} disabled={!filtre.length}
            className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa] flex items-center gap-2 disabled:opacity-40">
            <Download size={13} /> CSV
          </button>
          <button onClick={excelIndir2} disabled={!filtre.length}
            className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa] flex items-center gap-2 disabled:opacity-40"
            style={{ color: '#1d6f42' }}>
            <FileSpreadsheet size={13} /> Excel
          </button>
          <button onClick={yazdir2} disabled={!filtre.length}
            className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa] flex items-center gap-2 disabled:opacity-40"
            style={{ color: '#185a9b' }}>
            <Printer size={13} /> Yazdır
          </button>
          {/* Kayıtları Sil */}
          {yetki.silebilir && <button
            onClick={topluSil}
            disabled={topluSilYuk || data.length === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '0 14px', height: 36, borderRadius: 10,
              border: '1px solid #fca5a5', background: '#fff1f2',
              color: '#dc2626', fontWeight: 700, fontSize: 13,
              cursor: 'pointer', opacity: (topluSilYuk || data.length === 0) ? 0.5 : 1,
            }}>
            {topluSilYuk
              ? <><RefreshCw size={13} style={spinning} /> Siliniyor…</>
              : <><Trash2 size={13} /> Kayıtları Sil</>}
          </button>}
        </div>
      </div>

      {/* Filtre satırı */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
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
        <select value={kanaliF} onChange={e => setKanaliF(e.target.value)} style={{ ...inp, minWidth: 130 }}>
          <option value="">Kanal (Tümü)</option>
          <option value="WEB">WEB</option>
          <option value="QR">QR</option>
          <option value="NFC">NFC</option>
          <option value="MOBİL">MOBİL</option>
          <option value="OFFLINE">Çevrimdışı</option>
        </select>
        <input type="date" value={fromD} onChange={e => setFromD(e.target.value)} style={inp} />
        <span style={{ color: '#94a3b8' }}>—</span>
        <input type="date" value={toD} onChange={e => setToD(e.target.value)} style={inp} />
        <button onClick={() => { setCkSayfa(1); yukle(1) }} disabled={loading} style={applyBtn}>
          <RefreshCw size={12} style={loading ? spinning : {}} /> Uygula
        </button>
        <button
          onClick={() => { setAramaQ(''); setDurumF(''); setKanaliF(''); setFromD(''); setToD(''); setCkSayfa(1) }}
          className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[13px] hover:bg-[#fafafa]">
          Temizle
        </button>
      </div>

      {/* Tablo */}
      <div className="verde-table-wrap" style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
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
              <th style={{ textAlign: 'center' }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center' }}>
                <RefreshCw size={20} style={{ ...spinning, color: '#1f2937', display: 'block', margin: '0 auto' }} />
              </td></tr>
            ) : filtre.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
                Çeklist arşiv kaydı bulunamadı.
              </td></tr>
            ) : (
              filtre.map((r: any) => {
                const durumS   = CEKLIST_DURUM_RENK[r.gorev_durum] ?? { bg: '#f1f5f9', color: '#475569' }
                const kanalS   = CEKLIST_KANAL_RENK[r.kanal] ?? { bg: '#f1f5f9', color: '#475569' }
                const oran     = ckPct(r.doldurulan_madde, r.toplam_madde)
                const oranColor = oran === 100 ? '#166534' : oran >= 60 ? '#d97706' : '#dc2626'
                const busy     = islemId === r.id
                return (
                  <tr key={r.id}>
                    <td style={{ whiteSpace: 'nowrap', color: '#94a3b8', fontSize: 12 }}>
                      {r.kayit_tarihi ? formatDateTime(r.kayit_tarihi) : '—'}
                    </td>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>{r.gorev_tanim}</td>
                    <td style={{ color: '#64748b', fontSize: 12.5 }}>{r.lokasyon_yol}</td>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{r.sablon_adi}</td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: 12, fontSize: 11.5, fontWeight: 700,
                        background: durumS.bg, color: durumS.color,
                      }}>
                        {CEKLIST_DURUM_LABEL[r.gorev_durum] ?? r.gorev_durum}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: 12, fontSize: 11.5, fontWeight: 700,
                        background: kanalS.bg, color: kanalS.color,
                      }}>
                        {CEKLIST_KANAL_LABEL[r.kanal] ?? r.kanal}
                      </span>
                    </td>
                    <td style={{ color: '#475569', fontSize: 12.5 }}>{r.kullanici}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: '#e2e8f0', borderRadius: 4, minWidth: 60 }}>
                          <div style={{
                            height: '100%', width: `${oran}%`, background: oranColor,
                            borderRadius: 4, transition: 'width .3s',
                          }} />
                        </div>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: oranColor, whiteSpace: 'nowrap' }}>
                          %{oran}
                        </span>
                        <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          ({r.doldurulan_madde}/{r.toplam_madde})
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                        {/* Çeklist Detayı */}
                        <button
                          onClick={() => setModal({ id: r.gorev_id })}
                          title="Çeklist Detayı"
                          disabled={busy}
                          style={{
                            width: 30, height: 30, border: 'none', borderRadius: 7,
                            background: '#e8f4e8', color: '#374151',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                          }}>
                          <ExternalLink size={13} />
                        </button>
                        {/* Sil */}
                        {yetki.silebilir && <button
                          onClick={() => tekSil(r)}
                          title="Sil"
                          disabled={busy}
                          style={{
                            width: 30, height: 30, border: 'none', borderRadius: 7,
                            background: busy ? '#f1f5f9' : '#fef2f2', color: busy ? '#94a3b8' : '#dc2626',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: busy ? 'not-allowed' : 'pointer',
                          }}>
                          <Trash2 size={13} />
                        </button>}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {ckToplamSayfa > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <button onClick={() => { setCkSayfa(1); yukle(1) }} disabled={ckSayfa === 1 || loading}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: ckSayfa === 1 ? 0.4 : 1 }}>
            «
          </button>
          <button onClick={() => { const pg = Math.max(1, ckSayfa - 1); setCkSayfa(pg); yukle(pg) }} disabled={ckSayfa === 1 || loading}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: ckSayfa === 1 ? 0.4 : 1 }}>
            ‹ Önceki
          </button>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{ckSayfa} / {ckToplamSayfa}</span>
          <button onClick={() => { const pg = Math.min(ckToplamSayfa, ckSayfa + 1); setCkSayfa(pg); yukle(pg) }} disabled={ckSayfa >= ckToplamSayfa || loading}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: ckSayfa >= ckToplamSayfa ? 0.4 : 1 }}>
            Sonraki ›
          </button>
          <button onClick={() => { setCkSayfa(ckToplamSayfa); yukle(ckToplamSayfa) }} disabled={ckSayfa >= ckToplamSayfa || loading}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: ckSayfa >= ckToplamSayfa ? 0.4 : 1 }}>
            »
          </button>
        </div>
      )}

      {/* Çeklist Detay Modal */}
      {modal && (
        <ChecklistModal
          taskId={modal.id}
          taskType="canli_gorevler"
          onKapat={() => setModal(null)}
        />
      )}
    </>
  )
}