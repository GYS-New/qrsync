'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Search, ChevronDown, ChevronRight, Download } from 'lucide-react'

type Kural = {
  id: string
  tanim: string
  lokasyon_id: string
  lokasyon_tanim: string | null
  ust_lokasyon_id: string
  ust_lokasyon_tanim: string | null
  aktif_olma_saati: string
  vardiya_no: number | null
  frekans_tipi: 'gunluk' | 'haftalik' | string
  gunluk_frekans_sayisi: number | null
  haftalik_frekans_sayisi: number | null
  aktif_gunler: number[]
  sayi: number
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  green: '#16a34a', greenLight: '#dcfce7',
  amber: '#d97706', amberLight: '#fef3c7',
  grayLight: '#f8fafc',
}

const VARDIYA_RENK: Record<number, { bg: string; fg: string }> = {
  1: { bg: '#eff6ff', fg: '#1d4ed8' },  // mavi
  2: { bg: '#dcfce7', fg: '#166534' },  // yeşil
  3: { bg: '#fef3c7', fg: '#92400e' },  // sarı
  4: { bg: '#f3e8ff', fg: '#6b21a8' },  // mor
}

export default function FrekansSayilariClient({
  firmaId, projeId, collapsibleDefault = false,
}: {
  firmaId: string | null
  projeId: string | null
  /** SA/TA için true (üst lokasyon kartları varsayılan kapalı); U/M için false (açık) */
  collapsibleDefault?: boolean
}) {
  const [kurallar, setKurallar] = useState<Kural[]>([])
  const [vardiyaSayisi, setVardiyaSayisi] = useState(0)
  const [loading, setLoading] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [vardiyaFilter, setVardiyaFilter] = useState<number | 'all'>('all')
  const [ustLokFilter, setUstLokFilter] = useState<string>('all')
  const [acikUstler, setAcikUstler] = useState<Set<string>>(new Set())

  async function yukle() {
    if (!firmaId) { setKurallar([]); setLoading(false); return }
    setLoading(true)
    try {
      const p = new URLSearchParams({ firma_id: firmaId })
      if (projeId) p.set('proje_id', projeId)
      const res = await fetch(`/api/gorev-kurallari/frekans-sayilari?${p}`, { cache: 'no-store' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Yüklenemedi')
      setKurallar(j.kurallar ?? [])
      setVardiyaSayisi(j.vardiya_sayisi ?? 0)
      setHata(null)
    } catch (e: any) {
      setHata(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { yukle() }, [firmaId, projeId])

  const ustLokListesi = useMemo(() => {
    const m = new Map<string, string>()
    for (const k of kurallar) if (k.ust_lokasyon_tanim) m.set(k.ust_lokasyon_id, k.ust_lokasyon_tanim)
    return Array.from(m.entries())
      .map(([id, tanim]) => ({ id, tanim }))
      .sort((a, b) => a.tanim.localeCompare(b.tanim, 'tr'))
  }, [kurallar])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return kurallar.filter(k => {
      if (vardiyaFilter !== 'all' && k.vardiya_no !== vardiyaFilter) return false
      if (ustLokFilter !== 'all' && k.ust_lokasyon_id !== ustLokFilter) return false
      if (needle) {
        const hay = `${k.tanim} ${k.lokasyon_tanim ?? ''} ${k.ust_lokasyon_tanim ?? ''}`.toLowerCase()
        if (!hay.includes(needle)) return false
      }
      return true
    })
  }, [kurallar, q, vardiyaFilter, ustLokFilter])

  // Üst lokasyon → Alt lokasyon → Vardiya → kurallar grouping
  const grouped = useMemo(() => {
    type AltGrup = { lokasyon_id: string; lokasyon_tanim: string; vardiyalar: Map<number | string, Kural[]> }
    type UstGrup = { ust_lokasyon_id: string; ust_lokasyon_tanim: string; altlar: Map<string, AltGrup> }
    const map = new Map<string, UstGrup>()
    for (const k of filtered) {
      const ustId = k.ust_lokasyon_id
      const ustAd = k.ust_lokasyon_tanim ?? '—'
      if (!map.has(ustId)) map.set(ustId, { ust_lokasyon_id: ustId, ust_lokasyon_tanim: ustAd, altlar: new Map() })
      const ust = map.get(ustId)!
      const altId = k.lokasyon_id
      const altAd = k.lokasyon_tanim ?? '—'
      if (!ust.altlar.has(altId)) ust.altlar.set(altId, { lokasyon_id: altId, lokasyon_tanim: altAd, vardiyalar: new Map() })
      const alt = ust.altlar.get(altId)!
      const vKey = k.vardiya_no ?? '?'
      if (!alt.vardiyalar.has(vKey)) alt.vardiyalar.set(vKey, [])
      alt.vardiyalar.get(vKey)!.push(k)
    }
    return Array.from(map.values())
      .map(u => ({
        ...u,
        altlar: Array.from(u.altlar.values())
          .map(a => ({
            ...a,
            vardiyalar: Array.from(a.vardiyalar.entries())
              .map(([v, ks]) => ({ vardiya_no: v as number | string, kurallar: ks }))
              .sort((x, y) => {
                const xn = typeof x.vardiya_no === 'number' ? x.vardiya_no : 99
                const yn = typeof y.vardiya_no === 'number' ? y.vardiya_no : 99
                return xn - yn
              }),
          }))
          .sort((a, b) => a.lokasyon_tanim.localeCompare(b.lokasyon_tanim, 'tr')),
      }))
      .sort((a, b) => a.ust_lokasyon_tanim.localeCompare(b.ust_lokasyon_tanim, 'tr'))
  }, [filtered])

  // İlk yükleme veya filter sonrası açık ust seti default'a senkronla
  // collapsibleDefault=true → hepsi kapalı, false → hepsi açık
  useEffect(() => {
    if (collapsibleDefault) {
      setAcikUstler(new Set())
    } else {
      setAcikUstler(new Set(kurallar.map(k => k.ust_lokasyon_id)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsibleDefault, kurallar.length === 0])

  function toggleUst(id: string) {
    setAcikUstler(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function tumunuAc() { setAcikUstler(new Set(grouped.map(g => g.ust_lokasyon_id))) }
  function tumunuKapat() { setAcikUstler(new Set()) }

  // Mevcut filtre + sıralama uygulanmış kuralları Excel olarak indir
  async function exportExcel() {
    if (filtered.length === 0) return
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook(); wb.creator = 'İOGYS'
    const ws = wb.addWorksheet('Frekans Sayıları')
    ws.columns = [
      { header: 'Üst Lokasyon',    key: 'ust',    width: 26 },
      { header: 'Alt Lokasyon',    key: 'alt',    width: 30 },
      { header: 'Vardiya',         key: 'vard',   width: 10 },
      { header: 'Aktif Saat',      key: 'saat',   width: 12 },
      { header: 'Görev Tanımı',    key: 'tanim',  width: 36 },
      { header: 'Frekans Sayısı',  key: 'sayi',   width: 14 },
      { header: 'Tip',             key: 'tip',    width: 12 },
      { header: 'Aktif Günler',    key: 'gunler', width: 22 },
    ]
    ws.getRow(1).font = { bold: true }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }

    const GUN = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz']
    // grouped sırasıyla yaz (UI ile aynı: üst lok → alt lok → vardiya → kural)
    for (const ust of grouped) {
      for (const alt of ust.altlar) {
        for (const v of alt.vardiyalar) {
          for (const k of v.kurallar) {
            ws.addRow({
              ust: ust.ust_lokasyon_tanim,
              alt: alt.lokasyon_tanim,
              vard: typeof v.vardiya_no === 'number' ? `V${v.vardiya_no}` : '—',
              saat: k.aktif_olma_saati || '',
              tanim: k.tanim,
              sayi: k.sayi,
              tip: k.frekans_tipi === 'haftalik' ? 'Haftalık' : 'Günlük',
              gunler: k.frekans_tipi === 'haftalik' && Array.isArray(k.aktif_gunler) && k.aktif_gunler.length > 0
                ? k.aktif_gunler.map(g => GUN[(g - 1 + 7) % 7] ?? `?${g}`).join(', ')
                : '',
            })
          }
        }
      }
    }

    const buf = await wb.xlsx.writeBuffer()
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const ts = new Date().toISOString().slice(0, 10)
    a.download = `frekans-sayilari_${ts}.xlsx`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const ozetSayi = useMemo(() => {
    const t = { kural: filtered.length, gunluk_toplam: 0, haftalik_toplam: 0 }
    for (const k of filtered) {
      if (k.frekans_tipi === 'haftalik') t.haftalik_toplam += k.sayi
      else t.gunluk_toplam += k.sayi
    }
    return t
  }, [filtered])

  if (!firmaId) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: T.textSoft }}>
        Firma seçilmedi.
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Filtre barı */}
      <div className="verde-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Search size={14} color={T.textSoft} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tanım / lokasyon ara..."
          style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13, minWidth: 220 }} />
        {ustLokListesi.length > 1 && (
          <select value={ustLokFilter} onChange={e => setUstLokFilter(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13 }}>
            <option value="all">Üst Lokasyon (Tümü)</option>
            {ustLokListesi.map(u => <option key={u.id} value={u.id}>{u.tanim}</option>)}
          </select>
        )}
        {vardiyaSayisi > 0 && (
          <select value={vardiyaFilter} onChange={e => setVardiyaFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 13 }}>
            <option value="all">Vardiya (Tümü)</option>
            {Array.from({ length: vardiyaSayisi }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>V{n}</option>
            ))}
          </select>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: T.textSoft }}>
            <strong style={{ color: T.text }}>{ozetSayi.kural}</strong> kural ·
            günlük <strong style={{ color: T.text }}>{ozetSayi.gunluk_toplam}</strong>
            {ozetSayi.haftalik_toplam > 0 && <> · haftalık <strong style={{ color: T.text }}>{ozetSayi.haftalik_toplam}</strong></>}
          </span>
          {collapsibleDefault && grouped.length > 0 && (
            <>
              <button onClick={tumunuAc}
                style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                Tümünü Aç
              </button>
              <button onClick={tumunuKapat}
                style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                Tümünü Kapat
              </button>
            </>
          )}
          <button onClick={yukle} disabled={loading}
            style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <RefreshCw size={11} style={{ animation: loading ? 'spin 0.9s linear infinite' : undefined }} />
            Yenile
          </button>
          <button onClick={exportExcel} disabled={filtered.length === 0}
            title="Mevcut filtreyle Excel olarak indir"
            style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: filtered.length === 0 ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, opacity: filtered.length === 0 ? 0.5 : 1 }}>
            <Download size={11} />
            Excel
          </button>
        </div>
      </div>

      {hata && (
        <div className="verde-card" style={{ padding: 12, background: '#fee2e2', color: '#991b1b', fontSize: 13 }}>
          {hata}
        </div>
      )}

      {loading && kurallar.length === 0 ? (
        <div className="verde-card" style={{ padding: 60, textAlign: 'center', color: T.textSoft }}>
          <Loader2 size={26} style={{ animation: 'spin 0.9s linear infinite' }} />
          <div style={{ marginTop: 8 }}>Yükleniyor…</div>
        </div>
      ) : grouped.length === 0 ? (
        <div className="verde-card" style={{ padding: 60, textAlign: 'center', color: T.textSoft }}>
          Bu kriterlere uygun kural yok.
        </div>
      ) : (
        grouped.map(ust => {
          const acik = acikUstler.has(ust.ust_lokasyon_id)
          const kuralAdet = ust.altlar.reduce((s, a) => s + a.vardiyalar.reduce((sv, v) => sv + v.kurallar.length, 0), 0)
          return (
          <div key={ust.ust_lokasyon_id} className="verde-card" style={{ overflow: 'hidden' }}>
            <div
              onClick={() => toggleUst(ust.ust_lokasyon_id)}
              style={{ padding: '12px 14px', background: T.grayLight, borderBottom: acik ? `1px solid ${T.border}` : 'none', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
              {acik ? <ChevronDown size={16} color={T.textSoft} /> : <ChevronRight size={16} color={T.textSoft} />}
              <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>📍 {ust.ust_lokasyon_tanim}</span>
              <span style={{ fontSize: 11, color: T.textSoft }}>
                ({ust.altlar.length} alt lokasyon, {kuralAdet} kural)
              </span>
            </div>
            {acik && (
            <table className="verde-table" style={{ width: '100%', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '32%' }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 100 }} />
                <col />
                <col style={{ width: 70 }} />
                <col style={{ width: 90 }} />
              </colgroup>
              <thead style={{ background: '#fff' }}>
                <tr>
                  <th>Alt Lokasyon</th>
                  <th>Vardiya</th>
                  <th>Saat</th>
                  <th>Görev Tanımı</th>
                  <th style={{ textAlign: 'center' }}>Sayı</th>
                  <th style={{ textAlign: 'center' }}>Tip</th>
                </tr>
              </thead>
              <tbody>
                {ust.altlar.map(alt =>
                  alt.vardiyalar.flatMap(varObj => {
                    const renk = typeof varObj.vardiya_no === 'number' ? VARDIYA_RENK[varObj.vardiya_no] : null
                    return varObj.kurallar.map((k, idx) => (
                      <tr key={k.id}>
                        <td style={{ fontSize: 12.5, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {idx === 0 ? alt.lokasyon_tanim : ''}
                        </td>
                        <td>
                          {idx === 0 && (
                            <span style={{
                              display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                              background: renk?.bg ?? '#f3f4f6', color: renk?.fg ?? T.textSoft,
                              fontSize: 11, fontWeight: 800,
                            }}>
                              V{varObj.vardiya_no}
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: 13.5, color: T.text, fontFamily: 'monospace', fontWeight: 600 }}>
                          {idx === 0 ? k.aktif_olma_saati : ''}
                        </td>
                        <td style={{ fontSize: 12.5, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k.tanim}>
                          {k.tanim}
                        </td>
                        <td style={{ fontSize: 13, fontWeight: 800, color: T.text, textAlign: 'center' }}>
                          {k.sayi}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: k.frekans_tipi === 'haftalik' ? T.amberLight : T.greenLight, color: k.frekans_tipi === 'haftalik' ? T.amber : T.green, fontWeight: 700 }}>
                            {k.frekans_tipi === 'haftalik' ? 'HAFTALIK' : 'GÜNLÜK'}
                          </span>
                        </td>
                      </tr>
                    ))
                  })
                )}
              </tbody>
            </table>
            )}
          </div>
          )
        })
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
