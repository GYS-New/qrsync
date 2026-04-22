'use client'

import { useCallback, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime, CANLI_DURUM_LABEL } from '@/lib/utils'
import { KanalBadge } from '@/components/shared/KanalBadge'

const DURUM_RENK: Record<string, string> = {
  HAZIR: 'status-hazir', ACIK: 'status-acik', BEKLEMEDE: 'status-beklemede', ISLEMDE: 'status-islemde',
  TAMAMLANDI: 'status-tamamlandi', ZAMANINDA_YAPILAMAYAN: 'status-zamaninda',
  ZAMANINDA_TAMAMLANDI: 'status-tamamlandi', ZAMANI_GECMIS: 'status-zamaninda',
  IPTAL: 'status-iptal', SILINDI: 'status-silindi', KAPATILDI: 'status-kapatildi',
}

const SEL = '*,lokasyonlar(id,tanim),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim),olusturan:users!olusturan_id(isim_soyisim),tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim)'

export default function TumGorevlerClient({
  base,
  firmaId,
  projeId,
  readonly,
  lokasyonlar,
  kullanicilar,
  initialGorevler,
}: {
  base: '/sa' | '/ta' | '/u'
  firmaId: string
  projeId?: string | null
  readonly: boolean
  lokasyonlar: { id: string; tanim: string; parent_id?: string | null }[]
  kullanicilar: { id: string; isim_soyisim: string }[]
  initialGorevler: any[]
}) {
  const supabase = createClient()

  // ── Filtre state (draft — Uygula'ya basılmadan etkilenmez) ───────────────
  const [q,          setQ]          = useState('')
  const [kullaniciId,setKullaniciId]= useState('')
  const [durum,      setDurum]      = useState('')
  const [from,       setFrom]       = useState('')
  const [to,         setTo]         = useState('')

  // ── Lokasyon hiyerarşisi (3 seviye) ──────────────────────────────────────
  const [loc1, setLoc1] = useState('')
  const [loc2, setLoc2] = useState('')
  const [loc3, setLoc3] = useState('')

  const locMap = useMemo(() => {
    const m: Record<string, { tanim: string; parent_id: string | null }> = {}
    lokasyonlar.forEach(l => { m[l.id] = { tanim: l.tanim, parent_id: l.parent_id ?? null } })
    return m
  }, [lokasyonlar])

  const childrenOf = useMemo(() => {
    const byParent: Record<string, typeof lokasyonlar> = {}
    lokasyonlar.forEach(l => {
      const p = l.parent_id ?? null
      if (!p) return
      if (!byParent[p]) byParent[p] = []
      byParent[p].push(l)
    })
    Object.values(byParent).forEach(arr => arr.sort((a, b) => a.tanim.localeCompare(b.tanim)))
    return byParent
  }, [lokasyonlar])

  const roots       = useMemo(() => lokasyonlar.filter(l => !l.parent_id).sort((a,b) => a.tanim.localeCompare(b.tanim)), [lokasyonlar])
  const loc2Options = useMemo(() => loc1 ? (childrenOf[loc1] ?? []) : [], [childrenOf, loc1])
  const loc3Options = useMemo(() => loc2 ? (childrenOf[loc2] ?? []) : [], [childrenOf, loc2])
  const selectedLokasyonId = loc3 || loc2 || loc1

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

  // ── Veri state ───────────────────────────────────────────────────────────
  const [rows,      setRows]      = useState<any[]>(initialGorevler)
  const [arsivRows, setArsivRows] = useState<any[]>([])
  const [loading,   setLoading]   = useState(false)
  const [filtered,  setFiltered]  = useState(false)

  // ── Uygula ───────────────────────────────────────────────────────────────
  const uygula = useCallback(async () => {
    setLoading(true)
    try {
      const fromISO = from ? new Date(from + 'T00:00:00').toISOString() : null
      const toISO   = to   ? new Date(to   + 'T23:59:59').toISOString() : null

      function applyFilters(q: any, tarihField: string) {
        if (projeId) q = q.or(`proje_id.eq.${projeId},proje_id.is.null`)
        if (selectedLokasyonId) q = q.eq('lokasyon_id', selectedLokasyonId)
        if (kullaniciId) q = q.eq('atanan_kullanici_id', kullaniciId)
        if (durum) q = q.eq('durum', durum)
        if (fromISO) q = q.gte(tarihField, fromISO)
        if (toISO)   q = q.lte(tarihField, toISO)
        return q
      }

      let tblQ = supabase.from('canli_gorevler').select(SEL).eq('firma_id', firmaId)
        .order('aktif_olma_tarihi', { ascending: false }).limit(500)
      tblQ = applyFilters(tblQ, 'aktif_olma_tarihi')

      let arsQ = supabase.from('canli_gorevler_arsiv').select(SEL + ',arsiv_tarihi,arsiv_nedeni,kural:gorev_kurallari!arsiv_kural_fkey(tanim)')
        .eq('firma_id', firmaId).order('arsiv_tarihi', { ascending: false }).limit(500)
      arsQ = applyFilters(arsQ, 'arsiv_tarihi')

      const [tblRes, arsRes] = await Promise.all([tblQ, arsQ])
      setRows(tblRes.data ?? [])
      setArsivRows(arsRes.data ?? [])
      setFiltered(true)
    } finally { setLoading(false) }
  }, [firmaId, projeId, selectedLokasyonId, kullaniciId, durum, from, to, supabase])

  // ── Temizle ──────────────────────────────────────────────────────────────
  function clear() {
    setQ(''); setLoc1(''); setLoc2(''); setLoc3('')
    setKullaniciId(''); setDurum(''); setFrom(''); setTo('')
    setRows(initialGorevler); setArsivRows([]); setFiltered(false)
  }

  // ── Metin filtresi (sadece arama kutusu için client-side) ─────────────────
  const displayRows = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return rows
    return rows.filter((g: any) =>
      [g.tanim ?? '', getLocPath(g.lokasyon_id), g.atanan?.isim_soyisim ?? ''].join(' ').toLowerCase().includes(s)
    )
  }, [rows, q, getLocPath])

  const displayArsiv = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return arsivRows
    return arsivRows.filter((g: any) =>
      [g.tanim ?? '', getLocPath(g.lokasyon_id), g.atanan?.isim_soyisim ?? ''].join(' ').toLowerCase().includes(s)
    )
  }, [arsivRows, q, getLocPath])

  return (
    <div className="verde-card" style={{ padding: 16 }}>
      <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', gap: 12, flexWrap:'wrap', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#111827' }}>FREKANSİYEL GÖREV YÖNETİMİ</div>
          <div style={{ fontSize: 14, color: '#6b7280', marginTop: 2 }}>
            Filtreleri seçip <strong>Uygula</strong>'ya basın — tablo ve arşiv kayıtları birlikte görünür
          </div>
        </div>
        <a href={`${base}/dashboard/canli-islemler`} className="text-[14px] underline" style={{ color:'#374151' }}>
          Canlı Görevler'e Dön
        </a>
      </div>

      {/* ── Filtre satırı ── */}
      <div style={{ display:'flex', gap: 8, flexWrap:'wrap', marginBottom: 14, alignItems:'center' }}>
        <input
          value={q} onChange={e => setQ(e.target.value)}
          placeholder="Görev / kişi ara…"
          className="verde-input" style={{ minWidth: 180 }}
        />

        {/* Lokasyon — 3 seviye */}
        <select className="verde-select" value={loc1} onChange={e => { setLoc1(e.target.value); setLoc2(''); setLoc3('') }} style={{ minWidth: 160 }}>
          <option value="">Lokasyon (Tümü)</option>
          {roots.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
        </select>
        {loc2Options.length > 0 && (
          <select className="verde-select" value={loc2} onChange={e => { setLoc2(e.target.value); setLoc3('') }} style={{ minWidth: 150 }}>
            <option value="">Alt Lokasyon</option>
            {loc2Options.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
          </select>
        )}
        {loc3Options.length > 0 && (
          <select className="verde-select" value={loc3} onChange={e => setLoc3(e.target.value)} style={{ minWidth: 150 }}>
            <option value="">Alt-Alt Lokasyon</option>
            {loc3Options.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
          </select>
        )}

        <select className="verde-select" value={kullaniciId} onChange={e => setKullaniciId(e.target.value)} style={{ minWidth: 180 }}>
          <option value="">Atanan (Tümü)</option>
          {kullanicilar.map(u => <option key={u.id} value={u.id}>{u.isim_soyisim}</option>)}
        </select>

        <select className="verde-select" value={durum} onChange={e => setDurum(e.target.value)} style={{ minWidth: 160 }}>
          <option value="">Durum (Tümü)</option>
          {Object.entries(CANLI_DURUM_LABEL).map(([k,v]) => <option key={k} value={k}>{v as string}</option>)}
        </select>

        <input type="date" className="verde-input" value={from} onChange={e => setFrom(e.target.value)} />
        <span style={{ color:'#94a3b8', fontSize:13 }}>—</span>
        <input type="date" className="verde-input" value={to} onChange={e => setTo(e.target.value)} />

        <button
          type="button" onClick={uygula} disabled={loading}
          style={{ height:36, padding:'0 16px', borderRadius:8, border:'none', background:'#1f2937', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Yükleniyor…' : '▶ Uygula'}
        </button>
        <button
          type="button" onClick={clear}
          className="border border-[#e5e7eb] px-3 py-2 rounded-[10px] text-[14px] hover:bg-[#fafafa]">
          Temizle
        </button>
      </div>

      {/* ── Tablo — Aktif kayıtlar ── */}
      <div style={{ fontSize:12, fontWeight:700, color:'#1f2937', marginBottom:4 }}>
        TABLO ({displayRows.length} kayıt)
      </div>
      <div className="verde-table-wrap" style={{ marginBottom: filtered && displayArsiv.length > 0 ? 24 : 0 }}>
        <table className="verde-table">
          <thead>
            <tr>
              <th>Görev</th><th>Lokasyon</th><th>Atanan</th>
              <th>Aktif Saat</th><th>Durum</th>
              <th>Kanal</th>
              <th>İşlemi Yapan</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((g: any) => (
              <tr key={g.id}>
                <td style={{ fontWeight: 600 }}>{g.tanim}</td>
                <td style={{ color:'#4b5563' }}>{getLocPath(g.lokasyon_id)}</td>
                <td style={{ color:'#4b5563' }}>{g.atanan?.isim_soyisim ?? '—'}</td>
                <td style={{ color:'#6b7280', whiteSpace:'nowrap', fontSize: 13 }}>{g.aktif_olma_tarihi ? formatDateTime(g.aktif_olma_tarihi) : '—'}</td>
                <td>
                  <span className={`verde-badge ${DURUM_RENK[g.durum] ?? 'status-acik'}`}>
                    {CANLI_DURUM_LABEL[g.durum] ?? g.durum}
                  </span>
                </td>
                <td><KanalBadge value={g.son_tamamlama_kanali} size="sm" /></td>
                <td style={{ color:'#6b7280', fontSize:13 }}>{g.islemi_yapan?.isim_soyisim ?? '—'}</td>
              </tr>
            ))}
            {!displayRows.length && (
              <tr><td colSpan={7} style={{ textAlign:'center', color:'#6b7280', padding:'26px 0', fontSize: 14 }}>
                {filtered ? 'Kriterlere uygun aktif kayıt bulunamadı.' : 'Görev bulunamadı.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Arşiv kayıtları (sadece filtre uygulandıysa) ── */}
      {filtered && (
        <>
          <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:4, marginTop: 8 }}>
            ARŞİV ({displayArsiv.length} kayıt)
          </div>
          <div className="verde-table-wrap">
            <table className="verde-table">
              <thead>
                <tr>
                  <th>Görev</th><th>Lokasyon</th><th>Atanan</th>
                  <th>Aktif Saat</th><th>Durum</th>
                  <th>Kanal</th>
                  <th>Arşiv Tarihi</th>
                </tr>
              </thead>
              <tbody>
                {displayArsiv.map((g: any) => (
                  <tr key={g.id} style={{ background:'#f8fafc' }}>
                    <td style={{ fontWeight: 600, color:'#475569' }}>{g.tanim}</td>
                    <td style={{ color:'#64748b' }}>{getLocPath(g.lokasyon_id)}</td>
                    <td style={{ color:'#64748b' }}>{g.atanan?.isim_soyisim ?? '—'}</td>
                    <td style={{ color:'#94a3b8', whiteSpace:'nowrap', fontSize: 13 }}>{g.aktif_olma_tarihi ? formatDateTime(g.aktif_olma_tarihi) : '—'}</td>
                    <td>
                      <span className={`verde-badge ${DURUM_RENK[g.durum] ?? 'status-acik'}`}>
                        {CANLI_DURUM_LABEL[g.durum] ?? g.durum}
                      </span>
                    </td>
                    <td><KanalBadge value={g.son_tamamlama_kanali} size="sm" /></td>
                    <td style={{ color:'#94a3b8', whiteSpace:'nowrap', fontSize: 13 }}>{g.arsiv_tarihi ? formatDateTime(g.arsiv_tarihi) : '—'}</td>
                  </tr>
                ))}
                {!displayArsiv.length && (
                  <tr><td colSpan={7} style={{ textAlign:'center', color:'#6b7280', padding:'20px 0', fontSize: 14 }}>
                    Kriterlere uygun arşiv kaydı bulunamadı.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
