'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { useToast } from '@/components/ui/ToastProvider'
import { useYetki } from '@/lib/yetki/useYetki'

const GUN_KISALT  = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
const GUN_TAM     = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
const IS_GUNLERI  = [1, 2, 3, 4, 5]
const TUM_GUNLER  = [0, 1, 2, 3, 4, 5, 6]

type OzetRow = { uretilen: number; tamamlandi: number; bekliyor: number; kayip: number }

type Props = {
  base: '/ta' | '/sa'
  firmaId: string | null
  meId: string
  initialKuralar: any[]
  lokasyonlar: { id: string; tanim: string; parent_id?: string | null; gunluk_frekans_sayisi?: number | null; haftalik_frekans_sayisi?: number | null }[]
  kullanicilar: { id: string; isim_soyisim: string }[]
  readonly: boolean
  embedded?: boolean
  projeId?: string | null
  personelAtamaAktif?: boolean
}

const BOSH_FORM = {
  tanim: '', lokasyon_id: '', lokasyon_idler: [] as string[], atanan_kullanici_id: '',
  frekans_tipi: 'gunluk' as 'gunluk' | 'haftalik',
  gunluk_frekans_sayisi: 1,
  haftalik_frekans_sayisi: 1,
  aktif_gunler: IS_GUNLERI,
  aktif_olma_saati: '08:00',
  baslangic_tarihi: new Date().toISOString().slice(0, 10),
  bitis_tarihi: '',
}

const lbl: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: '#4b5563', marginBottom: 5 }
const stepBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 6, border: '1.5px solid #e5e7eb',
  background: '#fafafa', cursor: 'pointer', fontSize: 18, fontWeight: 700,
  color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center',
}

