'use client'

import React, { useEffect, useState } from 'react'

type Durum = 'yeni' | 'inceleniyor' | 'cozuldu'

interface GeriBildirimRow {
  id: string
  olusturuldu: string
  mesaj: string
  kategori: string | null
  cihaz_id: string | null
  cihaz_modeli: string | null
  platform: string | null
  uygulama_versiyonu: string | null
  isim: string | null
  firma_id: string | null
  firma: string | null
  ekran: string | null
  son_hata: string | null
  network_type: string | null
  gorsel_url: string | null
  durum: Durum
  cevap: string | null
  detay: any
}

interface Props {
  isSA: boolean
  firmalarListesi?: { id: string; firma_adi?: string; ticari_unvan?: string }[]
  onYeniSayisi?: (n: number) => void
}

const DURUM_RENK: Record<Durum, { bg: string; fg: string; label: string; icon: string }> = {
  yeni:        { bg: '#fee2e2', fg: '#991b1b', label: 'Yeni',        icon: '●' },
  inceleniyor: { bg: '#fef3c7', fg: '#92400e', label: 'İnceleniyor', icon: '◐' },
  cozuldu:     { bg: '#dcfce7', fg: '#166534', label: 'Çözüldü',     icon: '✓' },
}

// detay jsonb anahtarları → okunur etiket (mobil spec 1.0.35)
const DETAY_ETIKET: Record<string, string> = {
  os_surum: 'Android sürümü',
  webview_surum: 'WebView/Chrome sürümü',
  uretici: 'Üretici',
  sanal_cihaz: 'Emülatör mü',
  ram_kullanilan_mb: 'Kullanılan RAM (MB)',
  disk_bos_mb: 'Boş disk (MB)',
  disk_toplam_mb: 'Toplam disk (MB)',
  batarya_yuzde: 'Pil (%)',
  sarjda: 'Şarjda mı',
  ag_tip: 'Ağ tipi',
  ag_hiz_mbps: 'Ağ hızı (Mbps)',
  izin_kamera: 'Kamera izni',
  izin_bildirim: 'Bildirim izni',
  bekleyen_offline: 'Bekleyen offline kayıt',
  aktif_gorev: 'Aktif görev',
  yazi_boyutu: 'Yazı boyutu',
  tema: 'Tema',
  cihaz_saati: 'Cihaz saati',
  ekran: 'Ekran (çözünürlük)',
  foto_yuklendi: 'Foto yüklendi mi',
}

const BREADCRUMB_SEVIYE: Record<string, { fg: string; bg: string }> = {
  hata:   { fg: '#991b1b', bg: '#fee2e2' },
  kritik: { fg: '#fff',    bg: '#7f1d1d' },
  uyari:  { fg: '#92400e', bg: '#fef3c7' },
  bilgi:  { fg: '#1e40af', bg: '#dbeafe' },
}

