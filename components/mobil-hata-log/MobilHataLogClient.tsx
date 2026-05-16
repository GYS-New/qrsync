'use client'

import React, { useEffect, useMemo, useState } from 'react'

type Seviye = 'bilgi' | 'uyari' | 'hata' | 'kritik'

interface LogRow {
  id: string
  olusturuldu: string
  seviye: Seviye
  mesaj: string | null
  cihaz_id: string | null
  cihaz_modeli: string | null
  platform: string | null
  uygulama_versiyonu: string | null
  konum: string | null
  stack: string | null
  detay: any
  firma_id: string | null
  personel: string | null
  personel_id: string | null
  firma: string | null
}

interface Props {
  isSA: boolean
  firmalarListesi?: { id: string; firma_adi?: string; ticari_unvan?: string }[]
}

const SEVIYE_RENK: Record<Seviye, { bg: string; fg: string; label: string }> = {
  bilgi:   { bg: '#dbeafe', fg: '#1e40af', label: 'Bilgi' },
  uyari:   { bg: '#fef3c7', fg: '#92400e', label: 'Uyarı' },
  hata:    { bg: '#fee2e2', fg: '#991b1b', label: 'Hata' },
  kritik:  { bg: '#7f1d1d', fg: '#fff',    label: 'Kritik' },
}

