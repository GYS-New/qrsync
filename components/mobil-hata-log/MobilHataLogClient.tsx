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
  network_type: string | null
  personel: string | null
  personel_id: string | null
  firma: string | null
}

interface Props {
  isSA: boolean
  firmalarListesi?: { id: string; firma_adi?: string; ticari_unvan?: string }[]
}

const SEVIYE_RENK: Record<Seviye, { bg: string; fg: string; label: string; icon: string }> = {
  bilgi:   { bg: '#dcfce7', fg: '#166534', label: 'Bilgi',  icon: 'ℹ' },
  uyari:   { bg: '#fef3c7', fg: '#92400e', label: 'Uyarı',  icon: '⚡' },
  hata:    { bg: '#ffedd5', fg: '#9a3412', label: 'Hata',   icon: '⚠' },
  kritik:  { bg: '#7f1d1d', fg: '#fff',    label: 'Kritik', icon: '⛔' },
}

const NETWORK_BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  wifi:     { bg: '#dbeafe', fg: '#1e40af', label: 'WiFi' },
  '5g':     { bg: '#ede9fe', fg: '#6b21a8', label: '5G' },
  '4g':     { bg: '#dbeafe', fg: '#1d4ed8', label: '4G' },
  '3g':     { bg: '#f3f4f6', fg: '#4b5563', label: '3G' },
  '2g':     { bg: '#f3f4f6', fg: '#4b5563', label: '2G' },
  cellular: { bg: '#f3f4f6', fg: '#4b5563', label: 'Cell' },
  none:     { bg: '#fee2e2', fg: '#991b1b', label: '✕' },
  unknown:  { bg: '#f3f4f6', fg: '#6b7280', label: '?' },
}

type HizliFiltre = 'son_1_saat' | 'bugun_kritik_hata' | 'qr_debug' | 'cevrim_disi' | 'offline_fail'

