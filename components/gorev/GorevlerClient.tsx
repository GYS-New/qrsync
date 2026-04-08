'use client'

import React, { useRef } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime, GOREV_DURUM_LABEL } from '@/lib/utils'
import type { Lokasyon, User } from '@/types'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { createGorevAtamaNotification, notifyTenantAdminsOnGorevStatusChange, type GorevDurum } from '@/lib/notifications'
import { useFirma } from '@/components/layout/FirmaContext'
import ChecklistModal from '@/components/checklist/ChecklistModal'

const DURUM_RENK: Record<string, string> = {
  ACIK: 'status-acik',
  ISLEMDE: 'status-islemde',
  TAMAMLANDI: 'status-tamamlandi',
  IPTAL: 'status-iptal',
}

const DURUM_SECENEKLER = [
  { value: 'ACIK',       label: 'Açık' },
  { value: 'ISLEMDE',    label: 'İşlemde' },
  { value: 'TAMAMLANDI', label: 'Tamamlandı' },
  { value: 'IPTAL',      label: 'İptal' },
]

const SEL = '*,lokasyonlar(id,tanim,parent_id,checklist_sablon_id),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim)'

export default function GorevlerClient({
  base, meId, readonly, initialFirmaId, initialGorevler, initialLokasyonlar, initialKullanicilar, projeId,
  personelAtamaAktif = true, ceklistAktif = true,
}: {
  base: '/sa' | '/ta' | '/u'
  meId: string
  readonly: boolean
  initialFirmaId?: string | null
  initialGorevler: any[]
  initialLokasyonlar: Pick<Lokasyon, 'id' | 'tanim' | 'aktif' | 'parent_id'>[]
  initialKullanicilar: Pick<User, 'id' | 'isim_soyisim' | 'aktif'>[]
  projeId?: string | null
  personelAtamaAktif?: boolean
  ceklistAktif?: boolean
}) {
  const supabase = createClient()
  const { toast } = useToast()
  const { confirm, confirmChoice } = useConfirm()
  const { firmaId: saFirmaId } = useFirma()
  const [tenantFirmaId] = useState<string | null>(initialFirmaId ?? null)
  const firmaId = base === '/sa' ? saFirmaId : tenantFirmaId

  // Dış tıklamada details menüleri kapat
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function closeAllDetails(e: MouseEvent) {
      if (!containerRef.current) return
      containerRef.current.querySelectorAll('details[open]').forEach(d => {
        if (!d.contains(e.target as Node)) d.removeAttribute('open')
      })
    }
    document.addEventListener('click', closeAllDetails)
    return () => document.removeEventListener('click', closeAllDetails)
  }, [])

  const [gorevler, setGorevler]               = useState<any[]>(initialGorevler)
  const [lokasyonlar, setLokasyonlar]         = useState(initialLokasyonlar)
  const [kullanicilar, setKullanicilar]       = useState(initialKullanicilar)
  const [loading, setLoading]                 = useState(false)
  const [error, setError]                     = useState('')
  const [checklistGorev, setChecklistGorev]   = useState<{ id: string; type: 'gorevler' | 'canli_gorevler' } | null>(null)

  // Mesai kontrolü: personel takibi aktifse mesaili personel id'leri
  const [personelTakibiAktif, setPersonelTakibiAktif] = useState(false)
  const [mesailiPersonelIds, setMesailiPersonelIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function mesaiKontrolYukle() {
      try {
        const p = new URLSearchParams({ firma_id: firmaId })
        if (projeId) p.set('proje_id', projeId)
        const res = await fetch(`/api/simulasyon/personeller/mesai-durum?${p}`)
        const json = await res.json()
        if (json.ok) {
          setPersonelTakibiAktif(json.personel_takibi_aktif === true)
          setMesailiPersonelIds(new Set(json.mesaili_ids ?? []))
        }
      } catch {}
    }
    mesaiKontrolYukle()
  }, [firmaId, projeId])

  // ── Filtre state ──────────────────────────────────────────────────────────
  const [filtreArama,    setFiltreArama]    = useState('')
  const [filtreDurum,    setFiltreDurum]    = useState('')
  const [filtreAtananId, setFiltreAtananId] = useState('')
  const [filtreOlusFrom, setFiltreOlusFrom] = useState('')
  const [filtreOlusTo,   setFiltreOlusTo]   = useState('')
  const [filtreIslemFrom,setFiltreIslemFrom]= useState('')
  const [filtreIslemTo,  setFiltreIslemTo]  = useState('')
  const [arsivAktif,   setArsivAktif]   = useState(false)
  // Filtre için ayrı 3-kademeli lokasyon seçimi
  const [floc1, setFloc1] = useState('')
  const [floc2, setFloc2] = useState('')
  const [floc3, setFloc3] = useState('')

  // ── Form (create/edit) state ───────────────────────────────────────────────
  const [openForm, setOpenForm] = useState(false)
  const [editing,  setEditing]  = useState<any | null>(null)
  const [form, setForm]         = useState({ tanim: '', atanan_kullanici_id: '' })
  const [loc1, setLoc1]         = useState('')
  const [loc2, setLoc2]         = useState('')
  const [loc3, setLoc3]         = useState('')

  function showError(msg: string) {
    setError(msg)
    toast({ type: 'error', title: 'İşlem başarısız', message: msg })
  }
  function showSuccess(msg: string) {
    toast({ type: 'success', title: 'Başarılı', message: msg })
  }

  // ── Lokasyon yardımcıları ─────────────────────────────────────────────────
  const locMap = useMemo(() => {
    const map: Record<string, { tanim: string; parent_id: string | null }> = {}
    ;(lokasyonlar ?? []).forEach((l: any) => { map[l.id] = { tanim: l.tanim, parent_id: l.parent_id ?? null } })
    return map
  }, [lokasyonlar])

  const getLocPath = useMemo(() => {
    return (lokasyonId: string | null | undefined, fallbackName?: string | null) => {
      if (!lokasyonId) return fallbackName ?? '—'
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
      return parts.reverse().join(' / ') || (fallbackName ?? '—')
    }
  }, [locMap])

  const roots        = useMemo(() => (lokasyonlar ?? []).filter((l: any) => !l.parent_id), [lokasyonlar])
  const childrenOf   = useMemo(() => {
    const byParent: Record<string, any[]> = {}
    ;(lokasyonlar ?? []).forEach((l: any) => {
      const p = l.parent_id; if (!p) return
      if (!byParent[p]) byParent[p] = []
      byParent[p].push(l)
    })
    Object.values(byParent).forEach(arr => arr.sort((a: any, b: any) => (a.tanim ?? '').localeCompare(b.tanim ?? '')))
    return byParent
  }, [lokasyonlar])

  // Form için
  const loc2Options        = useMemo(() => loc1 ? (childrenOf[loc1] ?? []) : [], [childrenOf, loc1])
  const loc3Options        = useMemo(() => loc2 ? (childrenOf[loc2] ?? []) : [], [childrenOf, loc2])
  const selectedLokasyonId = useMemo(() => loc3 || loc2 || loc1, [loc1, loc2, loc3])

  // Filtre için
  const floc2Options        = useMemo(() => floc1 ? (childrenOf[floc1] ?? []) : [], [childrenOf, floc1])
  const floc3Options        = useMemo(() => floc2 ? (childrenOf[floc2] ?? []) : [], [childrenOf, floc2])
  const filtreSelectedLok   = useMemo(() => floc3 || floc2 || floc1, [floc1, floc2, floc3])

  // ── Realtime + init ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!firmaId) return
    refreshAll(firmaId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId])

  useEffect(() => {
    if (!firmaId) return
    const channel = supabase
      .channel(`gorevler-realtime-${firmaId}`)
      .on('postgres_changes' as any, { event: 'UPDATE', schema: 'public', table: 'gorevler', filter: `firma_id=eq.${firmaId}` },
        () => { refreshAll(firmaId) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId])

  // ── Sorgular ──────────────────────────────────────────────────────────────
  async function refreshAll(fid: string) {
    setLoading(true); setError('')
    const sinir24s = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    let gorevQuery = supabase.from('gorevler').select(SEL)
      .eq('firma_id', fid)
      .or(`durum.in.(ACIK,ISLEMDE),and(durum.eq.TAMAMLANDI,tamamlanma_tarihi.gt.${sinir24s})`)
      .order('olusturma_tarihi', { ascending: false }).limit(200)
    if (projeId) gorevQuery = (gorevQuery as any).eq('proje_id', projeId)
    let lokQuery = supabase.from('lokasyonlar').select('id,tanim,aktif,parent_id,checklist_sablon_id')
      .eq('firma_id', fid).eq('aktif', true).order('tanim')
    if (projeId) lokQuery = (lokQuery as any).eq('proje_id', projeId)
    const [gRes, lRes, uRes] = await Promise.all([
      gorevQuery, lokQuery,
      (() => { let q = supabase.from('users').select('id,isim_soyisim,aktif').eq('firma_id', fid).eq('aktif', true).order('isim_soyisim'); if (projeId) q = (q as any).eq('proje_id', projeId); return q })(),
    ])
    if (gRes.error) showError(gRes.error.message)
    if (lRes.error) showError(lRes.error.message)
    if (uRes.error) showError(uRes.error.message)
    if (gRes.data) setGorevler(gRes.data)
    if (lRes.data) setLokasyonlar(lRes.data as any)
    if (uRes.data) setKullanicilar(uRes.data as any)
    setLoading(false)
  }

  async function filtrele() {
    if (!firmaId) return
    setLoading(true); setError('')

    // ── Ana tablo: gorevler ───────────────────────────────────────────────────
    let query = supabase.from('gorevler').select(SEL).eq('firma_id', firmaId)
    if (projeId) query = (query as any).eq('proje_id', projeId)

    if (filtreDurum) {
      query = (query as any).eq('durum', filtreDurum)
    }

    if (filtreSelectedLok) query = (query as any).eq('lokasyon_id', filtreSelectedLok)
    if (filtreAtananId)    query = (query as any).eq('atanan_kullanici_id', filtreAtananId)
    if (filtreOlusFrom)    query = (query as any).gte('olusturma_tarihi', filtreOlusFrom)
    if (filtreOlusTo)      query = (query as any).lte('olusturma_tarihi', filtreOlusTo + 'T23:59:59')
    if (filtreIslemFrom)   query = (query as any).gte('durum_degisim_tarihi', filtreIslemFrom)
    if (filtreIslemTo)     query = (query as any).lte('durum_degisim_tarihi', filtreIslemTo + 'T23:59:59')

    query = (query as any).order('olusturma_tarihi', { ascending: false }).limit(500)

    const { data, error: qErr } = await query
    if (qErr) showError(qErr.message)
    else setGorevler(data ?? [])
    setLoading(false)
    setArsivAktif(true)
  }

  function temizleFiltreler() {
    setFiltreDurum(''); setFiltreAtananId('')
    setFloc1(''); setFloc2(''); setFloc3('')
    setFiltreOlusFrom(''); setFiltreOlusTo('')
    setFiltreIslemFrom(''); setFiltreIslemTo('')
    setFiltreArama('')
    setArsivAktif(false)
    if (firmaId) refreshAll(firmaId)
  }

  // ── Client-side metin filtresi ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const s = filtreArama.trim().toLowerCase()
    if (!s) return gorevler
    return gorevler.filter(g =>
      (g.tanim ?? '').toLowerCase().includes(s) ||
      (getLocPath(g.lokasyon_id, g.lokasyonlar?.tanim) ?? '').toLowerCase().includes(s) ||
      (g.atanan?.isim_soyisim ?? '').toLowerCase().includes(s) ||
      (g.islemi_yapan?.isim_soyisim ?? '').toLowerCase().includes(s)
    )
  }, [filtreArama, gorevler, getLocPath])

  // ── Tablo + arşiv birleşik ─────────────────────────────────────────────────
  // gorevler_arsiv cron ile taşınana kadar kayıtlar gorevler'de kalır.
  // Arşiv kriteri: IPTAL veya (TAMAMLANDI + durum_degisim_tarihi > 24s önce)
  function isArsivKaydi(g: any): boolean {
    if (g.durum === 'IPTAL') return true
    if (g.durum === 'TAMAMLANDI' && g.durum_degisim_tarihi) {
      const sinir = Date.now() - 24 * 60 * 60 * 1000
      return new Date(g.durum_degisim_tarihi).getTime() < sinir
    }
    return false
  }

  const combinedRows = useMemo(() => {
    if (!arsivAktif) {
      return filtered.map(r => ({ ...r, _source: 'tablo' as const }))
    }
    // Uygula yapıldıysa: kayıtları arşiv/tablo olarak etiketle
    return filtered.map(r => ({
      ...r,
      _source: isArsivKaydi(r) ? ('arsiv' as const) : ('tablo' as const),
    })).sort((a, b) =>
      new Date(b.olusturma_tarihi ?? 0).getTime() - new Date(a.olusturma_tarihi ?? 0).getTime()
    )
  }, [arsivAktif, filtered])

  // ── CRUD ──────────────────────────────────────────────────────────────────
  function openCreate() {
    setEditing(null); setForm({ tanim: '', atanan_kullanici_id: '' })
    setLoc1(''); setLoc2(''); setLoc3(''); setOpenForm(true)
  }

  function openEdit(g: any) {
    setEditing(g); setForm({ tanim: g.tanim ?? '', atanan_kullanici_id: g.atanan_kullanici_id ?? '' })
    const chain: string[] = []
    let cur: string | null = g.lokasyon_id ?? null; let guard = 0
    while (cur && guard < 8) { chain.push(cur); cur = locMap[cur]?.parent_id ?? null; guard++ }
    const ordered = chain.reverse()
    setLoc1(ordered[0] ?? ''); setLoc2(ordered[1] ?? ''); setLoc3(ordered[2] ?? '')
    setOpenForm(true)
  }

  async function save() {
    if (!firmaId) { setError('Firma seçilmedi'); return }
    if (!form.tanim.trim() || !loc1 || (personelAtamaAktif && !form.atanan_kullanici_id)) {
      showError(personelAtamaAktif ? 'Tanım, lokasyon ve kullanıcı zorunludur.' : 'Tanım ve lokasyon zorunludur.'); return
    }
    setLoading(true); setError('')
    if (editing) {
      const reAssigned = editing.atanan_kullanici_id !== form.atanan_kullanici_id
      const patch: any = { tanim: form.tanim.trim(), lokasyon_id: selectedLokasyonId, atanan_kullanici_id: form.atanan_kullanici_id }
      if (reAssigned) patch.durum = 'ACIK'
      const { data: updated, error: err } = await supabase.from('gorevler').update(patch).eq('id', editing.id)
        .select(SEL).single()
      if (err) showError(err.message)
      else {
        setOpenForm(false); showSuccess('Görev güncellendi.')
        if (reAssigned && updated?.id) {
          await createGorevAtamaNotification({ supabase, aliciId: form.atanan_kullanici_id, gorevId: updated.id, tanim: updated.tanim, lokasyonTanim: getLocPath(updated.lokasyon_id, updated.lokasyonlar?.tanim), tarihIso: updated.olusturma_tarihi })
        }
        await refreshAll(firmaId)
      }
    } else {
      const { data: inserted, error: err } = await supabase.from('gorevler').insert({
        firma_id: firmaId, tanim: form.tanim.trim(), lokasyon_id: selectedLokasyonId,
        atanan_kullanici_id: form.atanan_kullanici_id, durum: 'ACIK', olusturan_id: meId,
        islemi_yapan_id: meId, durum_degisim_tarihi: new Date().toISOString(),
        ...(projeId ? { proje_id: projeId } : {}),
      }).select(SEL).single()
      if (err) showError(err.message)
      else {
        setOpenForm(false); showSuccess('Görev oluşturuldu. Atanan kullanıcıya bildirim gönderildi.')
        if (inserted?.id) {
          await createGorevAtamaNotification({ supabase, aliciId: form.atanan_kullanici_id, gorevId: inserted.id, tanim: inserted.tanim, lokasyonTanim: getLocPath(inserted.lokasyon_id, inserted.lokasyonlar?.tanim), tarihIso: inserted.olusturma_tarihi })
        }
        await refreshAll(firmaId)
      }
    }
    setLoading(false)
  }

  async function setDurum(g: any, durum: 'ACIK' | 'ISLEMDE' | 'TAMAMLANDI' | 'IPTAL') {
    setLoading(true); setError('')
    const patch: any = { durum, durum_degisim_tarihi: new Date().toISOString(), islemi_yapan_id: meId }
    const { data: updated, error: err } = await supabase.from('gorevler').update(patch).eq('id', g.id).select(SEL).single()
    if (err) showError(err.message)
    else {
      showSuccess('Görev durumu güncellendi.')
      if (firmaId && durum !== 'TAMAMLANDI' && updated) {
        const actionText = durum === 'IPTAL' ? 'iptal edildi' : durum === 'ISLEMDE' ? 'işleme alındı' : 'beklemeye alındı'
        await notifyTenantAdminsOnGorevStatusChange({ supabase, firmaId, gorev: { ...updated, durum: updated.durum as GorevDurum }, actionText, actorName: null })
      }
    }
    if (firmaId) await refreshAll(firmaId)
    setLoading(false)
  }

  async function del(id: string) {
    const secim = await confirmChoice({
      title: 'Görevi Sil', message: 'Bu görevi nasıl silmek istiyorsunuz?',
      options: [
        { label: 'Listeden Kaldır', value: 'soft', description: 'Görev veritabanında kalır, listede görünmez.' },
        { label: 'Kalıcı Olarak Sil', value: 'hard', description: 'Görev tamamen silinir. Bu işlem geri alınamaz.' },
      ],
      cancelText: 'İptal',
    })
    if (!secim) return
    if (secim === 'hard') {
      const ok2 = await confirm({ title: '⚠️ Kalıcı Silme Onayı', message: 'Bu görev veritabanından kalıcı olarak silinecek.\n\nBu işlem GERİ ALINAMAZ. Onaylıyor musunuz?', confirmText: 'Evet, Kalıcı Olarak Sil', cancelText: 'İptal', variant: 'danger' })
      if (!ok2) return
      setLoading(true); setError('')
      const res = await fetch('/api/tasks/sil', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id], tablo: 'gorevler', firma_id: firmaId }),
      })
      const json = await res.json()
      if (!json.ok) showError(json.error ?? 'Silinemedi')
      else { showSuccess('Görev kalıcı olarak silindi.'); setGorevler(prev => prev.filter(g => g.id !== id)) }
    } else {
      setLoading(true); setError('')
      const { error: err } = await supabase.from('gorevler').update({ durum: 'IPTAL', durum_degisim_tarihi: new Date().toISOString(), islemi_yapan_id: meId }).eq('id', id)
      if (err) showError(err.message)
      else { showSuccess('Görev listeden kaldırıldı.'); setGorevler(prev => prev.filter(g => g.id !== id)) }
    }
    if (firmaId) await refreshAll(firmaId)
    setLoading(false)
  }

  const canManage = !readonly

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={{ padding: '24px 28px' }}>
      <div className="verde-card">

        {/* ── Satır 1: Arama + Yenile + Görev Ekle ── */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="verde-input"
            placeholder="Ara (görev, lokasyon, kişi…)"
            value={filtreArama}
            onChange={e => setFiltreArama(e.target.value)}
            style={{ width: 240, flexShrink: 0 }}
          />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => firmaId && refreshAll(firmaId)} disabled={loading || !firmaId}>
              {loading ? 'Yükleniyor…' : '↻ Yenile'}
            </Button>
            {canManage && (
              <Button variant="primary" onClick={openCreate} disabled={!firmaId}>＋ Görev Ekle</Button>
            )}
          </div>
        </div>

        {/* ── Satır 2: Yatay Filtre Çubuğu ── */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 16px 0', alignItems: 'center', padding: '10px 12px', background: '#f8fbf8', borderRadius: 8, border: '1px solid #f3f4f6' }}>

          {/* Lokasyon — 3 kademe */}
          <select className="verde-select" value={floc1} onChange={e => { setFloc1(e.target.value); setFloc2(''); setFloc3('') }} style={{ width: 148 }}>
            <option value="">Lokasyon (Tümü)</option>
            {roots.map((l: any) => <option key={l.id} value={l.id}>{l.tanim}</option>)}
          </select>
          {floc2Options.length > 0 && (
            <select className="verde-select" value={floc2} onChange={e => { setFloc2(e.target.value); setFloc3('') }} style={{ width: 148 }}>
              <option value="">Alt Lokasyon</option>
              {floc2Options.map((l: any) => <option key={l.id} value={l.id}>{l.tanim}</option>)}
            </select>
          )}
          {floc3Options.length > 0 && (
            <select className="verde-select" value={floc3} onChange={e => setFloc3(e.target.value)} style={{ width: 148 }}>
              <option value="">Alt-Alt Lokasyon</option>
              {floc3Options.map((l: any) => <option key={l.id} value={l.id}>{l.tanim}</option>)}
            </select>
          )}

          {/* Atanan */}
          <select className="verde-select" value={filtreAtananId} onChange={e => setFiltreAtananId(e.target.value)} style={{ width: 148 }}>
            <option value="">Atanan (Tümü)</option>
            {kullanicilar.map((u: any) => <option key={u.id} value={u.id}>{u.isim_soyisim}</option>)}
          </select>

          {/* Durum */}
          <select className="verde-select" value={filtreDurum} onChange={e => setFiltreDurum(e.target.value)} style={{ width: 148 }}>
            <option value="">Durum (Tümü)</option>
            {DURUM_SECENEKLER.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>

          <div style={{ width: 1, height: 24, background: '#e5e7eb', flexShrink: 0 }} />

          {/* Oluşturma tarihi aralığı */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>Oluşturma:</span>
            <input type="date" className="verde-input" style={{ width: 140 }} value={filtreOlusFrom} onChange={e => setFiltreOlusFrom(e.target.value)} />
            <span style={{ fontSize: 12, color: '#9a9a9a' }}>—</span>
            <input type="date" className="verde-input" style={{ width: 140 }} value={filtreOlusTo} onChange={e => setFiltreOlusTo(e.target.value)} />
          </div>

          {/* İşlem tarihi aralığı */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>İşlem:</span>
            <input type="date" className="verde-input" style={{ width: 140 }} value={filtreIslemFrom} onChange={e => setFiltreIslemFrom(e.target.value)} />
            <span style={{ fontSize: 12, color: '#9a9a9a' }}>—</span>
            <input type="date" className="verde-input" style={{ width: 140 }} value={filtreIslemTo} onChange={e => setFiltreIslemTo(e.target.value)} />
          </div>

          {/* Uygula */}
          <button type="button" onClick={filtrele} disabled={loading || !firmaId}
            style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#1f2937', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: loading || !firmaId ? 0.7 : 1, whiteSpace: 'nowrap' }}>
            {loading ? 'Yükleniyor…' : '▶ Uygula'}
          </button>

          {/* Temizle */}
          <button type="button" onClick={temizleFiltreler}
            style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, color: '#4b5563', cursor: 'pointer' }}>
            Temizle
          </button>
        </div>

        {/* ── Tablo ── */}
        {!firmaId && base === '/sa' ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🏢</div>
            <div>Görevleri görmek için firma seçin.</div>
          </div>
        ) : (
          <>
            <div style={{ padding: '6px 18px', fontSize: 12, color: '#94a3b8', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 14 }}>
              <span><strong style={{ color: '#1f2937' }}>{combinedRows.length}</strong> kayıt</span>
              {arsivAktif && (
                <>
                  <span style={{ color: '#475569' }}>Tablo: <strong>{combinedRows.filter(r => r._source === 'tablo').length}</strong></span>
                  <span style={{ color: '#64748b' }}>Arşiv: <strong>{combinedRows.filter(r => r._source === 'arsiv').length}</strong></span>
                </>
              )}
            </div>
            <table className="verde-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead>
                <tr>
                  {arsivAktif && <th style={{ width: 72 }}>Kayıt Türü</th>}
                  <th style={{ width: 200 }}>Görev</th>
                  <th style={{ width: 180 }}>Lokasyon</th>
                  <th style={{ width: 140 }}>Atanan</th>
                  <th style={{ width: 110 }}>Durum</th>
                  <th style={{ width: 140 }}>Oluşturma</th>
                  <th style={{ width: 140 }}>İşlemi Yapan</th>
                  <th style={{ width: 140 }}>İşlem Tarihi</th>
                  {canManage && <th style={{ width: 180, textAlign: 'right' }}>Aksiyon</th>}
                </tr>
              </thead>
              <tbody>
                {combinedRows.map((g: any) => {
                  const isArsiv = g._source === 'arsiv'
                  // Arşiv satırlarında FK join yok — ID'den client-side çöz
                  const atananAd = isArsiv
                    ? (kullanicilar.find((u: any) => u.id === g.atanan_kullanici_id)?.isim_soyisim ?? '—')
                    : (g.atanan?.isim_soyisim ?? '—')
                  const islemiYapanAd = isArsiv
                    ? (kullanicilar.find((u: any) => u.id === g.islemi_yapan_id)?.isim_soyisim ?? '—')
                    : (g.islemi_yapan?.isim_soyisim ?? '—')
                  return (
                    <tr key={g.id + (isArsiv ? '-arsiv' : '')} style={isArsiv ? { background: '#f8fafc' } : undefined}>
                      {arsivAktif && (
                        <td>
                          <span style={{
                            display: 'inline-block', padding: '2px 8px', borderRadius: 6,
                            fontSize: 11, fontWeight: 700,
                            background: isArsiv ? '#f1f5f9' : '#e7f9e7',
                            color: isArsiv ? '#64748b' : '#1f2937',
                            border: `1px solid ${isArsiv ? '#cbd5e1' : '#bbf7d0'}`,
                          }}>
                            {isArsiv ? 'Arşiv' : 'Tablo'}
                          </span>
                        </td>
                      )}
                      <td style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isArsiv ? '#475569' : undefined }} title={g.tanim ?? ''}>{g.tanim}</td>
                      <td style={{ color: isArsiv ? '#64748b' : '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={getLocPath(g.lokasyon_id, g.lokasyonlar?.tanim)}>{getLocPath(g.lokasyon_id)}</td>
                      <td style={{ color: isArsiv ? '#64748b' : '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={atananAd}>{atananAd}</td>
                      <td>
                        <span className={`verde-badge ${DURUM_RENK[g.durum] ?? 'status-acik'}`}>{GOREV_DURUM_LABEL[g.durum] ?? g.durum}</span>
                      </td>
                      <td style={{ color: isArsiv ? '#94a3b8' : '#6b7280', fontSize: 13, whiteSpace: 'nowrap' }}>{g.olusturma_tarihi ? formatDateTime(g.olusturma_tarihi) : '—'}</td>
                      <td style={{ color: isArsiv ? '#94a3b8' : '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={islemiYapanAd}>{islemiYapanAd}</td>
                      <td style={{ color: isArsiv ? '#94a3b8' : '#6b7280', fontSize: 13, whiteSpace: 'nowrap' }}>
                        {g.durum_degisim_tarihi ? formatDateTime(g.durum_degisim_tarihi) : '—'}
                      </td>
                      {canManage && (
                        <td style={{ whiteSpace: 'nowrap', paddingRight: 8 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                            {/* Çeklist butonu — sadece çeklist bağlı görevlerde ve ayar aktifse */}
                            {ceklistAktif && g.lokasyonlar?.checklist_sablon_id && (
                              <button onClick={() => setChecklistGorev({ id: g.id, type: 'gorevler' })}
                                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                📋
                              </button>
                            )}
                            {/* Arşiv satırlarında düzenle/sil işlemleri gösterilmez */}
                            {!isArsiv && (
                              <>
                                <button onClick={() => openEdit(g)}
                                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#111827', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                  ✏️ Düzenle
                                </button>
                                <details style={{ position: 'relative', display: 'inline-block' }}>
                                  <summary style={{ listStyle: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', color: '#111827', fontSize: 12, fontWeight: 600 }}>
                                    İşlemler ▾
                                  </summary>
                                  <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 200, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '4px 0', minWidth: 155 }}
                                    onClick={e => (e.currentTarget.closest('details') as HTMLDetailsElement)?.removeAttribute('open')}>
                                    <button onClick={() => setDurum(g, 'ISLEMDE')} style={{ display: 'block', width: '100%', padding: '7px 14px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, color: '#334155' }}>🔄 İşlemde</button>
                                    <button onClick={() => setDurum(g, 'TAMAMLANDI')} style={{ display: 'block', width: '100%', padding: '7px 14px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, color: '#15803d' }}>✅ Tamamla</button>
                                    <button onClick={() => setDurum(g, 'IPTAL')} style={{ display: 'block', width: '100%', padding: '7px 14px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, color: '#d97706' }}>⛔ İptal</button>
                                    <div style={{ borderTop: '1px solid #f1f5f9', margin: '4px 0' }} />
                                    <button onClick={() => del(g.id)} style={{ display: 'block', width: '100%', padding: '7px 14px', background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 13, color: '#dc2626' }}>🗑️ Sil</button>
                                  </div>
                                </details>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
                {!combinedRows.length && (
                  <tr><td colSpan={canManage ? (arsivAktif ? 9 : 8) : (arsivAktif ? 8 : 7)} style={{ textAlign: 'center', color: '#6b7280', padding: '36px 0' }}>
                    Kriterlere uygun görev bulunamadı.
                  </td></tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* ── Görev oluştur / düzenle modal ── */}
      {openForm && canManage && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setOpenForm(false)}>
          <div className="verde-card" style={{ width: 920, maxWidth: 'calc(100vw - 40px)', padding: 0, overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{editing ? 'Görev Düzenle' : 'Görev Ekle'}</div>
              <Button variant="ghost" size="sm" onClick={() => setOpenForm(false)} style={{ padding: '4px 10px', fontSize: 12 }}>✕</Button>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 12 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="verde-label">Görev Tanımı *</label>
                  <input className="verde-input" value={form.tanim} onChange={e => setForm(f => ({ ...f, tanim: e.target.value }))} />
                </div>
                <div>
                  <label className="verde-label">Lokasyon *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr)', gap: 8 }}>
                    <select className="verde-input" value={loc1} onChange={e => { setLoc1(e.target.value); setLoc2(''); setLoc3('') }}>
                      <option value="">Lokasyon Seçiniz</option>
                      {roots.map((l: any) => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                    </select>
                    <select className="verde-input" value={loc2} onChange={e => { setLoc2(e.target.value); setLoc3('') }} disabled={!loc1 || loc2Options.length === 0}>
                      <option value="">{!loc1 ? 'Alt Lokasyon Seçiniz' : loc2Options.length === 0 ? 'Alt lokasyon yok' : 'Alt Lokasyon Seçiniz'}</option>
                      {loc2Options.map((l: any) => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                    </select>
                    <select className="verde-input" value={loc3} onChange={e => setLoc3(e.target.value)} disabled={!loc2 || loc3Options.length === 0}>
                      <option value="">{!loc2 ? 'Alt Lokasyon Seçiniz' : loc3Options.length === 0 ? 'Alt lokasyon yok' : 'Alt Lokasyon Seçiniz'}</option>
                      {loc3Options.map((l: any) => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                    </select>
                  </div>
                </div>
                {personelAtamaAktif && (
                <div>
                  <label className="verde-label">Atanan Kullanıcı *</label>
                  <select className="verde-input" value={form.atanan_kullanici_id} onChange={e => setForm(f => ({ ...f, atanan_kullanici_id: e.target.value }))}>
                    <option value="">Seçin...</option>
                    {kullanicilar.map(u => {
                      const mesaiYok = personelTakibiAktif && !mesailiPersonelIds.has(u.id)
                      return (
                        <option key={u.id} value={u.id} disabled={mesaiYok}>
                          {u.isim_soyisim}{mesaiYok ? ' (mesai yok)' : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <Button variant="primary" onClick={save} disabled={loading}>{loading ? 'Kaydediliyor…' : '✓ Kaydet'}</Button>
                <Button variant="ghost" onClick={() => setOpenForm(false)}>İptal</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Çeklist modal ── */}
      {checklistGorev && (
        <ChecklistModal taskId={checklistGorev.id} taskType={checklistGorev.type} onKapat={() => setChecklistGorev(null)} />
      )}
    </div>
  )
}