export default function MobilHataLogClient({ isSA, firmalarListesi = [] }: Props) {
  const [tab, setTab] = useState<'loglar' | 'uyarilar'>('loglar')
  const [data, setData] = useState<LogRow[]>([])
  const [cihazModelleri, setCihazModelleri] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [gun, setGun] = useState(7)
  const [seviye, setSeviye] = useState<string>('')
  const [cihazModeli, setCihazModeli] = useState<string>('')
  const [q, setQ] = useState('')
  const [saFirma, setSaFirma] = useState<string | null>(null)
  const [detay, setDetay] = useState<LogRow | null>(null)

  function yukle() {
    setLoading(true)
    const p = new URLSearchParams({ gun: String(gun) })
    // 'Uyarılar' sekmesi → hata + kritik
    const seviyeEff = tab === 'uyarilar' ? 'hata,kritik' : seviye
    if (seviyeEff) p.set('seviye', seviyeEff)
    if (cihazModeli) p.set('cihazModeli', cihazModeli)
    if (q.trim()) p.set('q', q.trim())
    if (isSA && saFirma) p.set('firmaId', saFirma)
    fetch(`/api/sistem-loglari/mobil-hata-log?${p}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        setData(Array.isArray(j?.data) ? j.data : [])
        setCihazModelleri(Array.isArray(j?.cihaz_modelleri) ? j.cihaz_modelleri : [])
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { yukle() }, [tab, gun, seviye, cihazModeli, saFirma])

  function tarihFormat(iso: string) {
    try { return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return iso }
  }

  function islemOzet(r: LogRow): string {
    if (r.konum) {
      const p = r.konum.split('/').pop()?.split('.')[0] ?? r.konum
      return p
    }
    if (r.mesaj) return r.mesaj.split(/[:.]/)[0].slice(0, 30)
    return '—'
  }

  const filteredByQ = useMemo(() => {
    // Server'da arama yapıyoruz ama enter beklemeden client-side de filtre uyguluyalım
    if (!q.trim()) return data
    const needle = q.trim().toLowerCase()
    return data.filter(r =>
      (r.mesaj ?? '').toLowerCase().includes(needle) ||
      (r.konum ?? '').toLowerCase().includes(needle) ||
      (r.cihaz_id ?? '').toLowerCase().includes(needle),
    )
  }, [data, q])

  return (
    <div>
      <div style={{ padding: '12px 24px 0', display: 'flex', gap: 6, borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
        <button onClick={() => setTab('loglar')}
          style={{
            padding: '10px 18px', border: 'none', cursor: 'pointer',
            fontSize: 13.5, fontWeight: 700,
            color: tab === 'loglar' ? '#0f172a' : '#64748b',
            background: 'transparent',
            borderBottom: tab === 'loglar' ? '2px solid #7c3aed' : '2px solid transparent',
            marginBottom: -1,
          }}>
          📦 Loglar
        </button>
        <button onClick={() => setTab('uyarilar')}
          style={{
            padding: '10px 18px', border: 'none', cursor: 'pointer',
            fontSize: 13.5, fontWeight: 700,
            color: tab === 'uyarilar' ? '#0f172a' : '#64748b',
            background: 'transparent',
            borderBottom: tab === 'uyarilar' ? '2px solid #dc2626' : '2px solid transparent',
            marginBottom: -1,
          }}>
          ⚠️ Uyarılar
        </button>
      </div>

      <div style={{ padding: '20px 24px' }}>
        <div className="verde-card">
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="verde-input" placeholder="Ara (mesaj, konum, cihaz)…"
              value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') yukle() }}
              style={{ maxWidth: 230 }} />
            {isSA && firmalarListesi.length > 0 && (
              <select className="verde-select" value={saFirma ?? 'tumu'}
                onChange={e => setSaFirma(e.target.value === 'tumu' ? null : e.target.value)} style={{ width: 170 }}>
                <option value="tumu">Firma (Tümü)</option>
                {firmalarListesi.map(f => <option key={f.id} value={f.id}>{f.firma_adi ?? f.ticari_unvan}</option>)}
              </select>
            )}
            {tab === 'loglar' && (
              <select className="verde-select" value={seviye} onChange={e => setSeviye(e.target.value)} style={{ width: 140 }}>
                <option value="">Seviye (Tümü)</option>
                <option value="bilgi">Bilgi</option>
                <option value="uyari">Uyarı</option>
                <option value="hata">Hata</option>
                <option value="kritik">Kritik</option>
              </select>
            )}
            <select className="verde-select" value={gun} onChange={e => setGun(Number(e.target.value))} style={{ width: 130 }}>
              <option value={1}>Son 1 gün</option>
              <option value={7}>Son 7 gün</option>
              <option value={30}>Son 30 gün</option>
              <option value={90}>Son 90 gün</option>
              <option value={365}>Son 1 yıl</option>
            </select>
            <select className="verde-select" value={cihazModeli} onChange={e => setCihazModeli(e.target.value)} style={{ width: 200 }}>
              <option value="">Cihaz Modeli (Tümü)</option>
              {cihazModelleri.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button onClick={yukle} disabled={loading} className="verde-btn-outline-strong" style={{ padding: '7px 14px', fontSize: 13 }}>
              {loading ? 'Yükleniyor…' : '↻ Yenile'}
            </button>
            <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#6b7280' }}>
              <strong>{filteredByQ.length}</strong> kayıt
            </span>
          </div>

          <div style={{ maxHeight: 'calc(100vh - 230px)', overflowY: 'auto' }}>
            <table className="verde-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                <col style={{ width: 140 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 150 }} />
                {isSA && <col style={{ width: 130 }} />}
                <col style={{ width: 150 }} />
                <col />
                <col style={{ width: 90 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>İşlem</th>
                  <th>Personel</th>
                  {isSA && <th>Firma</th>}
                  <th>Cihaz</th>
                  <th>Mesaj</th>
                  <th style={{ textAlign: 'center' }}>Durum</th>
                </tr>
              </thead>
              <tbody>
                {loading && filteredByQ.length === 0 ? (
                  <tr><td colSpan={isSA ? 7 : 6} style={{ textAlign: 'center', padding: 36, color: '#6b7280' }}>Yükleniyor…</td></tr>
                ) : filteredByQ.length === 0 ? (
                  <tr><td colSpan={isSA ? 7 : 6} style={{ textAlign: 'center', padding: 36, color: '#6b7280' }}>Kayıt bulunamadı</td></tr>
                ) : (
                  filteredByQ.map(r => {
                    const renk = SEVIYE_RENK[r.seviye] ?? SEVIYE_RENK.bilgi
                    return (
                      <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setDetay(r)}>
                        <td style={{ fontSize: 12.5, color: '#4b5563', whiteSpace: 'nowrap' }}>{tarihFormat(r.olusturuldu)}</td>
                        <td style={{ fontSize: 12.5, fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.konum ?? ''}>
                          {islemOzet(r)}
                        </td>
                        <td style={{ fontSize: 12.5, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.personel ?? <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>—</span>}
                        </td>
                        {isSA && (
                          <td style={{ fontSize: 12.5, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.firma ?? '—'}
                          </td>
                        )}
                        <td style={{ fontSize: 12, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.cihaz_modeli ?? ''}>
                          {r.cihaz_modeli ?? '—'}
                        </td>
                        <td style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.mesaj ?? ''}>
                          {r.mesaj ?? '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: renk.bg, color: renk.fg, fontWeight: 700 }}>
                            {renk.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {detay && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(15,26,15,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onMouseDown={e => { if (e.target === e.currentTarget) setDetay(null) }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 'min(720px, calc(100vw - 24px))', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800 }}>📱 Mobil Log Detayı</div>
              <button onClick={() => setDetay(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div><strong>Zaman:</strong> {tarihFormat(detay.olusturuldu)}</div>
              <div>
                <strong>Seviye:</strong>{' '}
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: SEVIYE_RENK[detay.seviye].bg, color: SEVIYE_RENK[detay.seviye].fg, fontWeight: 700 }}>
                  {SEVIYE_RENK[detay.seviye].label}
                </span>
              </div>
              <div><strong>Personel:</strong> {detay.personel ?? '—'} {detay.firma ? `(${detay.firma})` : ''}</div>
              <div><strong>Cihaz:</strong> {detay.cihaz_modeli ?? '—'} {detay.platform ? `(${detay.platform})` : ''}</div>
              <div><strong>Versiyon:</strong> {detay.uygulama_versiyonu ?? '—'}</div>
              <div><strong>Konum:</strong> <code style={{ fontSize: 12, background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{detay.konum ?? '—'}</code></div>
              {detay.mesaj && (
                <div style={{ marginTop: 6 }}>
                  <strong>Mesaj:</strong>
                  <div style={{ background: '#f9fafb', padding: 10, borderRadius: 8, marginTop: 4, fontSize: 12.5, color: '#1f2937', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {detay.mesaj}
                  </div>
                </div>
              )}
              {detay.detay && (
                <>
                  <div style={{ marginTop: 6 }}><strong>Detay (JSON):</strong></div>
                  <pre style={{ background: '#f9fafb', padding: 12, borderRadius: 8, fontSize: 11, overflow: 'auto', maxHeight: 240 }}>
                    {JSON.stringify(detay.detay, null, 2)}
                  </pre>
                </>
              )}
              {detay.stack && (
                <>
                  <div style={{ marginTop: 6 }}><strong>Stack Trace:</strong></div>
                  <pre style={{ background: '#1f2937', color: '#e5e7eb', padding: 12, borderRadius: 8, fontSize: 11, overflow: 'auto', maxHeight: 260, whiteSpace: 'pre' }}>
                    {detay.stack}
                  </pre>
                </>
              )}
              {detay.cihaz_id && (
                <div style={{ marginTop: 6, fontSize: 11, color: '#6b7280' }}>
                  <strong>Cihaz ID:</strong>{' '}
                  <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, userSelect: 'all' }}>{detay.cihaz_id}</code>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