export default function GorevKurallariClient({
  base, firmaId, meId, initialKuralar, lokasyonlar, kullanicilar, readonly, embedded = false, projeId, personelAtamaAktif = true
}: Props) {
  const { confirm } = useConfirm()
  const { toast }   = useToast()
  const yetki = useYetki('gorev-kurallari')

  const [kuralar, setKuralar]       = useState<any[]>(initialKuralar)
  const [duraklatModal, setDuraklatModal] = useState<{ kuralId: string; tanim: string } | null>(null)
  const [duraklatSaat, setDuraklatSaat]   = useState(24)
  const [duraklatNeden, setDuraklatNeden] = useState('')
  const [duraklatSaving, setDuraklatSaving] = useState(false)

  // Gruplar
  const [gruplar, setGruplar] = useState<any[]>([])
  const [grupUyeleri, setGrupUyeleri] = useState<any[]>([])
  const [acikUstLoklar, setAcikUstLoklar] = useState<Set<string>>(new Set())
  const [acikGruplar2, setAcikGruplar2] = useState<Set<string>>(new Set())
  const [acikTanimlar, setAcikTanimlar] = useState<Set<string>>(new Set())
  const [duraklatVardiyaModal, setDuraklatVardiyaModal] = useState<{ tanim: string; firmaId: string; projeId: string | null; aktifOlmaSaati: string } | null>(null)

  // Sekme içinde (embedded=true) kuralları API'den çek
  useEffect(() => {
    if (!embedded || !firmaId) return
    const params = new URLSearchParams({ firma_id: firmaId })
    if (projeId) params.set('proje_id', projeId)
    fetch(`/api/gorev-kurallari?${params.toString()}`)
      .then(r => r.json()).then(d => Array.isArray(d) && setKuralar(d)).catch(() => {})
  }, [embedded, firmaId, projeId])

  // Grupları yükle
  useEffect(() => {
    if (!firmaId) return
    const p = new URLSearchParams({ firmaId })
    if (projeId) p.set('projeId', projeId)
    fetch(`/api/location-groups?${p}`)
      .then(r => r.json())
      .then(j => {
        if (j.ok !== false) {
          setGruplar(j.groups ?? [])
          // grup_uyeleri: { grup_id, lokasyonIds[] }
          const uye: any[] = []
          for (const g of (j.groups ?? [])) {
            for (const lokId of (g.lokasyonIds ?? [])) {
              uye.push({ grup_id: g.id, lokasyon_id: lokId })
            }
          }
          setGrupUyeleri(uye)
        }
      }).catch(() => {})
  }, [firmaId, projeId])
  const [ozet, setOzet]             = useState<Record<string, OzetRow>>({})
  const [modal, setModal]           = useState<null | 'create' | 'edit'>(null)
  const [editId, setEditId]         = useState<string | null>(null)
  const [form, setForm]             = useState(BOSH_FORM)
  const [saving, setSaving]         = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [bulkDeleting, setBulkDeleting] = useState<{ key: string; total: number; done: number } | null>(null)
  const [q, setQ]                   = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting]   = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const lokMap = useMemo(() => {
    const m = new Map(lokasyonlar.map(l => [l.id, l]))
    function path(id: string): string {
      const l = m.get(id)
      if (!l) return '—'
      return l.parent_id && m.has(l.parent_id) ? path(l.parent_id) + ' › ' + l.tanim : l.tanim
    }
    const r = new Map<string, string>()
    lokasyonlar.forEach(l => r.set(l.id, path(l.id)))
    return r
  }, [lokasyonlar])

  // Kademeli lokasyon seçimi için
  const [lokSec, setLokSec] = useState<(string | null)[]>([null]) // her seviye için seçili id

  // Seçim değişince form.lokasyon_id'yi güncelle
  function handleLokSec(level: number, id: string) {
    setLokSec(prev => {
      const next = prev.slice(0, level + 1)
      next[level] = id || null
      return next
    })
    const hasChildren = lokasyonlar.some(l => l.parent_id === id)
    const seciliLok = lokasyonlar.find(l => l.id === id)
    const lokFrekans = seciliLok?.gunluk_frekans_sayisi ?? 1
    const lokHaftalik = seciliLok?.haftalik_frekans_sayisi ?? 1
    // Toplu seçim modunda (create) alt lokasyonları checkbox ile seçilecek
    if (modal === 'create' && hasChildren) {
      setForm(p => ({ ...p, lokasyon_id: '', lokasyon_idler: [] }))
    } else {
      setForm(p => ({
        ...p,
        lokasyon_id: hasChildren ? '' : id,
        lokasyon_idler: [],
        gunluk_frekans_sayisi: hasChildren ? p.gunluk_frekans_sayisi : lokFrekans,
        haftalik_frekans_sayisi: hasChildren ? p.haftalik_frekans_sayisi : (lokHaftalik > 0 ? lokHaftalik : 1),
      }))
    }
  }

  // Yaprak lokasyonları bul (seçili parent'ın altındaki çocuksuz lokasyonlar)
  function yaprakLokasyonlar(parentId: string): typeof lokasyonlar {
    const direkt = lokasyonlar.filter(l => l.parent_id === parentId)
    const result: typeof lokasyonlar = []
    for (const child of direkt) {
      const hasGrand = lokasyonlar.some(l => l.parent_id === child.id)
      if (!hasGrand) result.push(child)
      else result.push(...yaprakLokasyonlar(child.id))
    }
    return result
  }

  function toggleLokCheckbox(lokId: string) {
    setForm(p => {
      const idler = p.lokasyon_idler.includes(lokId)
        ? p.lokasyon_idler.filter(id => id !== lokId)
        : [...p.lokasyon_idler, lokId]
      return { ...p, lokasyon_idler: idler, lokasyon_id: idler.length === 1 ? idler[0] : '' }
    })
  }

  // level bazında gösterilecek çocuk listesi
  function childrenOf(parentId: string | null) {
    return lokasyonlar.filter(l => (l.parent_id ?? null) === parentId)
  }

  // Form açılınca mevcut lokasyon_id'yi seviyelere dök
  function initLokSec(lokId: string) {
    if (!lokId) { setLokSec([null]); return }
    const m = new Map(lokasyonlar.map(l => [l.id, l]))
    const chain: string[] = []
    let cur: string | null = lokId
    let g = 0
    while (cur && g++ < 10) {
      chain.unshift(cur)
      cur = m.get(cur)?.parent_id ?? null
    }
    // chain = [kök, ..., yaprak]
    // her seviye için seçili = chain[i]
    setLokSec(chain.map(id => id))
  }

  const [duraklatmalar, setDuraklatmalar] = useState<any[]>([])

  useEffect(() => {
    if (!firmaId) return
    fetch(`/api/gorev-kurallari/bugun-ozet?firma_id=${firmaId}`)
      .then(r => r.json()).then(setOzet).catch(() => {})
    // Aktif duraklatmaları çek
    const dp = new URLSearchParams({ firmaId })
    if (projeId) dp.set('projeId', projeId)
    fetch(`/api/gorev-kurallari/duraklat-vardiya?${dp}`)
      .then(r => r.json()).then(j => setDuraklatmalar(j.data ?? [])).catch(() => {})
  }, [firmaId, projeId])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return kuralar
    return kuralar.filter(k =>
      k.tanim?.toLowerCase().includes(s) ||
      lokMap.get(k.lokasyon_id)?.toLowerCase().includes(s)
    )
  }, [q, kuralar, lokMap])

  function gunEtiket(gunler: number[]) {
    const s = [...gunler].sort().join(',')
    if (s === '1,2,3,4,5') return 'Hafta içi'
    if (s === '0,1,2,3,4,5,6') return 'Her gün'
    if (s === '0,6') return 'Hafta sonu'
    return gunler.sort().map(g => GUN_KISALT[g]).join(', ')
  }

  function openCreate() { setForm(BOSH_FORM); setEditId(null); setLokSec([null]); setModal('create') }
  function openEdit(k: any) {
    setForm({
      tanim: k.tanim ?? '', lokasyon_id: k.lokasyon_id ?? '', lokasyon_idler: [],
      atanan_kullanici_id: k.atanan_kullanici_id ?? '',
      frekans_tipi: k.frekans_tipi === 'haftalik' ? 'haftalik' : 'gunluk',
      gunluk_frekans_sayisi: k.gunluk_frekans_sayisi ?? 1,
      haftalik_frekans_sayisi: k.haftalik_frekans_sayisi ?? 1,
      aktif_gunler: k.aktif_gunler ?? IS_GUNLERI,
      aktif_olma_saati: k.aktif_olma_saati?.slice(0, 5) ?? '08:00',
      baslangic_tarihi: k.baslangic_tarihi ?? new Date().toISOString().slice(0, 10),
      bitis_tarihi: k.bitis_tarihi ?? '',
    })
    initLokSec(k.lokasyon_id ?? '')
    setEditId(k.id); setModal('edit')
  }
  function toggleGun(g: number) {
    setForm(p => ({
      ...p,
      aktif_gunler: p.aktif_gunler.includes(g)
        ? p.aktif_gunler.filter(x => x !== g)
        : [...p.aktif_gunler, g].sort()
    }))
  }

  async function handleSave() {
    if (!form.tanim.trim()) return toast({ type: 'error', title: 'Hata', message: 'Tanım zorunlu' })
    if (!form.aktif_gunler.length) return toast({ type: 'error', title: 'Hata', message: 'En az bir gün seçin' })

    // Create modunda toplu lokasyon seçimi
    const lokIdler = modal === 'create' && form.lokasyon_idler.length > 0
      ? form.lokasyon_idler
      : form.lokasyon_id ? [form.lokasyon_id] : []

    if (lokIdler.length === 0) return toast({ type: 'error', title: 'Hata', message: 'En az bir lokasyon seçin' })

    // Haftalık kural: tüm lokasyonlarda Frekans Sayıları → Haftalık değeri dolu olmalı
    if (form.frekans_tipi === 'haftalik') {
      const eksikler = lokIdler.filter(id => {
        const l = lokasyonlar.find(x => x.id === id)
        const v = (l as any)?.haftalik_frekans_sayisi
        return !v || v < 1
      })
      if (eksikler.length > 0) {
        const isimler = eksikler.map(id => lokasyonlar.find(x => x.id === id)?.tanim ?? '—').join(', ')
        return toast({ type: 'error', title: 'Eksik haftalık frekans', message: `Önce Frekans Sayıları → Haftalık sekmesinden değer girin: ${isimler}` })
      }
      // Frekans ≤ izinli gün sayısı kontrolü
      const enBuyukFrekans = Math.max(...lokIdler.map(id => (lokasyonlar.find(x => x.id === id) as any)?.haftalik_frekans_sayisi ?? 0))
      if (enBuyukFrekans > form.aktif_gunler.length) {
        return toast({ type: 'error', title: 'Hata', message: `Haftalık frekans (${enBuyukFrekans}), izinli gün sayısından (${form.aktif_gunler.length}) fazla olamaz. Daha fazla gün seç veya frekansı düşür.` })
      }
    }

    setSaving(true)
    try {
      if (modal === 'create') {
        // Çoklu lokasyon: PARALEL POST — sequential 10x süreyi 1x'e indirir
        const isHaftalik = form.frekans_tipi === 'haftalik'
        const sonuclar = await Promise.all(lokIdler.map(async (lokId) => {
          const lok = lokasyonlar.find(l => l.id === lokId)
          const lokGunluk = (lok as any)?.gunluk_frekans_sayisi ?? 1
          const lokHaftalik = (lok as any)?.haftalik_frekans_sayisi ?? 0
          const body: any = {
            firma_id: firmaId, tanim: form.tanim.trim(), lokasyon_id: lokId,
            atanan_kullanici_id: form.atanan_kullanici_id || null,
            frekans_tipi: form.frekans_tipi,
            gunluk_frekans_sayisi: isHaftalik ? null : lokGunluk,
            haftalik_frekans_sayisi: isHaftalik ? lokHaftalik : null,
            aktif_gunler: form.aktif_gunler, aktif_olma_saati: form.aktif_olma_saati,
            baslangic_tarihi: form.baslangic_tarihi, bitis_tarihi: form.bitis_tarihi || null,
            ...(projeId ? { proje_id: projeId } : {}),
          }
          const res = await fetch('/api/gorev-kurallari', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || `Lokasyon ${lokId} için ekleme başarısız`)
          return data
        }))
        setKuralar(p => [...sonuclar, ...p])
        toast({ type: 'success', title: 'Başarılı', message: `${sonuclar.length} lokasyon için kural oluşturuldu` })
      } else if (modal === 'edit' && editId) {
        const isHaftalik = form.frekans_tipi === 'haftalik'
        const lok = lokasyonlar.find(l => l.id === lokIdler[0])
        const lokHaftalik = (lok as any)?.haftalik_frekans_sayisi ?? 0
        const lokGunluk = (lok as any)?.gunluk_frekans_sayisi ?? 1
        const body: any = {
          firma_id: firmaId, tanim: form.tanim.trim(), lokasyon_id: lokIdler[0],
          atanan_kullanici_id: form.atanan_kullanici_id || null,
          frekans_tipi: form.frekans_tipi,
          gunluk_frekans_sayisi: isHaftalik ? null : lokGunluk,
          haftalik_frekans_sayisi: isHaftalik ? lokHaftalik : null,
          aktif_gunler: form.aktif_gunler, aktif_olma_saati: form.aktif_olma_saati,
          baslangic_tarihi: form.baslangic_tarihi, bitis_tarihi: form.bitis_tarihi || null,
          ...(projeId ? { proje_id: projeId } : {}),
        }
        const res = await fetch(`/api/gorev-kurallari/${editId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error)
        setKuralar(p => p.map(k => k.id === editId ? { ...k, ...data } : k))
        toast({ type: 'success', title: 'Güncellendi', message: 'Kural güncellendi' })
      }
      setModal(null)
    } catch (e: any) { toast({ type: 'error', title: 'Hata', message: e.message }) }
    setSaving(false)
  }

  async function toggleAktif(k: any) {
    if (togglingId) return
    setTogglingId(k.id)
    try {
      const res = await fetch(`/api/gorev-kurallari/${k.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktif: !k.aktif }),
      })
      if (res.ok) {
        setKuralar(p => p.map(x => x.id === k.id ? { ...x, aktif: !k.aktif } : x))
        toast({ type: 'success', title: 'Güncellendi', message: k.aktif ? 'Pasife alındı' : 'Aktif edildi' })
      }
    } finally { setTogglingId(null) }
  }

  async function handleDuraklat() {
    if (!duraklatModal) return
    setDuraklatSaving(true)
    try {
      const res = await fetch(`/api/gorev-kurallari/${duraklatModal.kuralId}/duraklat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'duraklat', saat: duraklatSaat, neden: duraklatNeden }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error)
      setKuralar(p => p.map(k => k.id === duraklatModal.kuralId ? { ...k, duraklatma_bitis: j.duraklatma_bitis } : k))
      toast({ type: 'success', title: 'Duraklatıldı', message: j.message })
      setDuraklatModal(null); setDuraklatSaat(24); setDuraklatNeden('')
    } catch (e: any) { toast({ type: 'error', title: 'Hata', message: e.message }) }
    setDuraklatSaving(false)
  }

  async function handleDevam(k: any) {
    try {
      const res = await fetch(`/api/gorev-kurallari/${k.id}/duraklat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'devam' }),
      })
      if (res.ok) {
        setKuralar(p => p.map(x => x.id === k.id ? { ...x, duraklatma_bitis: null } : x))
        toast({ type: 'success', title: 'Devam', message: `"${k.tanim}" devam ediyor.` })
      }
    } catch {}
  }

  async function handleDelete(k: any) {
    const ok = await confirm({
      title: 'Kuralı Sil',
      message: `"${k.tanim}" silinsin mi?\n\nMevcut görevler etkilenmez, yalnızca yeni üretim durur.`,
      confirmText: 'Evet, Sil', cancelText: 'İptal', variant: 'danger',
    })
    if (!ok) return
    setDeletingId(k.id)
    try {
      const res = await fetch(`/api/gorev-kurallari/${k.id}`, { method: 'DELETE' })
      if (res.ok) {
        setKuralar(p => p.filter(x => x.id !== k.id))
        toast({ type: 'success', title: 'Silindi', message: `"${k.tanim}" silindi` })
      } else {
        toast({ type: 'error', title: 'Hata', message: (await res.json()).error })
      }
    } finally { setDeletingId(null) }
  }

  async function handleExport() {
    try {
      const qs = firmaId ? `?firmaId=${firmaId}` : ''
      const res = await fetch(`/api/import-export/gorev-kurallari/export${qs}`)
      if (!res.ok) throw new Error((await res.json()).error ?? 'İndirme başarısız')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = 'gorev-kurallari.xlsx'; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { toast({ type: 'error', title: 'Hata', message: e.message }) }
  }

  async function handleTemplate() {
    const res = await fetch('/api/import-export/gorev-kurallari/template')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'gorev-kural-sablonu.xlsx'; a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport() {
    if (!importFile) return
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', importFile)
      if (firmaId) fd.append('firmaId', firmaId)
      const res  = await fetch('/api/import-export/gorev-kurallari/import', { method: 'POST', body: fd, cache: 'no-store' })
      // Response JSON olmayabilir (proxy timeout, server crash vs.) — önce text al, sonra parse dene
      const rawText = await res.text()
      let data: any = {}
      try { data = JSON.parse(rawText) } catch {
        throw new Error(`Sunucu cevabı geçersiz (HTTP ${res.status}). Yanıt: ${rawText.slice(0, 300)}`)
      }
      if (!res.ok) throw new Error(data.error ?? `Import başarısız (HTTP ${res.status})`)
      const refreshRes = await fetch(`/api/gorev-kurallari?firma_id=${firmaId}&t=${Date.now()}`, { cache: 'no-store' })
      if (refreshRes.ok) setKuralar(await refreshRes.json())
      toast({
        type: 'success',
        title: 'Tamamlandı',
        message: `${data.created ?? 0} yeni eklendi` +
                 (data.updated ? `, ${data.updated} kural güncellendi` : '') +
                 (data.failed ? `, ${data.failed} satır atlandı` : ''),
      })
      setImportOpen(false); setImportFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e: any) { toast({ type: 'error', title: 'Hata', message: e.message }) }
    setImporting(false)
  }

  const genelOzet = useMemo(() => {
    let uretilen = 0, tamamlandi = 0, bekliyor = 0, kayip = 0
    kuralar.filter(k => k.aktif).forEach(k => {
      const o = ozet[k.id]
      if (o) { uretilen += o.uretilen; tamamlandi += o.tamamlandi; bekliyor += o.bekliyor; kayip += o.kayip }
    })
    return { uretilen, tamamlandi, bekliyor, kayip }
  }, [ozet, kuralar])

  return (
    <div style={embedded ? {} : { padding: '24px 28px' }}>

      {/* Üst bar */}
      <div className="verde-card" style={{ padding: '14px 18px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#111827' }}>GÖREV KURALLARI</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>Seçilen günlerde gece 00:01'de otomatik görev üretilir</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="verde-input" placeholder="Ara…" value={q} onChange={e => setQ(e.target.value)} style={{ minWidth: 160 }} />
          {!readonly && (<>
            <button className="verde-btn-outline-strong" style={{ fontSize: 12, padding: '5px 12px' }} onClick={handleTemplate}>⬇ Şablon</button>
            <button className="verde-btn-outline-strong" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setImportOpen(true)}>⬆ İçe Aktar</button>
            <button className="verde-btn-outline-strong" style={{ fontSize: 12, padding: '5px 12px' }} onClick={handleExport}>⇩ Dışa Aktar</button>
            {yetki.ekleyebilir && <button className="verde-btn-primary" onClick={openCreate}>+ Yeni Kural</button>}
          </>)}
        </div>
      </div>

      {/* Bugün özet kartlar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Bugün Üretilen', val: genelOzet.uretilen, color: '#0f4c81' },
          { label: 'Tamamlandı',     val: genelOzet.tamamlandi, color: '#374151' },
          { label: 'Bekliyor',       val: genelOzet.bekliyor,   color: '#374151' },
          { label: 'Kayıp / İptal',  val: genelOzet.kayip,      color: '#b91c1c' },
        ].map(({ label, val, color }) => (
          <div key={label} className="verde-card" style={{ padding: '12px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color }}>{val}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Hiyerarşik Kural Listesi: Üst Lokasyon > Grup > Lokasyon */}
      {(() => {
        // Hiyerarşi hesaplama (useMemo benzeri — IIFE ile optimize)
        const grupLokMap2 = new Map<string, Set<string>>()
        for (const u of grupUyeleri) {
          const s = grupLokMap2.get(u.grup_id) ?? new Set()
          s.add(u.lokasyon_id)
          grupLokMap2.set(u.grup_id, s)
        }

        // Kural lokasyon_id → Set (hızlı arama)
        const kuralLokIdSet = new Map<string, any[]>()
        for (const k of filtered) {
          const arr = kuralLokIdSet.get(k.lokasyon_id) ?? []
          arr.push(k)
          kuralLokIdSet.set(k.lokasyon_id, arr)
        }

        const ustLokasyonlar2 = lokasyonlar.filter(l => !l.parent_id).sort((a, b) => a.tanim.localeCompare(b.tanim, 'tr'))

        type TanimGrubu = { tanim: string; kurallar: any[] }
        type GrupNode = { grupId: string; grupAd: string; tanimlar: TanimGrubu[] }
        type HiyerarsiNode = { ustLok: string; ustLokTanim: string; gruplar: GrupNode[]; grupsuz: any[] }
        const hiyerarsi: HiyerarsiNode[] = []
        const eslesmisKuralIds = new Set<string>()

        for (const ustLok of ustLokasyonlar2) {
          const altGruplar = gruplar.filter((g: any) => g.ust_lokasyon_id === ustLok.id)
          const node: HiyerarsiNode = { ustLok: ustLok.id, ustLokTanim: ustLok.tanim, gruplar: [], grupsuz: [] }

          for (const g of altGruplar) {
            const lokIdSet = grupLokMap2.get(g.id)
            if (!lokIdSet || lokIdSet.size === 0) continue
            const grupKurallar: any[] = []
            lokIdSet.forEach(lokId => {
              const kk = kuralLokIdSet.get(lokId)
              if (kk) grupKurallar.push(...kk)
            })
            if (grupKurallar.length > 0) {
              const tanimMap = new Map<string, any[]>()
              for (const k of grupKurallar) {
                const t = k.tanim ?? '—'
                const arr = tanimMap.get(t) ?? []
                arr.push(k)
                tanimMap.set(t, arr)
                eslesmisKuralIds.add(k.id)
              }
              const tanimlar: TanimGrubu[] = [...tanimMap.entries()].map(([tanim, kurallar]) => ({ tanim, kurallar }))
              node.gruplar.push({ grupId: g.id, grupAd: g.ad, tanimlar })
            }
          }

          // Gruba dahil olmayan kurallar
          const tumGrupLokIds = new Set<string>()
          altGruplar.forEach((g: any) => { grupLokMap2.get(g.id)?.forEach(id => tumGrupLokIds.add(id)) })
          const altLokIds = new Set<string>()
          const queue: string[] = [ustLok.id]
          while (queue.length) {
            const cur = queue.shift()!
            for (const l of lokasyonlar) { if (l.parent_id === cur) { altLokIds.add(l.id); queue.push(l.id) } }
          }
          const grupsuzKurallar: any[] = []
          altLokIds.forEach(lokId => {
            if (tumGrupLokIds.has(lokId)) return
            const kk = kuralLokIdSet.get(lokId)
            if (kk) { grupsuzKurallar.push(...kk); kk.forEach(k => eslesmisKuralIds.add(k.id)) }
          })
          node.grupsuz = grupsuzKurallar

          if (node.gruplar.length > 0 || node.grupsuz.length > 0) hiyerarsi.push(node)
        }

        const kalanKurallar = filtered.filter(k => !eslesmisKuralIds.has(k.id))

        // Render helper: tek kural satırı
        // Duraklatma helper: tanım adına göre aktif duraklatma sayısı
        const duraklatmaSayisi = (tanim: string) => duraklatmalar.filter(d => d.tanim === tanim).length
        // Grup altındaki tüm tanımların duraklatma toplamı
        const grupDuraklatmaSayisi = (tanimlar: { tanim: string }[]) =>
          tanimlar.reduce((s, t) => s + duraklatmaSayisi(t.tanim), 0)

        const renderKuralSatir = (k: any, indent: number = 0) => {
          const o = ozet[k.id]
          const lokTanim = lokasyonlar.find(l => l.id === k.lokasyon_id)?.tanim ?? '—'
          return (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', paddingLeft: 14 + indent * 20, borderTop: '1px solid #f3f4f6', opacity: k.aktif ? 1 : 0.5, background: k.duraklatma_bitis && new Date(k.duraklatma_bitis).getTime() > Date.now() ? '#fffbeb' : '#fff', fontSize: 13 }}>
              <span style={{ color: '#d1d5db', flexShrink: 0 }}>└─</span>
              <span style={{ flex: 1, fontWeight: 500, color: '#374151', minWidth: 0 }}>
                {lokTanim}
                {k.duraklatma_bitis && new Date(k.duraklatma_bitis).getTime() > Date.now() && (
                  <span style={{ fontSize: 10, color: '#92400e', marginLeft: 6 }}>⏸</span>
                )}
              </span>
              {k.frekans_tipi === 'haftalik' ? (
                <span style={{ fontSize: 11.5, color: '#7c3aed', whiteSpace: 'nowrap', fontWeight: 700, background: '#faf5ff', padding: '1px 7px', borderRadius: 4, border: '1px solid #e9d5ff' }}>H:{k.haftalik_frekans_sayisi}× {k.aktif_olma_saati?.slice(0, 5) ?? ''}</span>
              ) : (
                <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>{k.gunluk_frekans_sayisi}× {k.aktif_olma_saati?.slice(0, 5) ?? ''}</span>
              )}
              <span style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>{gunEtiket(k.aktif_gunler ?? [])}</span>
              {o && <span style={{ fontSize: 10, background: '#e8f0ff', color: '#0f4c81', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>{o.uretilen}↑ {o.tamamlandi}✓</span>}
              {!readonly && (
                <button onClick={() => toggleAktif(k)} disabled={togglingId === k.id} style={{ width: 28, height: 16, borderRadius: 8, position: 'relative', background: k.aktif ? '#374151' : '#d1d5db', border: 'none', cursor: togglingId === k.id ? 'wait' : 'pointer', opacity: togglingId === k.id ? 0.5 : 1, flexShrink: 0 }}>
                  <span style={{ position: 'absolute', top: 2, left: k.aktif ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left .15s' }} />
                </button>
              )}
              {!readonly && (
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {yetki.duzenleyebilir && <button onClick={() => openEdit(k)} style={{ padding: '2px 8px', fontSize: 11, borderRadius: 5, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', color: '#374151' }}>Düzenle</button>}
                  {yetki.silebilir && (
                    <button onClick={() => handleDelete(k)} disabled={deletingId === k.id} style={{ padding: '2px 8px', fontSize: 11, borderRadius: 5, border: '1px solid #fca5a5', background: '#fef2f2', cursor: deletingId === k.id ? 'wait' : 'pointer', color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 4, opacity: deletingId === k.id ? 0.7 : 1 }}>
                      {deletingId === k.id && <span style={{ display: 'inline-block', width: 9, height: 9, border: '1.5px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
                      {deletingId === k.id ? 'Siliniyor…' : 'Sil'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        }

        // Toplu sil fonksiyonu — paralel + ilerleme + chunk'lı (DB'yi boğmamak için)
        async function topluSilGrup(kurallar: any[], key: string = 'global') {
          if (bulkDeleting) return
          const ok = await confirm({ title: 'Toplu Sil', message: `${kurallar.length} kural silinecek. Onaylıyor musunuz?`, confirmText: 'Evet, Sil', variant: 'danger' })
          if (!ok) return
          setBulkDeleting({ key, total: kurallar.length, done: 0 })
          const basariliIds: string[] = []
          let hata = 0
          // 10'lu chunk'lar halinde paralel — 150 kural ≈ 15 batch × ~500ms = ~8sn (eskiden 75sn)
          const CHUNK = 10
          try {
            for (let i = 0; i < kurallar.length; i += CHUNK) {
              const batch = kurallar.slice(i, i + CHUNK)
              const sonuc = await Promise.all(batch.map(async (k: any) => {
                try {
                  const res = await fetch(`/api/gorev-kurallari/${k.id}`, { method: 'DELETE' })
                  return res.ok ? k.id : null
                } catch { return null }
              }))
              for (const id of sonuc) {
                if (id) basariliIds.push(id)
                else hata++
              }
              setBulkDeleting({ key, total: kurallar.length, done: i + batch.length })
            }
            if (basariliIds.length > 0) setKuralar(prev => prev.filter(k => !basariliIds.includes(k.id)))
            if (hata === 0) toast({ type: 'success', title: 'Silindi', message: `${basariliIds.length} kural silindi.` })
            else toast({ type: 'error', title: 'Kısmi başarı', message: `${basariliIds.length} silindi · ${hata} başarısız` })
          } finally { setBulkDeleting(null) }
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {hiyerarsi.length === 0 && kalanKurallar.length === 0 && (
              <div className="verde-card" style={{ padding: 36, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>
                {q ? 'Arama kriterine uygun kural yok' : 'Henüz görev kuralı oluşturulmamış'}
              </div>
            )}

            {hiyerarsi.map(h => {
              const ustAcik = acikUstLoklar.has(h.ustLok)
              const toplamKural = h.gruplar.reduce((s, g) => s + g.tanimlar.reduce((ss, t) => ss + t.kurallar.length, 0), 0) + h.grupsuz.length
              const ustDuraklat = h.gruplar.reduce((s, g) => s + grupDuraklatmaSayisi(g.tanimlar), 0)
              return (
                <div key={h.ustLok} style={{ border: `1px solid ${ustDuraklat > 0 ? '#fbbf24' : '#e5e7eb'}`, borderRadius: 10, overflow: 'hidden' }}>
                  {/* Üst Lokasyon Başlığı */}
                  <div onClick={() => setAcikUstLoklar(prev => { const n = new Set(prev); n.has(h.ustLok) ? n.delete(h.ustLok) : n.add(h.ustLok); return n })}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: ustDuraklat > 0 ? '#fffdf5' : '#f9fafb', cursor: 'pointer', userSelect: 'none' }}>
                    <span style={{ fontSize: 12, color: '#374151' }}>{ustAcik ? '▼' : '▶'}</span>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#111827', flex: 1 }}>📍 {h.ustLokTanim}</span>
                    {ustDuraklat > 0 && <span style={{ fontSize: 11, color: '#92400e', background: '#fef3c7', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>⏸ {ustDuraklat} duraklatma</span>}
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{toplamKural} kural · {h.gruplar.length} grup</span>
                  </div>

                  {ustAcik && (
                    <div>
                      {h.gruplar.map(g => {
                        const gAcik = acikGruplar2.has(g.grupId)
                        const tumKurallar = g.tanimlar.flatMap(t => t.kurallar)
                        const aktifSayi = tumKurallar.filter(k => k.aktif).length
                        const grupDuraklat = grupDuraklatmaSayisi(g.tanimlar)
                        return (
                          <div key={g.grupId}>
                            {/* Grup Başlığı */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px 10px 36px', background: grupDuraklat > 0 ? '#fffdf5' : '#fff', borderTop: '1px solid #f3f4f6', cursor: 'pointer', userSelect: 'none' }}
                              onClick={() => setAcikGruplar2(prev => { const n = new Set(prev); n.has(g.grupId) ? n.delete(g.grupId) : n.add(g.grupId); return n })}>
                              <span style={{ fontSize: 11, color: '#6b7280' }}>{gAcik ? '▼' : '▶'}</span>
                              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1f2937', flex: 1 }}>
                                🗂 {g.grupAd}
                                <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400, marginLeft: 6 }}>{g.tanimlar.length} kural tanımı · {tumKurallar.length} kural · {aktifSayi} aktif</span>
                                {grupDuraklat > 0 && <span style={{ fontSize: 10, color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: 4, fontWeight: 700, marginLeft: 6 }}>⏸ {grupDuraklat}</span>}
                              </span>
                              {!readonly && yetki.silebilir && (() => {
                                const bdKey = `grup::${g.grupId}`
                                const aktif = bulkDeleting?.key === bdKey
                                const disabled = !!bulkDeleting && !aktif
                                return (
                                  <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                                    <button onClick={() => topluSilGrup(tumKurallar, bdKey)} disabled={disabled || aktif}
                                      style={{ padding: '3px 10px', fontSize: 11, borderRadius: 5, border: '1px solid #fca5a5', background: '#fef2f2', cursor: aktif || disabled ? 'wait' : 'pointer', color: '#dc2626', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5, opacity: disabled ? 0.5 : 1 }}>
                                      {aktif && <span style={{ display: 'inline-block', width: 10, height: 10, border: '1.5px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
                                      {aktif ? `Siliniyor… ${bulkDeleting!.done}/${bulkDeleting!.total}` : 'Toplu Sil'}
                                    </button>
                                  </div>
                                )
                              })()}
                            </div>
                            {/* Tanım bazlı alt gruplar */}
                            {gAcik && g.tanimlar.map((tg, ti) => {
                              const tanimKey = `${g.grupId}::${tg.tanim}`
                              const tanimAcik = acikTanimlar.has(tanimKey)
                              const tanimDuraklat = duraklatmaSayisi(tg.tanim)
                              return (
                              <div key={ti}>
                                {/* Tanım başlığı — tıkla aç/kapa */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px 8px 52px', background: tanimDuraklat > 0 ? '#fffbeb' : '#fafafa', borderTop: '1px solid #f3f4f6', cursor: 'pointer', userSelect: 'none', borderLeft: tanimDuraklat > 0 ? '3px solid #f59e0b' : 'none' }}
                                  onClick={() => setAcikTanimlar(prev => { const n = new Set(prev); n.has(tanimKey) ? n.delete(tanimKey) : n.add(tanimKey); return n })}>
                                  <span style={{ fontSize: 11, color: '#6b7280' }}>{tanimAcik ? '▼' : '▶'}</span>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: '#374151', flex: 1 }}>
                                    {tanimDuraklat > 0 ? '⏸ ' : '📋 '}{tg.tanim}
                                    <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400, marginLeft: 6 }}>({tg.kurallar.length} lokasyon)</span>
                                    {tanimDuraklat > 0 && <span style={{ fontSize: 10, color: '#92400e', background: '#fef3c7', padding: '1px 6px', borderRadius: 4, fontWeight: 700, marginLeft: 6 }}>{tanimDuraklat} duraklatma</span>}
                                  </span>
                                  <span style={{ fontSize: 11, color: '#6b7280' }}>
                                    {tg.kurallar[0]?.aktif_olma_saati?.slice(0, 5) ?? ''} · {gunEtiket(tg.kurallar[0]?.aktif_gunler ?? [])}
                                  </span>
                                  <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                                    {!readonly && (
                                      <button onClick={() => setDuraklatVardiyaModal({ tanim: tg.tanim, firmaId: firmaId!, projeId: projeId ?? null, aktifOlmaSaati: tg.kurallar[0]?.aktif_olma_saati?.slice(0, 5) ?? '' })}
                                        style={{ padding: '2px 8px', fontSize: 10, borderRadius: 4, border: '1px solid #fbbf24', background: '#fffbeb', cursor: 'pointer', color: '#92400e', fontWeight: 600 }}>
                                        ⏸ Duraklat
                                      </button>
                                    )}
                                    {!readonly && yetki.silebilir && (() => {
                                      const bdKey = `tanim::${tanimKey}`
                                      const aktif = bulkDeleting?.key === bdKey
                                      const disabled = !!bulkDeleting && !aktif
                                      return (
                                        <button onClick={() => topluSilGrup(tg.kurallar, bdKey)} disabled={disabled || aktif}
                                          style={{ padding: '2px 8px', fontSize: 10, borderRadius: 4, border: '1px solid #fca5a5', background: '#fef2f2', cursor: aktif || disabled ? 'wait' : 'pointer', color: '#dc2626', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4, opacity: disabled ? 0.5 : 1 }}>
                                          {aktif && <span style={{ display: 'inline-block', width: 9, height: 9, border: '1.5px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
                                          {aktif ? `${bulkDeleting!.done}/${bulkDeleting!.total}` : 'Sil'}
                                        </button>
                                      )
                                    })()}
                                  </div>
                                </div>
                                {/* Lokasyonlar — açılır menü */}
                                {tanimAcik && tg.kurallar.map(k => renderKuralSatir(k, 3))}
                              </div>
                              )
                            })}
                          </div>
                        )
                      })}

                      {/* Grupsuz kurallar */}
                      {h.grupsuz.length > 0 && (
                        <div>
                          <div style={{ padding: '8px 16px 8px 36px', fontSize: 12, color: '#94a3b8', fontWeight: 600, borderTop: '1px solid #f3f4f6' }}>Grupsuz Lokasyonlar</div>
                          {h.grupsuz.map(k => renderKuralSatir(k, 1))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Hiçbir üst lokasyona girmeyen kurallar */}
            {kalanKurallar.length > 0 && (
              <div style={{ border: '1px solid #e2d6f0', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: '#f5f0ff', fontSize: 13, fontWeight: 700, color: '#4a3070' }}>Sınıflandırılmamış Kurallar</div>
                {kalanKurallar.map(k => renderKuralSatir(k, 0))}
              </div>
            )}
          </div>
        )
      })()}

      {/* Sayfa altı özet satırı */}
      {kuralar.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: '#6b7280', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <span>Toplam <strong>{kuralar.length}</strong> kural</span>
          <span>Aktif <strong style={{ color: '#374151' }}>{kuralar.filter(k => k.aktif).length}</strong></span>
          <span>Pasif <strong style={{ color: '#9ca3af' }}>{kuralar.filter(k => !k.aktif).length}</strong></span>
          <span>Günlük üretim kapasitesi: <strong style={{ color: '#374151' }}>{kuralar.filter(k => k.aktif && (k.frekans_tipi ?? 'gunluk') === 'gunluk').reduce((s, k) => s + (k.gunluk_frekans_sayisi ?? 0), 0)} görev/gün</strong></span>
          <span>Haftalık üretim kapasitesi: <strong style={{ color: '#7c3aed' }}>{kuralar.filter(k => k.aktif && k.frekans_tipi === 'haftalik').reduce((s, k) => s + (k.haftalik_frekans_sayisi ?? 0), 0)} görev/hafta</strong></span>
        </div>
      )}

      {/* ══ KURAL MODAL ══ */}
      {/* Duraklat Modal */}
      {duraklatModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setDuraklatModal(null)}>
          <div onClick={e => e.stopPropagation()} className="verde-card" style={{ width: 'min(400px, 96vw)', padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 6 }}>⏸ Görev Kuralını Duraklat</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
              "<strong>{duraklatModal.tanim}</strong>" kuralı belirtilen süre boyunca yeni görev üretmeyecek. Süre dolunca otomatik devam eder.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#4b5563' }}>Duraklatma Süresi *</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[6, 12, 24, 48, 72].map(s => (
                    <button key={s} onClick={() => setDuraklatSaat(s)}
                      style={{ padding: '5px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600, border: duraklatSaat === s ? '2px solid #92400e' : '1px solid #e2e8f0', background: duraklatSaat === s ? '#fef9c3' : '#fff', color: duraklatSaat === s ? '#92400e' : '#64748b', cursor: 'pointer' }}>
                      {s < 24 ? `${s} saat` : `${s / 24} gün`}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: '#64748b' }}>veya</span>
                  <input type="number" min={1} max={720} value={duraklatSaat} onChange={e => setDuraklatSaat(Math.max(1, Math.min(720, Number(e.target.value) || 1)))}
                    style={{ width: 70, height: 30, textAlign: 'center', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 13, fontWeight: 700 }} />
                  <span style={{ fontSize: 12, color: '#64748b' }}>saat</span>
                </div>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#4b5563' }}>Neden (opsiyonel)</span>
                <input value={duraklatNeden} onChange={e => setDuraklatNeden(e.target.value)} placeholder="Neden duraklatılıyor?"
                  style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
              <button onClick={() => setDuraklatModal(null)} className="verde-btn-ghost" disabled={duraklatSaving}>Vazgeç</button>
              <button onClick={handleDuraklat} disabled={duraklatSaving}
                style={{ padding: '6px 18px', borderRadius: 8, border: 'none', background: '#92400e', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: duraklatSaving ? 0.6 : 1 }}>
                {duraklatSaving ? 'Duraklatılıyor...' : `⏸ ${duraklatSaat} saat duraklat`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vardiya Bazlı Duraklatma Modal */}
      {duraklatVardiyaModal && (
        <VardiyaDuraklatModal
          tanim={duraklatVardiyaModal.tanim}
          firmaId={duraklatVardiyaModal.firmaId}
          projeId={duraklatVardiyaModal.projeId}
          aktifOlmaSaati={duraklatVardiyaModal.aktifOlmaSaati}
          onClose={() => {
            setDuraklatVardiyaModal(null)
            // Duraklatmaları yenile
            const dp = new URLSearchParams({ firmaId: firmaId! })
            if (projeId) dp.set('projeId', projeId)
            fetch(`/api/gorev-kurallari/duraklat-vardiya?${dp}`)
              .then(r => r.json()).then(j => setDuraklatmalar(j.data ?? [])).catch(() => {})
          }}
        />
      )}

      {modal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(15,26,15,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onMouseDown={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="verde-card" style={{ width: 'min(560px, calc(100vw - 24px))', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,0.2)', overflow: 'hidden', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>{modal === 'create' ? '+ Yeni Görev Kuralı' : 'Kuralı Düzenle'}</div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={lbl}>Görev Tanımı *</label>
                <input className="verde-input" style={{ width: '100%' }} value={form.tanim} onChange={e => setForm(p => ({ ...p, tanim: e.target.value }))} placeholder="örn. WC Temizliği" />
              </div>
              <div>
                <label style={lbl}>Lokasyon *</label>
                {modal === 'edit' ? (
                  /* Edit modunda mevcut kademeli seçim */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {lokSec.map((secili, level) => {
                      const parent = level === 0 ? null : (lokSec[level - 1] ?? null)
                      const secenek = childrenOf(parent)
                      if (secenek.length === 0) return null
                      return (
                        <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {level > 0 && <span style={{ fontSize: 13, color: '#d1d5db', flexShrink: 0 }}>{'└─'.repeat(level)}</span>}
                          <select className="verde-select" style={{ flex: 1 }} value={secili ?? ''} onChange={e => handleLokSec(level, e.target.value)}>
                            <option value="">{level === 0 ? '— Üst lokasyon seçin —' : '— Alt lokasyon seçin —'}</option>
                            {secenek.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                          </select>
                        </div>
                      )
                    })}
                    {(() => {
                      const last = lokSec[lokSec.length - 1]
                      if (!last) return null
                      const ch = childrenOf(last)
                      if (ch.length === 0) return null
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 13, color: '#d1d5db', flexShrink: 0 }}>{'└─'.repeat(lokSec.length)}</span>
                          <select className="verde-select" style={{ flex: 1 }} value="" onChange={e => handleLokSec(lokSec.length, e.target.value)}>
                            <option value="">— Alt lokasyon seçin —</option>
                            {ch.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                          </select>
                        </div>
                      )
                    })()}
                    {form.lokasyon_id && <div style={{ marginTop: 6, fontSize: 12, color: '#374151', fontWeight: 600 }}>✓ {lokasyonlar.find(l => l.id === form.lokasyon_id)?.tanim}</div>}
                  </div>
                ) : (
                  /* Create modunda: Üst Lokasyon > Grup > Lokasyon hiyerarşisi */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {/* Üst Lokasyon dropdown */}
                    <select className="verde-select" value={lokSec[0] ?? ''} onChange={e => { handleLokSec(0, e.target.value); setForm(p => ({ ...p, lokasyon_idler: [], lokasyon_id: '' })) }}>
                      <option value="">— Üst lokasyon seçin —</option>
                      {lokasyonlar.filter(l => !l.parent_id).sort((a, b) => a.tanim.localeCompare(b.tanim, 'tr')).map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                    </select>

                    {/* Seçili üst lokasyonun grupları */}
                    {lokSec[0] && (() => {
                      const ustId = lokSec[0]!
                      const ustGruplar = gruplar.filter((g: any) => g.ust_lokasyon_id === ustId && g.aktif)
                      if (ustGruplar.length === 0) return <div style={{ fontSize: 12, color: '#94a3b8', padding: 6 }}>Bu üst lokasyonda grup yok</div>

                      // Tüm grupların tüm lokasyonları
                      const tumGrupLokIds = ustGruplar.flatMap((g: any) => g.lokasyonIds ?? [])
                      const tumSecili = tumGrupLokIds.every((id: string) => form.lokasyon_idler.includes(id))

                      return (
                        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
                          {/* Tümünü Seç / Temizle (üst lokasyon seviyesi) */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                              Gruplar ({form.lokasyon_idler.length} lokasyon seçili)
                            </span>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button type="button" onClick={() => setForm(p => ({ ...p, lokasyon_idler: tumGrupLokIds, lokasyon_id: '' }))}
                                style={{ fontSize: 11, color: '#1f2937', background: '#e5e7eb', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontWeight: 600 }}>
                                Tümünü Seç
                              </button>
                              <button type="button" onClick={() => setForm(p => ({ ...p, lokasyon_idler: [], lokasyon_id: '' }))}
                                style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
                                Temizle
                              </button>
                            </div>
                          </div>

                          {/* Her grup */}
                          {ustGruplar.map((g: any) => {
                            const gLokIds: string[] = g.lokasyonIds ?? []
                            const gLoklar = gLokIds.map((id: string) => lokasyonlar.find(l => l.id === id)).filter(Boolean) as typeof lokasyonlar
                            const gSecili = gLokIds.filter((id: string) => form.lokasyon_idler.includes(id)).length
                            const gTumSecili = gLokIds.length > 0 && gLokIds.every((id: string) => form.lokasyon_idler.includes(id))

                            return (
                              <div key={g.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                                {/* Grup başlığı */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#fff' }}>
                                  <input type="checkbox" checked={gTumSecili} onChange={() => {
                                    setForm(p => {
                                      const mevcut = new Set(p.lokasyon_idler)
                                      if (gTumSecili) { gLokIds.forEach((id: string) => mevcut.delete(id)) }
                                      else { gLokIds.forEach((id: string) => mevcut.add(id)) }
                                      return { ...p, lokasyon_idler: [...mevcut], lokasyon_id: '' }
                                    })
                                  }} style={{ width: 16, height: 16 }} />
                                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#1f2937' }}>
                                    🗂 {g.ad}
                                    <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 400, marginLeft: 6 }}>({gSecili}/{gLokIds.length})</span>
                                  </span>
                                </div>
                                {/* Lokasyonlar */}
                                <div style={{ paddingLeft: 32 }}>
                                  {gLoklar.map(l => {
                                    const sec = form.lokasyon_idler.includes(l.id)
                                    return (
                                      <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', cursor: 'pointer', background: sec ? '#eff6ff' : 'transparent', fontSize: 12.5 }}>
                                        <input type="checkbox" checked={sec} onChange={() => toggleLokCheckbox(l.id)} style={{ width: 14, height: 14 }} />
                                        <span style={{ color: sec ? '#1e40af' : '#374151', fontWeight: sec ? 600 : 400 }}>{l.tanim}</span>
                                      </label>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
              <div>
                <label style={lbl}>Frekans Tipi *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['gunluk', 'haftalik'] as const).map(t => {
                    const sec = form.frekans_tipi === t
                    const renk = t === 'haftalik' ? '#7c3aed' : '#059669'
                    return (
                      <button key={t} type="button" onClick={() => setForm(p => ({ ...p, frekans_tipi: t }))}
                        style={{
                          flex: 1, padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                          fontSize: 13, fontWeight: 700,
                          border: sec ? `2px solid ${renk}` : '1.5px solid #e5e7eb',
                          background: sec ? (t === 'haftalik' ? '#faf5ff' : '#ecfdf5') : '#fff',
                          color: sec ? renk : '#4b5563',
                        }}>
                        {t === 'gunluk' ? '📅 Günlük' : '🗓️ Haftalık'}
                        <div style={{ fontSize: 11, fontWeight: 400, marginTop: 3, color: sec ? renk : '#6b7280' }}>
                          {t === 'gunluk' ? 'Her gün üret' : 'Haftada X kez üret'}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {form.frekans_tipi === 'haftalik' && (() => {
                // Seçili lokasyon(lar)ın Frekans Sayıları → Haftalık değerlerini topla
                const lokIdler = form.lokasyon_idler.length > 0 ? form.lokasyon_idler : (form.lokasyon_id ? [form.lokasyon_id] : [])
                const haftalikDegerler = lokIdler.map(id => {
                  const l = lokasyonlar.find(x => x.id === id)
                  return { id, tanim: l?.tanim ?? '—', val: (l as any)?.haftalik_frekans_sayisi ?? 0 }
                })
                const eksikler = haftalikDegerler.filter(x => !x.val || x.val < 1)
                const hepsiAyni = haftalikDegerler.length > 0 && haftalikDegerler.every(x => x.val === haftalikDegerler[0].val)

                if (lokIdler.length === 0) {
                  return (
                    <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#92400e' }}>
                      Haftalık frekans sayısı, seçilen lokasyonun <strong>Frekans Sayıları → Haftalık</strong> sekmesindeki değerden alınır. Önce yukarıdan lokasyon seç.
                    </div>
                  )
                }
                if (eksikler.length > 0) {
                  return (
                    <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#991b1b' }}>
                      <strong>Eksik haftalık frekans:</strong> Aşağıdaki lokasyon(lar) için önce <strong>Frekans Sayıları → Haftalık</strong> sekmesinden değer gir:
                      <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
                        {eksikler.map(x => <li key={x.id}>{x.tanim}</li>)}
                      </ul>
                    </div>
                  )
                }
                return (
                  <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#6d28d9' }}>
                    <strong>Haftalık Frekans:</strong>{' '}
                    {hepsiAyni
                      ? <>seçilen lokasyon(lar) için <strong>{haftalikDegerler[0].val}× / hafta</strong> üretilecek</>
                      : <>her lokasyon kendi Frekans Sayıları değerini kullanır: {haftalikDegerler.map(x => `${x.tanim}: ${x.val}×`).join(', ')}</>
                    }
                    <div style={{ fontSize: 11, color: '#7c3aed', marginTop: 4 }}>
                      Değiştirmek için: Sistem Ayarları → Frekans Sayıları → Haftalık sekmesi.
                    </div>
                  </div>
                )
              })()}

              <div>
                <label style={lbl}>{form.frekans_tipi === 'haftalik' ? 'İzin Verilen Günler *' : 'Aktif Günler *'}</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {GUN_TAM.map((label, i) => {
                    const sec = form.aktif_gunler.includes(i)
                    return (
                      <button key={i} type="button" onClick={() => toggleGun(i)} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer', fontWeight: sec ? 700 : 400, border: sec ? '1.5px solid #374151' : '1.5px solid #e5e7eb', background: sec ? '#f9fafb' : '#fff', color: sec ? '#374151' : '#4b5563' }}>{label}</button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {[{ label: 'Hafta içi', g: IS_GUNLERI }, { label: 'Her gün', g: TUM_GUNLER }, { label: 'Hafta sonu', g: [0, 6] }].map(({ label, g }) => (
                    <button key={label} type="button" onClick={() => setForm(p => ({ ...p, aktif_gunler: g }))} style={{ fontSize: 11.5, padding: '3px 10px', borderRadius: 5, border: '1px solid #e5e7eb', background: '#fafafa', cursor: 'pointer', color: '#4b5563' }}>{label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>Gün İçi Aktifleşme Saati *</label>
                <input type="time" className="verde-input" style={{ width: '100%', maxWidth: 200 }} value={form.aktif_olma_saati} onChange={e => setForm(p => ({ ...p, aktif_olma_saati: e.target.value }))} />
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>Görev gece 00:01'de üretilir, bu saatte ACIK'a geçer</div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Başlangıç Tarihi *</label>
                  <input type="date" className="verde-input" style={{ width: '100%' }} value={form.baslangic_tarihi} onChange={e => setForm(p => ({ ...p, baslangic_tarihi: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Bitiş Tarihi <span style={{ fontSize: 11, color: '#6b7280' }}>(boş = süresiz)</span></label>
                  <input type="date" className="verde-input" style={{ width: '100%' }} value={form.bitis_tarihi} onChange={e => setForm(p => ({ ...p, bitis_tarihi: e.target.value }))} />
                </div>
              </div>
              {personelAtamaAktif && (
              <div>
                <label style={lbl}>Atanan <span style={{ fontSize: 11, color: '#6b7280' }}>(opsiyonel)</span></label>
                <select className="verde-select" style={{ width: '100%' }} value={form.atanan_kullanici_id} onChange={e => setForm(p => ({ ...p, atanan_kullanici_id: e.target.value }))}>
                  <option value="">— Atanmamış —</option>
                  {kullanicilar.map(u => <option key={u.id} value={u.id}>{u.isim_soyisim}</option>)}
                </select>
              </div>
              )}
              {form.lokasyon_id && form.aktif_gunler.length > 0 && (() => {
                const lok = lokasyonlar.find(l => l.id === form.lokasyon_id)
                const lokGunluk = (lok as any)?.gunluk_frekans_sayisi ?? form.gunluk_frekans_sayisi
                const lokHaftalik = (lok as any)?.haftalik_frekans_sayisi ?? 0
                return (
                  <div style={{ background: form.frekans_tipi === 'haftalik' ? '#faf5ff' : '#f9fafb', border: `1px solid ${form.frekans_tipi === 'haftalik' ? '#e9d5ff' : '#e5e7eb'}`, borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#2a4a2a' }}>
                    <strong>Özet:</strong>{' '}
                    {form.frekans_tipi === 'haftalik' ? (
                      <>
                        {gunEtiket(form.aktif_gunler)} içinde saat {form.aktif_olma_saati}'de, <strong>haftada {lokHaftalik || '?'}×</strong> "{form.tanim || '…'}" görevi üretilir (hedefe ulaşınca durur).
                      </>
                    ) : (
                      <>
                        {gunEtiket(form.aktif_gunler)}, saat {form.aktif_olma_saati}'de, günde <strong>{lokGunluk}×</strong> "{form.tanim || '…'}" görevi üretilir.
                      </>
                    )}
                    {form.bitis_tarihi ? ` ${form.baslangic_tarihi} – ${form.bitis_tarihi}.` : ` ${form.baslangic_tarihi} tarihinden süresiz.`}
                  </div>
                )
              })()}
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setModal(null)} className="verde-btn-outline-strong" disabled={saving}>İptal</button>
              <button onClick={handleSave} className="verde-btn-primary" disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {saving && <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />}
                {saving ? 'Kaydediliyor…' : modal === 'create' ? 'Kural Oluştur' : 'Güncelle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ IMPORT MODAL ══ */}
      {importOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(15,26,15,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onMouseDown={e => { if (e.target === e.currentTarget && !importing) setImportOpen(false) }}>
          <div className="verde-card" style={{ width: 'min(500px, calc(100vw - 24px))', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>Excel ile Kural İçe Aktar</div>
              <button onClick={() => !importing && setImportOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#f6fbf6', border: '1px solid #d6e9d6', borderRadius: 8, padding: 12, fontSize: 12.5, color: '#4b5563', lineHeight: 1.7 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Nasıl kullanılır?</div>
                <ol style={{ margin: 0, paddingLeft: 16 }}>
                  <li>Önce <strong>Şablon</strong> düğmesiyle örnek dosyayı (.xlsx) indirin.</li>
                  <li>Her satıra bir kural girin (lokasyon, günler, frekans, saat…).</li>
                  <li>Excel (.xlsx) olarak kaydedin ve buraya yükleyin.</li>
                </ol>
              </div>
              <div>
                <label style={lbl}>Excel Dosyası (.xlsx)</label>
                <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => setImportFile(e.target.files?.[0] ?? null)} className="verde-input" style={{ padding: 10, height: 'auto' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setImportOpen(false)} className="verde-btn-outline-strong" disabled={importing}>İptal</button>
                <button onClick={handleImport} className="verde-btn-primary" disabled={importing || !importFile}>{importing ? 'Aktarılıyor…' : 'İçe Aktar'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Vardiya bazlı duraklatma popup */
function VardiyaDuraklatModal({ tanim, firmaId, projeId, aktifOlmaSaati, onClose }: {
  tanim: string; firmaId: string; projeId: string | null; aktifOlmaSaati: string; onClose: () => void
}) {
  const [vardiyalar, setVardiyalar] = useState<{ no: number; baslangic: string; bitis: string }[]>([])
  const [uygunVardiyaNo, setUygunVardiyaNo] = useState<number | null>(null)
  const [seciliTarihler, setSeciliTarihler] = useState<string[]>([])
  const [seciliVardiyalar, setSeciliVardiyalar] = useState<number[]>([])
  const [mevcutlar, setMevcutlar] = useState<any[]>([])
  const [tarihInput, setTarihInput] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    // Vardiya tanımlarını çek ve uygun vardiyayı bul
    fetch(`/api/sistem-ayarlari/vardiya?firmaId=${firmaId}`)
      .then(r => r.json())
      .then(j => {
        const sayisi = j.vardiya_sayisi ?? 3
        const tumAyar = j.tum_vardiya_ayarlari
        const aktifSet = tumAyar?.[sayisi] ?? j.vardiya_saatleri ?? []
        setVardiyalar(aktifSet)
        // aktifOlmaSaati hangi vardiyaya denk geliyor?
        for (const v of aktifSet) {
          // Gece vardiyası: bitis <= baslangic (ör. 16:00-00:00 veya 20:00-08:00)
          const geceVardiya = v.bitis <= v.baslangic
          const eslesme = geceVardiya
            ? (aktifOlmaSaati >= v.baslangic || aktifOlmaSaati < v.bitis)
            : (aktifOlmaSaati >= v.baslangic && aktifOlmaSaati < v.bitis)
          if (eslesme) {
            setUygunVardiyaNo(v.no)
            setSeciliVardiyalar([v.no])
            break
          }
        }
      })
      .catch(() => {})
    // Mevcut duraklatmaları çek
    const p = new URLSearchParams({ firmaId, tanim })
    if (projeId) p.set('projeId', projeId)
    fetch(`/api/gorev-kurallari/duraklat-vardiya?${p}`)
      .then(r => r.json())
      .then(j => setMevcutlar(j.data ?? []))
      .catch(() => {})
  }, [firmaId, projeId, tanim])

  function tarihEkle() {
    if (!tarihInput || seciliTarihler.includes(tarihInput)) return
    setSeciliTarihler(prev => [...prev, tarihInput].sort())
    setTarihInput('')
  }

  async function kaydet() {
    if (!seciliTarihler.length || !seciliVardiyalar.length) return
    setSaving(true)
    try {
      const res = await fetch('/api/gorev-kurallari/duraklat-vardiya', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmaId, projeId, tanim, tarihler: seciliTarihler, vardiyalar: seciliVardiyalar }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error)
      toast({ type: 'success', title: 'Duraklatıldı', message: `${j.eklenen} duraklatma eklendi.` })
      // Mevcut listeyi yenile
      const p = new URLSearchParams({ firmaId, tanim })
      if (projeId) p.set('projeId', projeId)
      const r2 = await fetch(`/api/gorev-kurallari/duraklat-vardiya?${p}`)
      const j2 = await r2.json()
      setMevcutlar(j2.data ?? [])
      setSeciliTarihler([])
      setSeciliVardiyalar([])
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSaving(false)
  }

  async function kaldir(id: string, t: string, v: number) {
    await fetch('/api/gorev-kurallari/duraklat-vardiya', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firmaId, projeId, tanim, tarih: t, vardiya_no: v }),
    })
    setMevcutlar(prev => prev.filter(m => m.id !== id))
  }

  const GUN_ISIMLERI: Record<string, string> = {}
  const haftaGunleri = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '80vh', overflow: 'auto', padding: '24px 28px' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 4 }}>⏸ Vardiya Duraklatma</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
          <strong>{tanim}</strong> kuralı için belirli günlerde ve vardiyalarda görev üretimini duraklat.
        </div>

        {/* Tarih seçimi */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Tarih Seç</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={tarihInput} onChange={e => setTarihInput(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              style={{ height: 36, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 14 }} />
            <button onClick={tarihEkle} disabled={!tarihInput}
              style={{ height: 36, padding: '0 14px', borderRadius: 8, background: '#1d4ed8', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: tarihInput ? 1 : 0.4 }}>
              Ekle
            </button>
          </div>
          {seciliTarihler.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {seciliTarihler.map(t => {
                const d = new Date(t + 'T00:00:00')
                const gun = haftaGunleri[d.getDay()]
                return (
                  <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>
                    {t} ({gun})
                    <span onClick={() => setSeciliTarihler(prev => prev.filter(x => x !== t))} style={{ cursor: 'pointer', color: '#dc2626', fontWeight: 800 }}>×</span>
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* Vardiya — otomatik eşleşen */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Duraklatılacak Vardiya</div>
          {uygunVardiyaNo ? (
            <div style={{ padding: '10px 16px', borderRadius: 8, fontSize: 14, fontWeight: 700, background: '#eff6ff', border: '2px solid #1d4ed8', color: '#1d4ed8', display: 'inline-block' }}>
              {uygunVardiyaNo}. Vardiya ({vardiyalar.find(v => v.no === uygunVardiyaNo)?.baslangic} - {vardiyalar.find(v => v.no === uygunVardiyaNo)?.bitis})
              <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginLeft: 8 }}>Aktif saat: {aktifOlmaSaati}</span>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#dc2626' }}>Aktif olma saati ({aktifOlmaSaati}) hiçbir vardiyayla eşleşmiyor</div>
          )}
        </div>

        {/* Kaydet butonu */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={kaydet} disabled={saving || !seciliTarihler.length || !seciliVardiyalar.length}
            style={{ padding: '8px 20px', borderRadius: 8, background: '#92400e', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: (seciliTarihler.length && seciliVardiyalar.length) ? 1 : 0.4 }}>
            {saving ? 'Kaydediliyor...' : '⏸ Duraklat'}
          </button>
          <button onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8, background: '#fff', color: '#374151', border: '1px solid #e2e8f0', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Kapat
          </button>
        </div>

        {/* Mevcut duraklatmalar */}
        {mevcutlar.length > 0 && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 6 }}>Aktif Duraklatmalar</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {mevcutlar.map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: '#fffbeb', borderRadius: 6, border: '1px solid #fde68a', fontSize: 13 }}>
                  <span style={{ fontWeight: 700, color: '#92400e' }}>{m.tarih}</span>
                  <span style={{ color: '#6b7280' }}>·</span>
                  <span style={{ color: '#374151' }}>{m.vardiya_no}. Vardiya</span>
                  <button onClick={() => kaldir(m.id, m.tarih, m.vardiya_no)}
                    style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 11, borderRadius: 4, border: '1px solid #fca5a5', background: '#fef2f2', cursor: 'pointer', color: '#dc2626', fontWeight: 600 }}>
                    Kaldır
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
