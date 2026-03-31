'use client'

import React from 'react'
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
const SEL_ARSIV = '*,lokasyonlar(id,tanim,parent_id,checklist_sablon_id),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim),olusturan:users!olusturan_id(isim_soyisim)'

export default function GorevlerClient({
  base, meId, readonly, initialFirmaId, initialGorevler, initialLokasyonlar, initialKullanicilar, projeId,
}: {
  base: '/sa' | '/ta' | '/u'
  meId: string
  readonly: boolean
  initialFirmaId?: string | null
  initialGorevler: any[]
  initialLokasyonlar: Pick<Lokasyon, 'id' | 'tanim' | 'aktif' | 'parent_id'>[]
  initialKullanicilar: Pick<User, 'id' | 'isim_soyisim' | 'aktif'>[]
  projeId?: string | null
}) {
  const supabase = createClient()
  const { toast } = useToast()
  const { confirm, confirmChoice } = useConfirm()
  const { firmaId: saFirmaId } = useFirma()
  const [tenantFirmaId] = useState<string | null>(initialFirmaId ?? null)
  const firmaId = base === '/sa' ? saFirmaId : tenantFirmaId

  const [gorevler, setGorevler]               = useState<any[]>(initialGorevler)
  const [lokasyonlar, setLokasyonlar]         = useState(initialLokasyonlar)
  const [kullanicilar, setKullanicilar]       = useState(initialKullanicilar)
  const [loading, setLoading]                 = useState(false)
  const [error, setError]                     = useState('')
  const [checklistGorev, setChecklistGorev]   = useState<{ id: string; type: 'gorevler' | 'canli_gorevler' } | null>(null)

  // ── Filtre state ──────────────────────────────────────────────────────────
  const [filtreAcik,     setFiltreAcik]     = useState(false)
  const [filtreArama,    setFiltreArama]    = useState('')
  const [filtreDurum,    setFiltreDurum]    = useState('')
  const [filtreAtananId, setFiltreAtananId] = useState('')
  const [filtreOlusFrom, setFiltreOlusFrom] = useState('')
  const [filtreOlusTo,   setFiltreOlusTo]   = useState('')
  const [filtreIslemFrom,setFiltreIslemFrom]= useState('')
  const [filtreIslemTo,  setFiltreIslemTo]  = useState('')
  const [arsivDahil,     setArsivDahil]     = useState(false)
  const [arsivRows,    setArsivRows]    = useState<any[]>([])
  const [arsivLoading, setArsivLoading] = useState(false)
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

  // Aktif filtre sayacı (badge)
  const aktifFiltreSayisi = useMemo(() => [
    filtreDurum, filtreSelectedLok, filtreAtananId,
    filtreOlusFrom, filtreOlusTo, filtreIslemFrom, filtreIslemTo,
    arsivDahil ? '1' : '',
  ].filter(Boolean).length, [filtreDurum, filtreSelectedLok, filtreAtananId, filtreOlusFrom, filtreOlusTo, filtreIslemFrom, filtreIslemTo, arsivDahil])

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
      supabase.from('users').select('id,isim_soyisim,aktif').eq('firma_id', fid).eq('aktif', true).order('isim_soyisim'),
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
    setLoading(true); setArsivLoading(true); setError('')
    const sinir24s = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // ── Ana tablo: gorevler ───────────────────────────────────────────────────
    let query = supabase.from('gorevler').select(SEL).eq('firma_id', firmaId)
    if (projeId) query = (query as any).eq('proje_id', projeId)

    if (filtreDurum) {
      query = (query as any).eq('durum', filtreDurum)
    } else if (!arsivDahil) {
      query = (query as any).or(`durum.in.(ACIK,ISLEMDE),and(durum.eq.TAMAMLANDI,tamamlanma_tarihi.gt.${sinir24s})`)
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

    // ── Arşiv tablosu: gorevler_arsiv ────────────────────────────────────────
    if (arsivDahil) {
      try {
        let aq = supabase.from('gorevler_arsiv').select(SEL_ARSIV + ',arsivleme_tarihi,arsiv_nedeni')
          .eq('firma_id', firmaId)
          .order('arsivleme_tarihi', { ascending: false })
          .limit(500)
        if (projeId)         aq = (aq as any).eq('proje_id', projeId)
        if (filtreDurum)     aq = (aq as any).eq('durum', filtreDurum)
        if (filtreSelectedLok) aq = (aq as any).eq('lokasyon_id', filtreSelectedLok)
        if (filtreAtananId)  aq = (aq as any).eq('atanan_kullanici_id', filtreAtananId)
        if (filtreOlusFrom)  aq = (aq as any).gte('olusturma_tarihi', filtreOlusFrom)
        if (filtreOlusTo)    aq = (aq as any).lte('olusturma_tarihi', filtreOlusTo + 'T23:59:59')
        if (filtreIslemFrom) aq = (aq as any).gte('durum_degisim_tarihi', filtreIslemFrom)
        if (filtreIslemTo)   aq = (aq as any).lte('durum_degisim_tarihi', filtreIslemTo + 'T23:59:59')
        const { data: arData } = await aq
        setArsivRows(arData ?? [])
        setArsivAktif(true)
      } finally {
        setArsivLoading(false)
      }
    } else {
      setArsivRows([])
      setArsivAktif(false)
      setArsivLoading(false)
    }
  }

  function temizleFiltreler() {
    setFiltreDurum(''); setFiltreAtananId('')
    setFloc1(''); setFloc2(''); setFloc3('')
    setFiltreOlusFrom(''); setFiltreOlusTo('')
    setFiltreIslemFrom(''); setFiltreIslemTo('')
    setArsivDahil(false); setFiltreArama('')
    setArsivRows([]); setArsivAktif(false)
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
  const combinedRows = useMemo(() => {
    const tablo = filtered.map(r => ({ ...r, _source: 'tablo' as const }))
    if (!arsivAktif || arsivRows.length === 0) return tablo

    const s = filtreArama.trim().toLowerCase()
    const filteredArsiv = arsivRows.filter((g: any) => {
      if (s) {
        const hay = [
          g.tanim ?? '',
          getLocPath(g.lokasyon_id, g.lokasyonlar?.tanim) ?? '',
          g.atanan?.isim_soyisim ?? '',
          g.islemi_yapan?.isim_soyisim ?? '',
        ].join(' ').toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })

    const arsiv = filteredArsiv.map(r => ({ ...r, _source: 'arsiv' as const }))
    const all = [...tablo, ...arsiv]
    all.sort((a, b) => {
      const da = a._source === 'arsiv' ? (a.arsivleme_tarihi ?? a.olusturma_tarihi) : a.olusturma_tarihi
      const db = b._source === 'arsiv' ? (b.arsivleme_tarihi ?? b.olusturma_tarihi) : b.olusturma_tarihi
      return new Date(db ?? 0).getTime() - new Date(da ?? 0).getTime()
    })
    return all
  }, [arsivAktif, filtered, arsivRows, filtreArama, getLocPath])

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
    if (!form.tanim.trim() || !loc1 || !form.atanan_kullanici_id) {
      showError('Tanım, lokasyon ve kullanıcı zorunludur.'); return
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
      const { error: err } = await supabase.from('gorevler').delete().eq('id', id)
      if (err) showError(err.message)
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

  // ── Stil yardımcıları ─────────────────────────────────────────────────────
  const inpS: React.CSSProperties = { height: 32, padding: '0 8px', borderRadius: 7, border: '1px solid #d6e4d6', fontSize: 12.5, background: '#fff', width: '100%', boxSizing: 'border-box' }
  const labelS: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: 3 }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 28px' }}>
      <div className="verde-card">

        {/* ── Araç çubuğu ── */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #e8f0e8', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="verde-input" placeholder="Görev, lokasyon, kullanıcı ara…" value={filtreArama} onChange={e => setFiltreArama(e.target.value)}
            style={{ maxWidth: 240, height: 34 }} />

          {/* Filtre toggle butonu */}
          <button
            onClick={() => setFiltreAcik(v => !v)}
            style={{
              height: 34, padding: '0 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
              border: `1px solid ${aktifFiltreSayisi > 0 ? '#1f6b1f' : '#d6e4d6'}`,
              background: aktifFiltreSayisi > 0 ? '#1f6b1f' : '#f0f9f0',
              color: aktifFiltreSayisi > 0 ? '#fff' : '#1f6b1f',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            ⚙ Filtreler
            {aktifFiltreSayisi > 0 && (
              <span style={{ background: '#fff', color: '#1f6b1f', borderRadius: 10, padding: '0 6px', fontSize: 11, fontWeight: 800 }}>
                {aktifFiltreSayisi}
              </span>
            )}
          </button>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => firmaId && refreshAll(firmaId)} disabled={loading || !firmaId}>
              {loading ? 'Yükleniyor…' : '↻ Yenile'}
            </Button>
            {canManage && (
              <Button variant="primary" onClick={openCreate} disabled={!firmaId}>＋ Görev Ekle</Button>
            )}
          </div>
        </div>

        {/* ── Filtre paneli ── */}
        {filtreAcik && (
          <div style={{ padding: '14px 18px', background: '#f8fcf8', borderBottom: '1px solid #e8f0e8' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 10 }}>

              {/* Durum */}
              <div>
                <label style={labelS}>Durum</label>
                <select value={filtreDurum} onChange={e => setFiltreDurum(e.target.value)} style={inpS}>
                  <option value="">Tüm Durumlar</option>
                  {DURUM_SECENEKLER.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>

              {/* Lokasyon — 3 kademe */}
              <div>
                <label style={labelS}>Lokasyon (1. Kademe)</label>
                <select value={floc1} onChange={e => { setFloc1(e.target.value); setFloc2(''); setFloc3('') }} style={inpS}>
                  <option value="">Tümü</option>
                  {roots.map((l: any) => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                </select>
              </div>
              <div>
                <label style={labelS}>Lokasyon (2. Kademe)</label>
                <select value={floc2} onChange={e => { setFloc2(e.target.value); setFloc3('') }} style={inpS} disabled={!floc1 || floc2Options.length === 0}>
                  <option value="">{floc1 && floc2Options.length === 0 ? 'Alt yok' : 'Tümü'}</option>
                  {floc2Options.map((l: any) => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                </select>
              </div>
              <div>
                <label style={labelS}>Lokasyon (3. Kademe)</label>
                <select value={floc3} onChange={e => setFloc3(e.target.value)} style={inpS} disabled={!floc2 || floc3Options.length === 0}>
                  <option value="">{floc2 && floc3Options.length === 0 ? 'Alt yok' : 'Tümü'}</option>
                  {floc3Options.map((l: any) => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                </select>
              </div>

              {/* Atanan kullanıcı */}
              <div>
                <label style={labelS}>Atanan Kullanıcı</label>
                <select value={filtreAtananId} onChange={e => setFiltreAtananId(e.target.value)} style={inpS}>
                  <option value="">Tümü</option>
                  {kullanicilar.map((u: any) => <option key={u.id} value={u.id}>{u.isim_soyisim}</option>)}
                </select>
              </div>

              {/* Oluşturma tarihi */}
              <div>
                <label style={labelS}>Oluşturma — Başlangıç</label>
                <input type="date" value={filtreOlusFrom} onChange={e => setFiltreOlusFrom(e.target.value)} style={inpS} />
              </div>
              <div>
                <label style={labelS}>Oluşturma — Bitiş</label>
                <input type="date" value={filtreOlusTo} onChange={e => setFiltreOlusTo(e.target.value)} style={inpS} />
              </div>

              {/* İşlem tarihi */}
              <div>
                <label style={labelS}>İşlem Tarihi — Başlangıç</label>
                <input type="date" value={filtreIslemFrom} onChange={e => setFiltreIslemFrom(e.target.value)} style={inpS} />
              </div>
              <div>
                <label style={labelS}>İşlem Tarihi — Bitiş</label>
                <input type="date" value={filtreIslemTo} onChange={e => setFiltreIslemTo(e.target.value)} style={inpS} />
              </div>

            </div>

            {/* Arşiv toggle + butonlar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: arsivDahil ? '#1f6b1f' : '#475569' }}>
                <input type="checkbox" checked={arsivDahil} onChange={e => setArsivDahil(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: '#1f6b1f', cursor: 'pointer' }} />
                Arşivden de getir (İptal + Tamamlanan eski kayıtlar)
              </label>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button onClick={temizleFiltreler}
                  style={{ height: 32, padding: '0 14px', borderRadius: 7, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                  Temizle
                </button>
                <button onClick={filtrele} disabled={loading || !firmaId}
                  style={{ height: 32, padding: '0 18px', borderRadius: 7, border: 'none', background: '#1f6b1f', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: loading || !firmaId ? 0.6 : 1 }}>
                  Uygula
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Tablo ── */}
        {!firmaId && base === '/sa' ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#7a907a' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🏢</div>
            <div>Görevleri görmek için firma seçin.</div>
          </div>
        ) : (
          <>
            <div style={{ padding: '6px 18px', fontSize: 12, color: '#94a3b8', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 14 }}>
              <span><strong style={{ color: '#1f6b1f' }}>{combinedRows.length}</strong> kayıt</span>
              {arsivAktif && (
                <>
                  <span style={{ color: '#475569' }}>Tablo: <strong>{filtered.length}</strong></span>
                  <span style={{ color: '#6d28d9' }}>Arşiv: <strong>{arsivRows.length}</strong></span>
                  {arsivLoading && <span style={{ color: '#d97706', fontSize: 11 }}>⏳ Arşiv yükleniyor…</span>}
                </>
              )}
              {aktifFiltreSayisi > 0 && <span style={{ marginLeft: 'auto', color: '#1f6b1f', fontWeight: 700 }}>· {aktifFiltreSayisi} filtre aktif</span>}
            </div>
            <table className="verde-table" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{ width: 240 }}>Görev</th>
                  <th style={{ width: 220 }}>Lokasyon</th>
                  <th style={{ width: 170 }}>Atanan</th>
                  <th style={{ width: 120 }}>Durum</th>
                  <th style={{ width: 170 }}>Oluşturma Tarihi</th>
                  <th style={{ width: 160 }}>İşlemi Yapan</th>
                  <th style={{ width: 170 }}>İşlem Tarihi</th>
                  {arsivAktif && <th style={{ width: 100 }}>Kayıt Türü</th>}
                  {canManage && <th style={{ width: 320, textAlign: 'right' }}>Aksiyon</th>}
                </tr>
              </thead>
              <tbody>
                {combinedRows.map((g: any) => {
                  const isArsiv = g._source === 'arsiv'
                  return (
                    <tr key={g.id + (isArsiv ? '-arsiv' : '')} style={isArsiv ? { background: '#faf8ff' } : undefined}>
                      <td style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.tanim ?? ''}>{g.tanim}</td>
                      <td style={{ color: '#506050', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={getLocPath(g.lokasyon_id, g.lokasyonlar?.tanim)}>{getLocPath(g.lokasyon_id, g.lokasyonlar?.tanim)}</td>
                      <td style={{ color: '#506050', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.atanan?.isim_soyisim ?? ''}>{g.atanan?.isim_soyisim ?? '—'}</td>
                      <td>
                        <span className={`verde-badge ${DURUM_RENK[g.durum] ?? 'status-acik'}`}>{GOREV_DURUM_LABEL[g.durum] ?? g.durum}</span>
                      </td>
                      <td style={{ color: '#7a907a', fontSize: 13, whiteSpace: 'nowrap' }}>{g.olusturma_tarihi ? formatDateTime(g.olusturma_tarihi) : '—'}</td>
                      <td style={{ color: '#506050', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.islemi_yapan?.isim_soyisim ?? ''}>{g.islemi_yapan?.isim_soyisim ?? '—'}</td>
                      <td style={{ color: '#7a907a', fontSize: 13, whiteSpace: 'nowrap' }}>{g.durum_degisim_tarihi ? formatDateTime(g.durum_degisim_tarihi) : '—'}</td>
                      {arsivAktif && (
                        <td>
                          <span style={{
                            padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                            background: isArsiv ? '#ede9fe' : '#dcfce7',
                            color: isArsiv ? '#5b21b6' : '#166534',
                          }}>
                            {isArsiv ? 'Arşiv' : 'Tablo'}
                          </span>
                        </td>
                      )}
                      {canManage && (
                        <td style={{ whiteSpace: 'nowrap', paddingRight: 12 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                            {/* Çeklist butonu — sadece çeklist bağlı görevlerde */}
                            {g.lokasyonlar?.checklist_sablon_id && (
                              <button onClick={() => setChecklistGorev({ id: g.id, type: 'gorevler' })}
                                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                                📋
                              </button>
                            )}
                            {/* Arşiv satırlarında düzenle/sil işlemleri gösterilmez */}
                            {!isArsiv && (
                              <>
                                <button onClick={() => openEdit(g)}
                                  style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #d6e4d6', background: '#f0f9f0', color: '#1a5c2a', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                                  ✏️ Düzenle
                                </button>
                                <details style={{ position: 'relative', display: 'inline-block' }}>
                                  <summary style={{ listStyle: 'none', cursor: 'pointer', padding: '5px 12px', borderRadius: 6, border: '1px solid #d6e4d6', background: '#f0f9f0', color: '#1a5c2a', fontSize: 12.5, fontWeight: 600 }}>
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
                  <tr><td colSpan={canManage ? (arsivAktif ? 9 : 8) : (arsivAktif ? 8 : 7)} style={{ textAlign: 'center', color: '#7a907a', padding: '36px 0' }}>
                    {aktifFiltreSayisi > 0 ? 'Filtreyle eşleşen görev bulunamadı.' : 'Görev bulunamadı.'}
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
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #e8f0e8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1a0f' }}>{editing ? 'Görev Düzenle' : 'Görev Ekle'}</div>
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
                <div>
                  <label className="verde-label">Atanan Kullanıcı *</label>
                  <select className="verde-input" value={form.atanan_kullanici_id} onChange={e => setForm(f => ({ ...f, atanan_kullanici_id: e.target.value }))}>
                    <option value="">Seçin...</option>
                    {kullanicilar.map(u => <option key={u.id} value={u.id}>{u.isim_soyisim}</option>)}
                  </select>
                </div>
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