export default function GeriBildirimClient({ isSA, firmalarListesi = [], onYeniSayisi }: Props) {
  const [data, setData] = useState<GeriBildirimRow[]>([])
  const [toplam, setToplam] = useState(0)
  const [sayilar, setSayilar] = useState({ yeni: 0, inceleniyor: 0, cozuldu: 0 })
  const [loading, setLoading] = useState(true)

  // Filtreler
  const [gun, setGun] = useState(30)
  const [durumSet, setDurumSet] = useState<Set<Durum>>(new Set(['yeni', 'inceleniyor']))
  const [q, setQ] = useState('')
  const [saFirma, setSaFirma] = useState<string | null>(null)
  const [detay, setDetay] = useState<GeriBildirimRow | null>(null)
  const [fotoBuyuk, setFotoBuyuk] = useState(false)
  const [cihazAcik, setCihazAcik] = useState(false)
  const [cevapTaslak, setCevapTaslak] = useState('')
  const [kaydediyor, setKaydediyor] = useState(false)

  function yukle() {
    setLoading(true)
    const p = new URLSearchParams({ gun: String(gun) })
    if (durumSet.size > 0 && durumSet.size < 3) p.set('durum', [...durumSet].join(','))
    if (q.trim()) p.set('q', q.trim())
    if (isSA && saFirma) p.set('firmaId', saFirma)
    fetch(`/api/sistem-loglari/geri-bildirim?${p}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        setData(Array.isArray(j?.data) ? j.data : [])
        setToplam(j?.toplam ?? 0)
        const s = j?.sayilar ?? { yeni: 0, inceleniyor: 0, cozuldu: 0 }
        setSayilar(s)
        onYeniSayisi?.(s.yeni ?? 0)
      })
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { yukle() }, [gun, durumSet, saFirma])

  function tarihFormat(iso: string) {
    try { return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return iso }
  }

  function toggleDurum(d: Durum) {
    setDurumSet(prev => {
      const n = new Set(prev)
      n.has(d) ? n.delete(d) : n.add(d)
      return n
    })
  }

  async function durumGuncelle(row: GeriBildirimRow, yeniDurum: Durum, cevap?: string) {
    setKaydediyor(true)
    try {
      const res = await fetch('/api/sistem-loglari/geri-bildirim', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, durum: yeniDurum, ...(cevap !== undefined ? { cevap } : {}) }),
      })
      const j = await res.json()
      if (j?.ok && j.data) {
        const g = { ...row, ...j.data } as GeriBildirimRow
        setData(prev => prev.map(r => (r.id === row.id ? g : r)))
        setDetay(prev => (prev?.id === row.id ? g : prev))
        // Rozet sayılarını yerel güncelle
        setSayilar(prev => {
          const n = { ...prev } as any
          if (row.durum in n) n[row.durum] = Math.max(0, n[row.durum] - 1)
          if (yeniDurum in n) n[yeniDurum]++
          onYeniSayisi?.(n.yeni ?? 0)
          return n
        })
      } else {
        alert(j?.error ?? 'Güncelleme başarısız')
      }
    } catch {
      alert('Güncelleme başarısız')
    } finally {
      setKaydediyor(false)
    }
  }

  function detayAc(r: GeriBildirimRow) {
    setDetay(r)
    setCevapTaslak(r.cevap ?? '')
    setFotoBuyuk(false)
    setCihazAcik(false)
  }

  const breadcrumb: any[] = Array.isArray(detay?.detay?.breadcrumb) ? detay!.detay.breadcrumb : []
  const cihazBilgi: [string, any][] = detay?.detay && typeof detay.detay === 'object'
    ? Object.entries(detay.detay).filter(([k]) => k !== 'breadcrumb')
    : []

  return (
    <div>
      <div style={{ padding: '20px 24px' }}>
        {/* Durum özet kartları */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          {(['yeni', 'inceleniyor', 'cozuldu'] as Durum[]).map(d => {
            const r = DURUM_RENK[d]; const v = (sayilar as any)[d] as number
            return (
              <div key={d} style={{ flex: 1, padding: 10, border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: r.bg, color: r.fg, display: 'grid', placeItems: 'center', fontWeight: 800 }}>{r.icon}</div>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{r.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#111827' }}>{v}</div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="verde-card">
          {/* Filtre barı */}
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="verde-input" placeholder="Ara (mesaj/isim)…"
              value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') yukle() }}
              style={{ maxWidth: 220 }} />

            {isSA && firmalarListesi.length > 0 && (
              <select className="verde-select" value={saFirma ?? 'tumu'}
                onChange={e => setSaFirma(e.target.value === 'tumu' ? null : e.target.value)} style={{ width: 170 }}>
                <option value="tumu">Firma (Tümü)</option>
                {firmalarListesi.map(f => <option key={f.id} value={f.id}>{f.firma_adi ?? f.ticari_unvan}</option>)}
              </select>
            )}

            <select className="verde-select" value={gun} onChange={e => setGun(Number(e.target.value))} style={{ width: 130 }}>
              <option value={1}>Son 1 gün</option>
              <option value={7}>Son 7 gün</option>
              <option value={30}>Son 30 gün</option>
              <option value={90}>Son 90 gün</option>
              <option value={365}>Son 1 yıl</option>
            </select>

            {/* Durum checkbox grubu */}
            <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '0 8px', border: '1px solid #e5e7eb', borderRadius: 6, height: 32 }}>
              {(['yeni', 'inceleniyor', 'cozuldu'] as Durum[]).map(d => (
                <label key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, color: '#374151', cursor: 'pointer' }}>
                  <input type="checkbox" checked={durumSet.has(d)} onChange={() => toggleDurum(d)} />
                  {DURUM_RENK[d].label}
                </label>
              ))}
            </div>

            <button onClick={yukle} disabled={loading} className="verde-btn-outline-strong" style={{ padding: '7px 14px', fontSize: 13 }}>
              {loading ? 'Yükleniyor…' : '↻ Yenile'}
            </button>

            <span style={{ marginLeft: 'auto', fontSize: 12.5, color: '#6b7280' }}>
              <strong>{data.length}</strong> / {toplam} kayıt
            </span>
          </div>

          <div style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
            <table className="verde-table" style={{ tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                <col style={{ width: 130 }} />
                <col style={{ width: 150 }} />
                {isSA && <col style={{ width: 120 }} />}
                <col style={{ width: 180 }} />
                <col />
                <col style={{ width: 100 }} />
                <col style={{ width: 46 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>İsim</th>
                  {isSA && <th>Firma</th>}
                  <th>Cihaz · Sürüm</th>
                  <th>Mesaj</th>
                  <th style={{ textAlign: 'center' }}>Durum</th>
                  <th style={{ textAlign: 'center' }}>📷</th>
                </tr>
              </thead>
              <tbody>
                {loading && data.length === 0 ? (
                  <tr><td colSpan={isSA ? 7 : 6} style={{ textAlign: 'center', padding: 36, color: '#6b7280' }}>Yükleniyor…</td></tr>
                ) : data.length === 0 ? (
                  <tr><td colSpan={isSA ? 7 : 6} style={{ textAlign: 'center', padding: 36, color: '#6b7280' }}>Kayıt bulunamadı</td></tr>
                ) : (
                  data.map(r => {
                    const dr = DURUM_RENK[r.durum] ?? DURUM_RENK.yeni
                    return (
                      <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => detayAc(r)}>
                        <td style={{ fontSize: 12.5, color: '#4b5563', whiteSpace: 'nowrap' }}>{tarihFormat(r.olusturuldu)}</td>
                        <td style={{ fontSize: 12.5, color: '#374151', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.isim ?? <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>—</span>}
                        </td>
                        {isSA && (
                          <td style={{ fontSize: 12.5, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.firma ?? '—'}
                          </td>
                        )}
                        <td style={{ fontSize: 12, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${r.cihaz_modeli ?? ''} ${r.uygulama_versiyonu ?? ''}`}>
                          {r.cihaz_modeli ?? '—'}{r.uygulama_versiyonu ? ` · v${r.uygulama_versiyonu}` : ''}
                        </td>
                        <td style={{ fontSize: 12.5, color: '#1f2937', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.mesaj}>
                          {r.mesaj}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: dr.bg, color: dr.fg, fontWeight: 700 }}>
                            {dr.icon} {dr.label}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {r.gorsel_url ? '🖼️' : <span style={{ color: '#e5e7eb' }}>—</span>}
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

      {/* Detay drawer */}
      {detay && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(15,26,15,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onMouseDown={e => { if (e.target === e.currentTarget) setDetay(null) }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 'min(760px, calc(100vw - 24px))', maxHeight: '88vh', overflow: 'auto', boxShadow: '0 18px 50px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
              <div style={{ fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                💬 Geri Bildirim Detayı
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: DURUM_RENK[detay.durum].bg, color: DURUM_RENK[detay.durum].fg, fontWeight: 700 }}>
                  {DURUM_RENK[detay.durum].icon} {DURUM_RENK[detay.durum].label}
                </span>
              </div>
              <button onClick={() => setDetay(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}>✕</button>
            </div>

            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div><strong>Tarih:</strong> {tarihFormat(detay.olusturuldu)}</div>
              <div><strong>İsim:</strong> {detay.isim ?? '—'} {detay.firma ? `(${detay.firma})` : ''}</div>
              <div><strong>Cihaz:</strong> {detay.cihaz_modeli ?? '—'} {detay.platform ? `(${detay.platform})` : ''} · İO-GYS {detay.uygulama_versiyonu ?? '—'}</div>
              <div>
                <strong>Ekran:</strong> <code style={{ fontSize: 12, background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{detay.ekran ?? '—'}</code>
                {detay.network_type && <>{' '}· <strong>Ağ:</strong> <code style={{ fontSize: 12, background: '#f3f4f6', padding: '2px 6px', borderRadius: 4 }}>{detay.network_type}</code></>}
              </div>

              {/* Mesaj */}
              <div style={{ marginTop: 6 }}>
                <strong>Mesaj:</strong>
                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: 12, borderRadius: 8, marginTop: 4, fontSize: 13.5, color: '#0c4a6e', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {detay.mesaj}
                </div>
              </div>

              {/* Son hata — vurgulu */}
              {detay.son_hata && (
                <div style={{ marginTop: 6 }}>
                  <strong style={{ color: '#991b1b' }}>⚠ Son yakalanan hata:</strong>
                  <pre style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#7f1d1d', padding: 10, borderRadius: 8, marginTop: 4, fontSize: 11.5, overflow: 'auto', maxHeight: 160, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {detay.son_hata}
                  </pre>
                </div>
              )}

              {/* Foto */}
              {detay.gorsel_url && (
                <div style={{ marginTop: 6 }}>
                  <strong>Foto:</strong>
                  <div style={{ marginTop: 4 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={detay.gorsel_url} alt="Geri bildirim fotoğrafı"
                      onClick={() => setFotoBuyuk(true)}
                      style={{ maxWidth: 220, maxHeight: 160, borderRadius: 8, border: '1px solid #e5e7eb', cursor: 'zoom-in', objectFit: 'cover' }} />
                  </div>
                </div>
              )}

              {/* Breadcrumb timeline */}
              {breadcrumb.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <strong>⭐ Olay akışı (breadcrumb — son {breadcrumb.length} olay):</strong>
                  <div style={{ marginTop: 6, borderLeft: '2px solid #e5e7eb', paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
                    {breadcrumb.map((b, i) => {
                      const sv = BREADCRUMB_SEVIYE[b?.s] ?? { fg: '#4b5563', bg: '#f3f4f6' }
                      return (
                        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 11.5 }}>
                          <span style={{ color: '#9ca3af', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {b?.t ? tarihFormat(b.t).split(' ').pop() : '—'}
                          </span>
                          <span style={{ padding: '0 6px', borderRadius: 3, background: sv.bg, color: sv.fg, fontWeight: 700, fontSize: 10.5 }}>
                            {b?.s ?? '?'}
                          </span>
                          <span style={{ color: '#1f2937', wordBreak: 'break-word' }}>{b?.m ?? ''}</span>
                          {b?.k && <code style={{ fontSize: 10, color: '#9ca3af' }}>{b.k}</code>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Cihaz bilgisi — katlanır */}
              {cihazBilgi.length > 0 && (
                <div style={{ marginTop: 6 }}>
                  <button onClick={() => setCihazAcik(v => !v)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 700, color: '#374151' }}>
                    {cihazAcik ? '▾' : '▸'} Cihaz Bilgisi ({cihazBilgi.length})
                  </button>
                  {cihazAcik && (
                    <table style={{ marginTop: 6, fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
                      <tbody>
                        {cihazBilgi.map(([k, v]) => (
                          <tr key={k} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '4px 8px 4px 0', color: '#6b7280', whiteSpace: 'nowrap', width: 200 }}>{DETAY_ETIKET[k] ?? k}</td>
                            <td style={{ padding: '4px 0', color: '#111827', wordBreak: 'break-word' }}>
                              {v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Cevap (v2 hazırlık — kolonu doldurur) */}
              <div style={{ marginTop: 6 }}>
                <strong>Cevap (opsiyonel):</strong>
                <textarea className="verde-input" rows={2} value={cevapTaslak}
                  onChange={e => setCevapTaslak(e.target.value)}
                  placeholder="Personele iletilecek not… (şimdilik yalnızca kaydedilir)"
                  style={{ width: '100%', marginTop: 4, resize: 'vertical', fontSize: 12.5 }} />
              </div>

              {detay.cihaz_id && (
                <div style={{ fontSize: 11, color: '#6b7280' }}>
                  <strong>Cihaz ID:</strong>{' '}
                  <code style={{ background: '#f3f4f6', padding: '2px 6px', borderRadius: 4, userSelect: 'all' }}>{detay.cihaz_id}</code>
                </div>
              )}

              {/* Aksiyonlar */}
              <div style={{ marginTop: 12, display: 'flex', gap: 8, borderTop: '1px solid #f3f4f6', paddingTop: 12, flexWrap: 'wrap' }}>
                {detay.durum !== 'inceleniyor' && (
                  <button disabled={kaydediyor} onClick={() => durumGuncelle(detay, 'inceleniyor', cevapTaslak)}
                    style={{ padding: '7px 14px', fontSize: 12.5, fontWeight: 700, borderRadius: 6, border: '1px solid #d97706', background: '#fef3c7', color: '#92400e', cursor: 'pointer' }}>
                    ◐ İncelemeye Al
                  </button>
                )}
                {detay.durum !== 'cozuldu' && (
                  <button disabled={kaydediyor} onClick={() => durumGuncelle(detay, 'cozuldu', cevapTaslak)}
                    style={{ padding: '7px 14px', fontSize: 12.5, fontWeight: 700, borderRadius: 6, border: 'none', background: '#16a34a', color: '#fff', cursor: 'pointer' }}>
                    ✓ Çözüldü
                  </button>
                )}
                {detay.durum === 'cozuldu' && (
                  <button disabled={kaydediyor} onClick={() => durumGuncelle(detay, 'yeni', cevapTaslak)}
                    style={{ padding: '7px 12px', fontSize: 12.5, fontWeight: 700, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer' }}>
                    ↺ Yeniden Aç
                  </button>
                )}
                {cevapTaslak !== (detay.cevap ?? '') && (
                  <button disabled={kaydediyor} onClick={() => durumGuncelle(detay, detay.durum, cevapTaslak)}
                    style={{ padding: '7px 12px', fontSize: 12.5, fontWeight: 700, borderRadius: 6, border: '1px solid #1d4ed8', background: '#dbeafe', color: '#1d4ed8', cursor: 'pointer' }}>
                    💾 Cevabı Kaydet
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

      {/* Foto tam ekran */}
      {detay?.gorsel_url && fotoBuyuk && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
          onClick={() => setFotoBuyuk(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={detay.gorsel_url} alt="Geri bildirim fotoğrafı (tam ekran)"
            style={{ maxWidth: '94vw', maxHeight: '94vh', borderRadius: 8, objectFit: 'contain' }} />
        </div>
      )}
    </div>
  )
}