export default function MobilHataLogClient({ isSA, firmalarListesi = [] }: Props) {
  const [data, setData] = useState<LogRow[]>([])
  const [toplam, setToplam] = useState(0)
  const [ozet24, setOzet24] = useState({ kritik: 0, hata: 0, uyari: 0, bilgi: 0 })
  const [cihazModelleri, setCihazModelleri] = useState<string[]>([])
  const [networkTypesAvail, setNetworkTypesAvail] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  // Filtreler
  const [gun, setGun] = useState(7)
  const [seviyeSet, setSeviyeSet] = useState<Set<Seviye>>(new Set(['kritik','hata','uyari']))
  const [cihazModeli, setCihazModeli] = useState<string>('')
  const [networkType, setNetworkType] = useState<string>('')
  const [q, setQ] = useState('')
  const [konumIcerir, setKonumIcerir] = useState('')
  const [konumExact, setKonumExact] = useState('')
  const [mesajIcerir, setMesajIcerir] = useState('')
  const [saFirma, setSaFirma] = useState<string | null>(null)
  const [hizli, setHizli] = useState<HizliFiltre | null>(null)
  const [detay, setDetay] = useState<LogRow | null>(null)
  const [jsonCopied, setJsonCopied] = useState(false)

  function yukle() {
    setLoading(true)
    const p = new URLSearchParams({ gun: String(gun) })
    if (seviyeSet.size > 0 && seviyeSet.size < 4) p.set('seviye', [...seviyeSet].join(','))
    if (cihazModeli) p.set('cihazModeli', cihazModeli)
    if (networkType) p.set('networkType', networkType)
    if (q.trim()) p.set('q', q.trim())
    if (konumExact) p.set('konumExact', konumExact)
    else if (konumIcerir.trim()) p.set('konumIcerir', konumIcerir.trim())
    if (mesajIcerir.trim()) p.set('mesajIcerir', mesajIcerir.trim())
    if (isSA && saFirma) p.set('firmaId', saFirma)
    fetch(`/api/sistem-loglari/mobil-hata-log?${p}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        setData(Array.isArray(j?.data) ? j.data : [])
        setToplam(j?.toplam ?? 0)
        setOzet24(j?.ozet_24_saat ?? { kritik: 0, hata: 0, uyari: 0, bilgi: 0 })
        setCihazModelleri(Array.isArray(j?.cihaz_modelleri) ? j.cihaz_modelleri : [])
        setNetworkTypesAvail(Array.isArray(j?.network_types) ? j.network_types : [])
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { yukle() }, [gun, seviyeSet, cihazModeli, networkType, konumExact, saFirma])

  function applyHizliFiltre(f: HizliFiltre) {
    // Aynı buton tekrar basılırsa temizle
    if (hizli === f) {
      setHizli(null); setKonumIcerir(''); setMesajIcerir(''); setKonumExact('')
      setSeviyeSet(new Set(['kritik','hata','uyari']))
      setGun(7)
      return
    }
    setHizli(f); setKonumExact(''); setKonumIcerir(''); setMesajIcerir('')
    switch (f) {
      case 'son_1_saat':
        setGun(1)  // backend en küçük 1 gün; client tarafında son saati gerekirse ek filtre
        setSeviyeSet(new Set(['kritik','hata','uyari','bilgi']))
        break
      case 'bugun_kritik_hata':
        setGun(1); setSeviyeSet(new Set(['kritik','hata']))
        break
      case 'qr_debug':
        setGun(30); setKonumExact('app/scan/page.tsx QR_debug')
        setSeviyeSet(new Set(['kritik','hata','uyari','bilgi']))
        break
      case 'cevrim_disi':
        setGun(30); setKonumIcerir('offlineQueue'); setMesajIcerir('')
        setSeviyeSet(new Set(['kritik','hata','uyari']))
        break
      case 'offline_fail':
        setGun(30); setKonumIcerir('bekleyenIslem')
        setSeviyeSet(new Set(['kritik','hata','uyari']))
        break
    }
  }

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

  // 'Son 1 saat' hızlı filtresi için client-side ek filtre
  const finalData = useMemo(() => {
    let rows = data
    if (hizli === 'son_1_saat') {
      const eşik = Date.now() - 60 * 60 * 1000
      rows = rows.filter(r => new Date(r.olusturuldu).getTime() >= eşik)
    }
    if (hizli === 'cevrim_disi') {
      // Üç koşulun OR'u (API tek konumIcerir veriyor → mesaj fallback'i burada)
      rows = rows.filter(r =>
        (r.konum ?? '').includes('offlineQueue') ||
        (r.mesaj ?? '').toLowerCase().includes('çevrim dışı') ||
        (r.mesaj ?? '').toLowerCase().includes('internetvarmi')
      )
    }
    if (hizli === 'offline_fail') {
      rows = rows.filter(r =>
        (r.konum ?? '').includes('bekleyenIslem') ||
        (r.konum ?? '').includes('queueIsle')
      )
    }
    return rows
  }, [data, hizli])

  function toggleSeviye(s: Seviye) {
    setSeviyeSet(prev => {
      const n = new Set(prev)
      n.has(s) ? n.delete(s) : n.add(s)
      return n
    })
  }

  function exportCSV() {
    if (finalData.length === 0) return
    const header = ['Zaman', 'Seviye', 'Personel', 'Firma', 'Cihaz', 'Platform', 'Versiyon', 'Network', 'Konum', 'Mesaj']
    const lines = [header.join(';')]
    for (const r of finalData) {
      lines.push([
        tarihFormat(r.olusturuldu),
        SEVIYE_RENK[r.seviye]?.label ?? r.seviye,
        `"${(r.personel ?? '').replace(/"/g, '""')}"`,
        `"${(r.firma ?? '').replace(/"/g, '""')}"`,
        `"${(r.cihaz_modeli ?? '').replace(/"/g, '""')}"`,
        r.platform ?? '',
        r.uygulama_versiyonu ?? '',
        r.network_type ?? '',
        `"${(r.konum ?? '').replace(/"/g, '""')}"`,
        `"${(r.mesaj ?? '').replace(/"/g, '""').slice(0, 500)}"`,
      ].join(';'))
    }
    const csv = '﻿' + lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `mobil-hata-log_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  function copyDetayJson() {
    if (!detay) return
    const json = JSON.stringify({
      id: detay.id, zaman: detay.olusturuldu, seviye: detay.seviye, mesaj: detay.mesaj,
      personel: detay.personel, firma: detay.firma, cihaz: detay.cihaz_modeli, platform: detay.platform,
      versiyon: detay.uygulama_versiyonu, network: detay.network_type, konum: detay.konum,
      detay: detay.detay, stack: detay.stack, cihaz_id: detay.cihaz_id,
    }, null, 2)
    navigator.clipboard.writeText(json).then(() => {
      setJsonCopied(true)
      setTimeout(() => setJsonCopied(false), 1800)
    })
  }

  function benzerleriniFiltrele() {
    if (!detay?.konum) return
    setKonumExact(detay.konum)
    setKonumIcerir('')
    setSeviyeSet(new Set(['kritik','hata','uyari','bilgi']))
    setGun(30)
    setHizli(null)
    setDetay(null)
  }

  function filtreleriTemizle() {
    setHizli(null)
    setKonumExact(''); setKonumIcerir(''); setMesajIcerir(''); setQ('')
    setCihazModeli(''); setNetworkType('')
    setSeviyeSet(new Set(['kritik','hata','uyari']))
    setGun(7)
  }

  // — UI —
  return (
    <div>
      <div style={{ padding: '20px 24px' }}>
        {/* Özet kartı */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          {(['kritik','hata','uyari','bilgi'] as Seviye[]).map(s => {
            const r = SEVIYE_RENK[s]; const v = (ozet24 as any)[s] as number
            return (
              <div key={s} style={{ flex: 1, padding: 10, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: r.bg, color: r.fg, display: 'grid', placeItems: 'center', fontWeight: 800 }}>{r.icon}</div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.label} (24sa)</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#111827' }}>{v}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Hızlı filtreler */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: '#6b7280', alignSelf: 'center', textTransform: 'uppercase', fontWeight: 700, marginRight: 4 }}>Hızlı:</span>
          <HizliBtn aktif={hizli === 'son_1_saat'}        onClick={() => applyHizliFiltre('son_1_saat')}>Son 1 saat</HizliBtn>
          <HizliBtn aktif={hizli === 'bugun_kritik_hata'} onClick={() => applyHizliFiltre('bugun_kritik_hata')}>Bugün kritik+hata</HizliBtn>
          <HizliBtn aktif={hizli === 'qr_debug'}           onClick={() => applyHizliFiltre('qr_debug')}>QR Debug</HizliBtn>
          <HizliBtn aktif={hizli === 'cevrim_disi'}        onClick={() => applyHizliFiltre('cevrim_disi')}>Çevrim dışı</HizliBtn>
          <HizliBtn aktif={hizli === 'offline_fail'}       onClick={() => applyHizliFiltre('offline_fail')}>Offline fail</HizliBtn>
        </div>

        <div className="verde-card">
          {/* Filtre barı */}
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="verde-input" placeholder="Genel ara (mesaj/konum/cihaz)…"
              value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') yukle() }}
              style={{ maxWidth: 220 }} />

            <input className="verde-input" placeholder="Konum içerir…"
              value={konumIcerir} onChange={e => { setKonumIcerir(e.target.value); setKonumExact('') }}
              onKeyDown={e => { if (e.key === 'Enter') yukle() }}
              style={{ maxWidth: 160 }} />

            <input className="verde-input" placeholder="Mesaj içerir…"
              value={mesajIcerir} onChange={e => setMesajIcerir(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') yukle() }}
              style={{ maxWidth: 160 }} />

            {isSA && firmalarListesi.length > 0 && (
              <select className="verde-select" value={saFirma ?? 'tumu'}
                onChange={e => setSaFirma(e.target.value === 'tumu' ? null : e.target.value)} style={{ width: 170 }}>
                <option value="tumu">Firma (Tümü)</option>
                {firmalarListesi.map(f => <option key={f.id} value={f.id}>{f.firma_adi ?? f.ticari_unvan}</option>)}
              </select>
            )}

            <select className="verde-select" value={cihazModeli} onChange={e => setCihazModeli(e.target.value)} style={{ width: 200 }}>
              <option value="">Cihaz Modeli (Tümü)</option>
              {cihazModelleri.map(m => <option key={m} value={m}>{m}</option>)}
            </select>

            <select className="verde-select" value={networkType} onChange={e => setNetworkType(e.target.value)} style={{ width: 130 }}>
              <option value="">Network (Tümü)</option>
              {networkTypesAvail.map(n => <option key={n} value={n}>{n}</option>)}
            </select>

            <select className="verde-select" value={gun} onChange={e => setGun(Number(e.target.value))} style={{ width: 130 }}>
              <option value={1}>Son 1 gün</option>
              <option value={7}>Son 7 gün</option>
              <option value={30}>Son 30 gün</option>
              <option value={90}>Son 90 gün</option>
              <option value={365}>Son 1 yıl</option>
            </select>

            {/* Seviye checkbox grubu */}
            <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center', padding: '0 6px', border: '1px solid #e5e7eb', borderRadius: 6, height: 32 }}>
              {(['kritik','hata','uyari','bilgi'] as Seviye[]).map(s => (
                <label key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, color: '#374151', cursor: 'pointer' }}>
                  <input type="checkbox" checked={seviyeSet.has(s)} onChange={() => toggleSeviye(s)} />
                  {SEVIYE_RENK[s].label}
                </label>
              ))}
            </div>

            <button onClick={yukle} disabled={loading} className="verde-btn-outline-strong" style={{ padding: '7px 14px', fontSize: 13 }}>
              {loading ? 'Yükleniyor…' : '↻ Yenile'}
            </button>
            <button onClick={filtreleriTemizle} className="verde-btn-outline-strong" style={{ padding: '7px 12px', fontSize: 12 }}>
              ✕ Temizle
            </button>
            <button onClick={exportCSV} disabled={finalData.length === 0}
              style={{ padding: '7px 14px', fontSize: 12.5, fontWeight: 700, borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: finalData.length === 0 ? 'not-allowed' : 'pointer', opacity: finalData.length === 0 ? 0.5 : 1 }}>
              📊 CSV İndir
            </button>

            <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#6b7280' }}>
              <strong>{finalData.length}</strong> / {toplam} kayıt
              {konumExact && (
                <span style={{ marginLeft: 8, padding: '2px 8px', background: '#ede9fe', color: '#6b21a8', borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                  konum=「{konumExact.length > 30 ? konumExact.slice(0, 30) + '…' : konumExact}」
                </span>
              )}
            </span>
          </div>

          <div style={{ maxHeight: 'calc(100vh - 360px)', overflowY: 'auto' }}>
            <table className="verde-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                <col style={{ width: 130 }} />
                <col style={{ width: 80 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 130 }} />
                {isSA && <col style={{ width: 110 }} />}
                <col style={{ width: 130 }} />
                <col />
                <col style={{ width: 70 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Zaman</th>
                  <th style={{ textAlign: 'center' }}>Seviye</th>
                  <th>İşlem</th>
                  <th>Personel</th>
                  {isSA && <th>Firma</th>}
                  <th>Cihaz</th>
                  <th>Mesaj</th>
                  <th style={{ textAlign: 'center' }}>Net</th>
                </tr>
              </thead>
              <tbody>
                {loading && finalData.length === 0 ? (
                  <tr><td colSpan={isSA ? 8 : 7} style={{ textAlign: 'center', padding: 36, color: '#6b7280' }}>Yükleniyor…</td></tr>
                ) : finalData.length === 0 ? (
                  <tr><td colSpan={isSA ? 8 : 7} style={{ textAlign: 'center', padding: 36, color: '#6b7280' }}>Kayıt bulunamadı</td></tr>
                ) : (
                  finalData.map(r => {
                    const sr = SEVIYE_RENK[r.seviye] ?? SEVIYE_RENK.bilgi
                    const nb = r.network_type ? (NETWORK_BADGE[r.network_type] ?? { bg: '#f3f4f6', fg: '#4b5563', label: r.network_type }) : null
                    return (
                      <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setDetay(r)}>
                        <td style={{ fontSize: 12.5, color: '#4b5563', whiteSpace: 'nowrap' }}>{tarihFormat(r.olusturuldu)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: sr.bg, color: sr.fg, fontWeight: 700 }}>
                            {sr.icon} {sr.label}
                          </span>
                        </td>
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
                          {nb ? (
                            <span style={{ fontSize: 10.5, padding: '2px 6px', borderRadius: 4, background: nb.bg, color: nb.fg, fontWeight: 700 }}>
                              {nb.label}
                            </span>
                          ) : <span style={{ color: '#cbd5e1' }}>—</span>}
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
              <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                📱 Mobil Log Detayı
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: SEVIYE_RENK[detay.seviye].bg, color: SEVIYE_RENK[detay.seviye].fg, fontWeight: 700 }}>
                  {SEVIYE_RENK[detay.seviye].icon} {SEVIYE_RENK[detay.seviye].label}
                </span>
              </div>
              <button onClick={() => setDetay(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div><strong>Zaman:</strong> {tarihFormat(detay.olusturuldu)}</div>
              <div><strong>Personel:</strong> {detay.personel ?? '—'} {detay.firma ? `(${detay.firma})` : ''}</div>
              <div><strong>Cihaz:</strong> {detay.cihaz_modeli ?? '—'} {detay.platform ? `(${detay.platform})` : ''} · İO-GYS {detay.uygulama_versiyonu ?? '—'}</div>
              {detay.network_type && (
                <div>
                  <strong>Network:</strong>{' '}
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4,
                    background: (NETWORK_BADGE[detay.network_type] ?? NETWORK_BADGE.unknown).bg,
                    color: (NETWORK_BADGE[detay.network_type] ?? NETWORK_BADGE.unknown).fg, fontWeight: 700 }}>
                    {(NETWORK_BADGE[detay.network_type] ?? NETWORK_BADGE.unknown).label}
                  </span>{' '}
                  <code style={{ fontSize: 11, background: '#f3f4f6', padding: '1px 5px', borderRadius: 3, color: '#6b7280' }}>{detay.network_type}</code>
                </div>
              )}
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

              {/* Drawer aksiyonları */}
              <div style={{ marginTop: 12, display: 'flex', gap: 8, borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
                <button onClick={copyDetayJson}
                  style={{ padding: '7px 12px', fontSize: 12.5, fontWeight: 700, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#111827' }}>
                  📋 {jsonCopied ? 'Kopyalandı!' : "JSON'u kopyala"}
                </button>
                {detay.konum && (
                  <button onClick={benzerleriniFiltrele}
                    style={{ padding: '7px 12px', fontSize: 12.5, fontWeight: 700, borderRadius: 6, border: '1px solid #6b21a8', background: '#ede9fe', cursor: 'pointer', color: '#6b21a8' }}>
                    🔗 Benzerleri Filtrele
                  </button>
                )}
                <div style={{ flex: 1 }} />
                <button onClick={() => setDetay(null)}
                  style={{ padding: '7px 14px', fontSize: 12.5, fontWeight: 700, borderRadius: 6, border: 'none', background: '#1d4ed8', color: '#fff', cursor: 'pointer' }}>
                  Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HizliBtn({ aktif, onClick, children }: { aktif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      style={{
        padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
        fontSize: 11.5, fontWeight: 700,
        border: aktif ? '2px solid #6b21a8' : '1px solid #e5e7eb',
        background: aktif ? '#ede9fe' : '#fff',
        color: aktif ? '#6b21a8' : '#374151',
      }}>{children}</button>
  )
}
