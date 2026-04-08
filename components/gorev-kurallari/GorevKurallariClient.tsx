'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { useToast } from '@/components/ui/ToastProvider'

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
  lokasyonlar: { id: string; tanim: string; parent_id?: string | null; gunluk_frekans_sayisi?: number | null }[]
  kullanicilar: { id: string; isim_soyisim: string }[]
  readonly: boolean
  embedded?: boolean
  projeId?: string | null
  personelAtamaAktif?: boolean
}

const BOSH_FORM = {
  tanim: '', lokasyon_id: '', lokasyon_idler: [] as string[], atanan_kullanici_id: '',
  gunluk_frekans_sayisi: 1, aktif_gunler: IS_GUNLERI,
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

  const [kuralar, setKuralar]       = useState<any[]>(initialKuralar)
  const [duraklatModal, setDuraklatModal] = useState<{ kuralId: string; tanim: string } | null>(null)
  const [duraklatSaat, setDuraklatSaat]   = useState(24)
  const [duraklatNeden, setDuraklatNeden] = useState('')
  const [duraklatSaving, setDuraklatSaving] = useState(false)

  // Sekme içinde (embedded=true) ilk yüklemede kuralları çek
  useEffect(() => {
    if (!embedded || !firmaId || initialKuralar.length > 0) return
    const params = new URLSearchParams({ firma_id: firmaId })
    if (projeId) params.set('proje_id', projeId)
    fetch(`/api/gorev-kurallari?${params.toString()}`)
      .then(r => r.json()).then(d => Array.isArray(d) && setKuralar(d)).catch(() => {})
  }, [embedded, firmaId])
  const [ozet, setOzet]             = useState<Record<string, OzetRow>>({})
  const [modal, setModal]           = useState<null | 'create' | 'edit'>(null)
  const [editId, setEditId]         = useState<string | null>(null)
  const [form, setForm]             = useState(BOSH_FORM)
  const [saving, setSaving]         = useState(false)
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
    // Toplu seçim modunda (create) alt lokasyonları checkbox ile seçilecek
    if (modal === 'create' && hasChildren) {
      setForm(p => ({ ...p, lokasyon_id: '', lokasyon_idler: [], gunluk_frekans_sayisi: p.gunluk_frekans_sayisi }))
    } else {
      setForm(p => ({ ...p, lokasyon_id: hasChildren ? '' : id, lokasyon_idler: [], gunluk_frekans_sayisi: hasChildren ? p.gunluk_frekans_sayisi : lokFrekans }))
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

  useEffect(() => {
    if (!firmaId) return
    fetch(`/api/gorev-kurallari/bugun-ozet?firma_id=${firmaId}`)
      .then(r => r.json()).then(setOzet).catch(() => {})
  }, [firmaId])

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
      gunluk_frekans_sayisi: k.gunluk_frekans_sayisi ?? 1,
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

    setSaving(true)
    try {
      if (modal === 'create') {
        const yeniKurallar: any[] = []
        for (const lokId of lokIdler) {
          const body = {
            firma_id: firmaId, tanim: form.tanim.trim(), lokasyon_id: lokId,
            atanan_kullanici_id: form.atanan_kullanici_id || null,
            gunluk_frekans_sayisi: form.gunluk_frekans_sayisi,
            aktif_gunler: form.aktif_gunler, aktif_olma_saati: form.aktif_olma_saati,
            baslangic_tarihi: form.baslangic_tarihi, bitis_tarihi: form.bitis_tarihi || null,
            ...(projeId ? { proje_id: projeId } : {}),
          }
          const res = await fetch('/api/gorev-kurallari', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error)
          yeniKurallar.push(data)
        }
        setKuralar(p => [...yeniKurallar, ...p])
        toast({ type: 'success', title: 'Başarılı', message: `${yeniKurallar.length} lokasyon için kural oluşturuldu` })
      } else if (modal === 'edit' && editId) {
        const body = {
          firma_id: firmaId, tanim: form.tanim.trim(), lokasyon_id: lokIdler[0],
          atanan_kullanici_id: form.atanan_kullanici_id || null,
          gunluk_frekans_sayisi: form.gunluk_frekans_sayisi,
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
    const res = await fetch(`/api/gorev-kurallari/${k.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktif: !k.aktif }),
    })
    if (res.ok) {
      setKuralar(p => p.map(x => x.id === k.id ? { ...x, aktif: !k.aktif } : x))
      toast({ type: 'success', title: 'Güncellendi', message: k.aktif ? 'Pasife alındı' : 'Aktif edildi' })
    }
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
    const res = await fetch(`/api/gorev-kurallari/${k.id}`, { method: 'DELETE' })
    if (res.ok) {
      setKuralar(p => p.filter(x => x.id !== k.id))
      toast({ type: 'success', title: 'Silindi', message: `"${k.tanim}" silindi` })
    } else {
      toast({ type: 'error', title: 'Hata', message: (await res.json()).error })
    }
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
      const res  = await fetch('/api/import-export/gorev-kurallari/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Import başarısız')
      const refreshRes = await fetch(`/api/gorev-kurallari?firma_id=${firmaId}`)
      if (refreshRes.ok) setKuralar(await refreshRes.json())
      toast({ type: 'success', title: 'Tamamlandı', message: `${data.created} kural içe aktarıldı${data.failed ? `, ${data.failed} satır atlandı` : ''}` })
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
            <button className="verde-btn-primary" onClick={openCreate}>+ Yeni Kural</button>
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

      {/* Tablo */}
      <div className="verde-card" style={{ overflow: 'hidden' }}>
        <div className="verde-table-wrap">
          <table className="verde-table">
            <thead>
              <tr>
                <th>Tanım</th>
                <th>Lokasyon</th>
                <th>Günler</th>
                <th style={{ textAlign: 'center' }}>Frekans</th>
                <th title="Görev bu saatte ACIK'a geçer">Aktifleşme Saati</th>
                <th>Başlangıç</th>
                <th>Bitiş</th>
                <th style={{ textAlign: 'center' }}>Bugünkü Durum</th>
                <th style={{ textAlign: 'center' }}>Aktif</th>
                {!readonly && <th>İşlem</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map(k => {
                const o = ozet[k.id]
                return (
                  <tr key={k.id} style={{ opacity: k.aktif ? 1 : 0.5, background: k.duraklatma_bitis && new Date(k.duraklatma_bitis).getTime() > Date.now() ? '#fffbeb' : undefined }}>
                    <td style={{ fontWeight: 600, fontSize: 13 }}>
                      {k.tanim}
                      {k.duraklatma_bitis && new Date(k.duraklatma_bitis).getTime() > Date.now() && (
                        <div style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>
                          ⏸ Duraklatıldı — {new Date(k.duraklatma_bitis).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}'e kadar
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: '#4b5563', maxWidth: 180 }}>{lokMap.get(k.lokasyon_id) ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>{gunEtiket(k.aktif_gunler ?? [])}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontWeight: 700, color: '#374151', fontSize: 14 }}>{k.gunluk_frekans_sayisi}×</span>
                    </td>
                    <td style={{ fontSize: 12.5 }}>{k.aktif_olma_saati?.slice(0, 5) ?? '—'}</td>
                    <td style={{ fontSize: 12, color: '#4b5563' }}>{k.baslangic_tarihi}</td>
                    <td style={{ fontSize: 12, color: k.bitis_tarihi ? '#4b5563' : '#d1d5db' }}>{k.bitis_tarihi ?? '∞'}</td>
                    {/* Bugünkü özet */}
                    <td style={{ textAlign: 'center', minWidth: 120 }}>
                      {o ? (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <span title="Üretilen" style={{ fontSize: 11, background: '#e8f0ff', color: '#0f4c81', padding: '2px 7px', borderRadius: 4, fontWeight: 700 }}>{o.uretilen} üretildi</span>
                          {o.tamamlandi > 0 && <span style={{ fontSize: 11, background: '#f3f4f6', color: '#374151', padding: '2px 7px', borderRadius: 4 }}>✓ {o.tamamlandi}</span>}
                          {o.bekliyor > 0   && <span style={{ fontSize: 11, background: '#f9fafb', color: '#374151', padding: '2px 7px', borderRadius: 4 }}>⏳ {o.bekliyor}</span>}
                          {o.kayip > 0      && <span style={{ fontSize: 11, background: '#fef2f2', color: '#b91c1c', padding: '2px 7px', borderRadius: 4 }}>✗ {o.kayip}</span>}
                        </div>
                      ) : (
                        <span style={{ fontSize: 11.5, color: '#d1d5db' }}>—</span>
                      )}
                    </td>
                    {/* Toggle */}
                    <td style={{ textAlign: 'center' }}>
                      {!readonly ? (
                        <button onClick={() => toggleAktif(k)} title={k.aktif ? 'Pasife al' : 'Aktif et'}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', border: 'none', fontSize: 12, fontWeight: 700, background: k.aktif ? '#f3f4f6' : '#f3f4f6', color: k.aktif ? '#374151' : '#9ca3af' }}>
                          <span style={{ width: 28, height: 16, borderRadius: 8, position: 'relative', background: k.aktif ? '#374151' : '#d1d5db', display: 'inline-block', transition: 'background 0.15s', flexShrink: 0 }}>
                            <span style={{ position: 'absolute', top: 2, left: k.aktif ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                          </span>
                          {k.aktif ? 'Açık' : 'Kapalı'}
                        </button>
                      ) : (
                        <span className={`verde-badge ${k.aktif ? 'status-islemde' : 'status-iptal'}`}>{k.aktif ? 'Aktif' : 'Pasif'}</span>
                      )}
                    </td>
                    {!readonly && (
                      <td>
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          {k.duraklatma_bitis && new Date(k.duraklatma_bitis).getTime() > Date.now() ? (
                            <button onClick={() => handleDevam(k)} style={{ padding: '3px 9px', fontSize: 12, borderRadius: 6, border: '1px solid #86efac', background: '#dcfce7', color: '#15803d', fontWeight: 600, cursor: 'pointer' }}>
                              ▶ Devam
                            </button>
                          ) : (
                            <button onClick={() => { setDuraklatModal({ kuralId: k.id, tanim: k.tanim }); setDuraklatSaat(24); setDuraklatNeden('') }}
                              style={{ padding: '3px 9px', fontSize: 12, borderRadius: 6, border: '1px solid #fbbf24', background: '#fef9c3', color: '#92400e', fontWeight: 600, cursor: 'pointer' }}>
                              ⏸ Duraklat
                            </button>
                          )}
                          <button onClick={() => openEdit(k)} className="verde-btn-outline-strong" style={{ padding: '3px 9px', fontSize: 12 }}>Düzenle</button>
                          <button onClick={() => handleDelete(k)} className="verde-btn-outline-strong" style={{ padding: '3px 9px', fontSize: 12, color: '#b91c1c' }}>Sil</button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={readonly ? 9 : 10} style={{ textAlign: 'center', color: '#6b7280', padding: '36px 0', fontSize: 14 }}>
                    {q ? 'Arama kriterine uygun kural yok' : 'Henüz görev kuralı oluşturulmamış'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sayfa altı özet satırı */}
      {kuralar.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: '#6b7280', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <span>Toplam <strong>{kuralar.length}</strong> kural</span>
          <span>Aktif <strong style={{ color: '#374151' }}>{kuralar.filter(k => k.aktif).length}</strong></span>
          <span>Pasif <strong style={{ color: '#9ca3af' }}>{kuralar.filter(k => !k.aktif).length}</strong></span>
          <span>Günlük üretim kapasitesi: <strong style={{ color: '#374151' }}>{kuralar.filter(k => k.aktif).reduce((s, k) => s + (k.gunluk_frekans_sayisi ?? 0), 0)} görev/gün</strong></span>
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
                {/* Kademeli lokasyon seçimi */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {lokSec.map((secili, level) => {
                    const parent = level === 0 ? null : (lokSec[level - 1] ?? null)
                    const secenek = childrenOf(parent)
                    if (secenek.length === 0) return null
                    const placeholder = level === 0 ? '— Üst lokasyon seçin —' : '— Alt lokasyon seçin —'
                    return (
                      <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {level > 0 && (
                          <span style={{ fontSize: 13, color: '#d1d5db', flexShrink: 0 }}>{'└─'.repeat(level)}</span>
                        )}
                        <select
                          className="verde-select"
                          style={{ flex: 1 }}
                          value={secili ?? ''}
                          onChange={e => handleLokSec(level, e.target.value)}
                        >
                          <option value="">{placeholder}</option>
                          {secenek.map(l => (
                            <option key={l.id} value={l.id}>{l.tanim}</option>
                          ))}
                        </select>
                      </div>
                    )
                  })}
                  {/* Seçili lokasyonun çocukları varsa bir seviye daha ekle */}
                  {(() => {
                    const last = lokSec[lokSec.length - 1]
                    if (!last) return null
                    const hasChildren = lokasyonlar.some(l => l.parent_id === last)
                    if (!hasChildren) return null
                    return (
                      <div key={lokSec.length} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: '#d1d5db', flexShrink: 0 }}>{'└─'.repeat(lokSec.length)}</span>
                        <select
                          className="verde-select"
                          style={{ flex: 1 }}
                          value=""
                          onChange={e => handleLokSec(lokSec.length, e.target.value)}
                        >
                          <option value="">— Alt lokasyon seçin (opsiyonel) —</option>
                          {childrenOf(last).map(l => (
                            <option key={l.id} value={l.id}>{l.tanim}</option>
                          ))}
                        </select>
                      </div>
                    )
                  })()}
                </div>
                {/* Toplu lokasyon seçimi (create modunda) */}
                {modal === 'create' && (() => {
                  // Son seçili parent'ın yaprak çocuklarını bul
                  const lastSelected = lokSec.filter(Boolean).pop()
                  if (!lastSelected) return null
                  const yapraklar = yaprakLokasyonlar(lastSelected)
                  if (yapraklar.length === 0) return null
                  const tumSecili = yapraklar.every(l => form.lokasyon_idler.includes(l.id))
                  return (
                    <div style={{ marginTop: 8, border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', background: '#fafafa' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Alt Lokasyonlar ({form.lokasyon_idler.length}/{yapraklar.length})</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" onClick={() => setForm(p => ({ ...p, lokasyon_idler: yapraklar.map(l => l.id), lokasyon_id: '' }))}
                            style={{ fontSize: 11, color: '#1f2937', background: '#e5e7eb', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontWeight: 600 }}>
                            Tümünü Seç
                          </button>
                          <button type="button" onClick={() => setForm(p => ({ ...p, lokasyon_idler: [], lokasyon_id: '' }))}
                            style={{ fontSize: 11, color: '#6b7280', background: '#f3f4f6', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
                            Temizle
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
                        {yapraklar.map(l => {
                          const secili = form.lokasyon_idler.includes(l.id)
                          return (
                            <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', background: secili ? '#eff6ff' : 'transparent', fontSize: 13 }}>
                              <input type="checkbox" checked={secili} onChange={() => toggleLokCheckbox(l.id)} style={{ width: 15, height: 15 }} />
                              <span style={{ fontWeight: secili ? 600 : 400, color: secili ? '#1e40af' : '#374151' }}>{l.tanim}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
                {/* Seçili lokasyon özeti (edit modunda) */}
                {form.lokasyon_id && modal === 'edit' && (
                  <div style={{ marginTop: 6, fontSize: 12, color: '#374151', fontWeight: 600 }}>
                    ✓ {lokMap.get(form.lokasyon_id)}
                  </div>
                )}
              </div>
              <div>
                <label style={lbl}>Aktif Günler *</label>
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
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Günlük Frekans</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 20, fontWeight: 900, color: '#374151', minWidth: 28, textAlign: 'center' }}>{form.gunluk_frekans_sayisi}</span>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>kez/gün</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>Lokasyonun frekans sayısı (Sistem Ayarları'ndan)</div>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={lbl}>Gün İçi Aktifleşme Saati *</label>
                  <input type="time" className="verde-input" style={{ width: '100%' }} value={form.aktif_olma_saati} onChange={e => setForm(p => ({ ...p, aktif_olma_saati: e.target.value }))} />
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>Görev gece 00:01'de üretilir, bu saatte ACIK'a geçer</div>
                </div>
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
              {form.lokasyon_id && form.aktif_gunler.length > 0 && (
                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, color: '#2a4a2a' }}>
                  <strong>Özet:</strong> {gunEtiket(form.aktif_gunler)}, saat {form.aktif_olma_saati}'de, günde <strong>{form.gunluk_frekans_sayisi}×</strong> "{form.tanim || '…'}" görevi üretilir.
                  {form.bitis_tarihi ? ` ${form.baslangic_tarihi} – ${form.bitis_tarihi}.` : ` ${form.baslangic_tarihi} tarihinden süresiz.`}
                </div>
              )}
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setModal(null)} className="verde-btn-outline-strong" disabled={saving}>İptal</button>
              <button onClick={handleSave} className="verde-btn-primary" disabled={saving}>{saving ? 'Kaydediliyor…' : modal === 'create' ? 'Kural Oluştur' : 'Güncelle'}</button>
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
                  <li>Önce <strong>Şablon</strong> düğmesiyle örnek dosyayı indirin.</li>
                  <li>Her satıra bir kural girin (lokasyon, günler, frekans, saat…).</li>
                  <li>Excel XML formatında kaydedin ve buraya yükleyin.</li>
                </ol>
              </div>
              <div>
                <label style={lbl}>Excel XML Dosyası</label>
                <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" onChange={e => setImportFile(e.target.files?.[0] ?? null)} className="verde-input" style={{ padding: 10, height: 'auto' }} />
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
