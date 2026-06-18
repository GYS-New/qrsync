'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Loader2, RotateCcw, Trash2, Search } from 'lucide-react'

type Durum = 'ACIK' | 'ISLEMDE' | 'TAMAMLANDI' | 'IPTAL'

type Row = {
  gorev_id: string
  ekstra: boolean
  plaka: string
  marka: string | null
  model: string | null
  departman: string | null
  kullanici: string | null
  lokasyon: string
  durum: Durum
  baslatilma_tarihi: string | null
  tamamlanma_suresi_saniye: number | null
  tamamlayan: string | null
  tamamlanma_tarihi: string | null
  durum_degisim_tarihi: string | null
  iptal_sebep: string | null
  hedef_tarih: string
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  grayLight: '#f8fafc',
}

const DURUM_LABEL: Record<Durum, string> = { ISLEMDE: 'İşlemde', ACIK: 'Açık', TAMAMLANDI: 'Tamamlandı', IPTAL: 'İptal' }
const DURUM_BG: Record<Durum, string> = { ISLEMDE: T.blueLight, ACIK: T.amberLight, TAMAMLANDI: T.greenLight, IPTAL: T.redLight }
const DURUM_FG: Record<Durum, string> = { ISLEMDE: T.blue, ACIK: T.amber, TAMAMLANDI: T.green, IPTAL: T.red }

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtSure(saniye: number | null | undefined): string {
  if (saniye == null || saniye <= 0) return '—'
  const h = Math.floor(saniye / 3600)
  const m = Math.floor((saniye % 3600) / 60)
  const s = saniye % 60
  if (h > 0) return `${h}sa ${m}dk`
  if (m > 0) return `${m}dk ${s}sn`
  return `${s}sn`
}

// Süre hesaplama: tamamlanma_suresi_saniye (snapshot) varsa onu kullan,
// yoksa baslatilma-tamamlanma farkından türet.
function gorevSuresiSaniye(r: Row): number {
  if (r.tamamlanma_suresi_saniye && r.tamamlanma_suresi_saniye > 0) return r.tamamlanma_suresi_saniye
  if (r.baslatilma_tarihi && r.tamamlanma_tarihi) {
    return Math.max(0, Math.floor((new Date(r.tamamlanma_tarihi).getTime() - new Date(r.baslatilma_tarihi).getTime()) / 1000))
  }
  return 0
}

type DurumFilter = 'TUMU' | Durum

export default function GunlukClient() {
  const { firmaId } = useFirma()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [islemLoading, setIslemLoading] = useState<string | null>(null) // gorev_id
  const [rows, setRows] = useState<Row[]>([])
  const [today, setToday] = useState<string>('')
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState<string | null>(null)
  const [sonGuncelleme, setSonGuncelleme] = useState<Date | null>(null)
  const [streamState, setStreamState] = useState<'running' | 'paused' | 'stopped'>('running')
  const [durumFilter, setDurumFilter] = useState<DurumFilter>('TUMU')
  const [arama, setArama] = useState('')
  const inflightRef = useRef(false)

  async function fetchData(showSpin = false) {
    if (!firmaId || inflightRef.current) return
    inflightRef.current = true
    if (showSpin) setYukleniyor(true)
    try {
      const res = await fetch(`/api/oto-yikama/gunluk?firma_id=${firmaId}`, { cache: 'no-store' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Veri alınamadı')
      setRows(j.data ?? [])
      setToday(j.today ?? '')
      setHata(null)
      setSonGuncelleme(new Date())
    } catch (e: any) {
      setHata(e.message)
      if (showSpin) toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      inflightRef.current = false
      if (showSpin) setYukleniyor(false)
    }
  }

  // İlk yükleme + 5sn polling (sadece streamState='running' iken)
  useEffect(() => {
    setRows([])
    if (!firmaId) { setYukleniyor(false); return }
    fetchData(true)
    if (streamState !== 'running') return
    const tid = setInterval(() => fetchData(false), 5000)
    return () => clearInterval(tid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId, streamState])

  // Sıralama + filtre: hareket eden (ACIK olmayan) üstte, durum_degisim_tarihi DESC.
  // ACIK satırlar altta (henüz işlem görmedi). Son tamamlanan/iptal/işleme alınan
  // her zaman tepeye taşınır — canlı akış mantığı.
  const sorted = useMemo(() => {
    const ara = arama.trim().toUpperCase()
    return [...rows]
      .filter(r => durumFilter === 'TUMU' ? true : r.durum === durumFilter)
      .filter(r => {
        if (!ara) return true
        return (r.plaka ?? '').toUpperCase().includes(ara)
          || (r.kullanici ?? '').toUpperCase().includes(ara)
          || (r.lokasyon ?? '').toUpperCase().includes(ara)
          || (r.tamamlayan ?? '').toUpperCase().includes(ara)
      })
      .sort((a, b) => {
        const aHar = a.durum === 'ACIK' ? 1 : 0
        const bHar = b.durum === 'ACIK' ? 1 : 0
        if (aHar !== bHar) return aHar - bHar
        const ta = a.durum_degisim_tarihi ? new Date(a.durum_degisim_tarihi).getTime() : 0
        const tb = b.durum_degisim_tarihi ? new Date(b.durum_degisim_tarihi).getTime() : 0
        return tb - ta
      })
  }, [rows, durumFilter, arama])

  const sayilar = useMemo(() => {
    const c = { toplam: rows.length, ACIK: 0, ISLEMDE: 0, TAMAMLANDI: 0, IPTAL: 0 }
    for (const r of rows) c[r.durum]++
    return c
  }, [rows])

  async function durumToggle(row: Row) {
    if (row.durum !== 'ACIK' && row.durum !== 'TAMAMLANDI') {
      toast({ type: 'error', title: 'Geçersiz işlem', message: `'${DURUM_LABEL[row.durum]}' durumu toggle edilemez.` })
      return
    }
    const hedef = row.durum === 'ACIK' ? 'TAMAMLANDI' : 'ACIK'
    const ok = await confirm({
      title: 'Durum değişikliği',
      message: `${row.plaka} → ${DURUM_LABEL[hedef]} olarak güncellensin mi?`,
      confirmText: 'Evet',
      cancelText: 'Vazgeç',
    })
    if (!ok) return
    setIslemLoading(row.gorev_id)
    try {
      const res = await fetch(`/api/oto-yikama/gunluk/${row.gorev_id}`, { method: 'PATCH' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Güncellenemedi')
      toast({ type: 'success', title: 'Güncellendi', message: `${row.plaka} → ${DURUM_LABEL[hedef]}` })
      fetchData(false)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setIslemLoading(null)
    }
  }

  async function gorevSil(row: Row) {
    const ok = await confirm({
      title: 'Görevi sil',
      message: `${row.plaka} için ${row.ekstra ? 'ekstra ' : ''}yıkama kaydı kalıcı olarak silinecek. Devam edilsin mi?`,
      confirmText: 'Sil',
      cancelText: 'Vazgeç',
      variant: 'danger',
    })
    if (!ok) return
    setIslemLoading(row.gorev_id)
    try {
      const res = await fetch(`/api/oto-yikama/gunluk/${row.gorev_id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error ?? 'Silinemedi')
      toast({ type: 'success', title: 'Silindi', message: row.plaka })
      fetchData(false)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setIslemLoading(null)
    }
  }

  const toplamSureSaniye = useMemo(() => {
    return rows.reduce((acc, r) => acc + (r.durum === 'TAMAMLANDI' ? gorevSuresiSaniye(r) : 0), 0)
  }, [rows])

  if (!firmaId) {
    return (
      <div style={{ padding: '24px 28px' }}>
        <div className="verde-card" style={{ padding: 32, textAlign: 'center', color: T.textSoft }}>
          Önce üst bardan bir firma seçin.
        </div>
      </div>
    )
  }

  const dotColor = streamState === 'running' ? '#374151' : streamState === 'paused' ? '#d97706' : '#9ca3af'

  const kpiKartlari: { key: DurumFilter; label: string; val: number; bg: string; vColor: string; lColor: string }[] = [
    { key: 'TUMU',       label: 'Tümü',       val: sayilar.toplam,     bg: 'transparent', vColor: '#111827', lColor: '#6b7280' },
    { key: 'ISLEMDE',    label: 'İşlemde',    val: sayilar.ISLEMDE,    bg: '#eff6ff',     vColor: '#1d4ed8', lColor: '#185FA5' },
    { key: 'ACIK',       label: 'Açık',       val: sayilar.ACIK,       bg: '#fffbeb',     vColor: '#92400e', lColor: '#854F0B' },
    { key: 'TAMAMLANDI', label: 'Tamamlandı', val: sayilar.TAMAMLANDI, bg: '#f0fdf4',     vColor: '#166534', lColor: '#3B6D11' },
    { key: 'IPTAL',      label: 'İptal',      val: sayilar.IPTAL,      bg: '#fef2f2',     vColor: '#991b1b', lColor: '#A32D2D' },
  ]

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── ÜST PANEL: Canlı Akış başlığı + KPI filtre kartları + arama ── */}
      <div className="verde-card" style={{ overflow: 'hidden' }}>
        {/* Başlık satırı */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{ width: 20, height: 20, border: '1.5px solid #374151', borderRadius: 5, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{
                position: 'absolute', left: 0, right: 0, height: 2,
                background: 'rgba(46,139,46,0.5)',
                animation: streamState === 'running' ? 'canliScan 1.8s linear infinite' : 'none',
              }} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#111827', letterSpacing: '-0.2px' }}>
              Yıkama Akışı
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 }}>
              {today || 'Bugün'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, background: streamState === 'running' ? '#f9fafb' : '#f5f5f5', border: `1px solid ${streamState === 'running' ? '#d1d5db' : '#e0e0e0'}` }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0,
                animation: streamState === 'running' ? 'canliPulse 1.4s ease-in-out infinite' : 'none' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: dotColor }}>
                {streamState === 'running' ? 'Canlı' : streamState === 'paused' ? 'Duraklatıldı' : 'Durduruldu'}
              </span>
            </div>
            <div style={{ padding: '4px 10px', borderRadius: 8, background: T.greenLight, color: T.green, display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 900 }}>{fmtSure(toplamSureSaniye)}</span>
              <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Toplam Süre</span>
            </div>
          </div>

          {/* Stream kontrolleri */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {[
              { s: 'running' as const, icon: '▶', title: 'Başlat' },
              { s: 'paused'  as const, icon: '⏸', title: 'Duraklat' },
              { s: 'stopped' as const, icon: '⏹', title: 'Durdur' },
            ].map(({ s, icon, title }) => (
              <button key={s} type="button" title={title}
                onClick={() => setStreamState(s)}
                style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${streamState === s ? '#374151' : '#e5e7eb'}`, background: streamState === s ? '#e5e7eb' : '#fff', cursor: 'pointer', fontSize: 11, color: streamState === s ? '#1f2937' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* KPI filtre kartları */}
        <div style={{ padding: '8px 18px', borderBottom: '1px solid #f3f4f6', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, alignItems: 'stretch' }}>
          {kpiKartlari.map(({ key, label, val, bg, vColor, lColor }) => {
            const active = durumFilter === key
            const onClick = () => {
              if (active && key !== 'TUMU') setDurumFilter('TUMU')
              else setDurumFilter(key)
            }
            return (
              <button key={key} type="button" onClick={onClick}
                title={active && key !== 'TUMU' ? 'Filtreyi kaldır' : label}
                style={{
                  background: active ? vColor + '0F' : bg === 'transparent' ? '#fafafa' : bg,
                  borderRadius: 8, padding: '8px 8px', textAlign: 'left', cursor: 'pointer',
                  border: active ? `2px solid ${vColor}` : '1px solid #e5e7eb',
                  transition: 'all 0.15s',
                  outline: 'none',
                }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: vColor, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 10, color: lColor, marginTop: 2, fontWeight: active ? 700 : 500 }}>{label}</div>
              </button>
            )
          })}
        </div>

        {/* Arama + son güncelleme */}
        <div style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 200, maxWidth: 360, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 7, padding: '5px 10px' }}>
            <Search size={14} color={T.textSoft} />
            <input
              type="text"
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder="Plaka, kullanıcı, istasyon veya tamamlayan ara…"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, color: T.text }}
            />
            {arama && (
              <button type="button" onClick={() => setArama('')}
                style={{ border: 'none', background: 'transparent', color: T.textSoft, cursor: 'pointer', fontSize: 14 }}>×</button>
            )}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: T.textSoft, fontVariantNumeric: 'tabular-nums' }}>
            Son güncelleme: {sonGuncelleme ? fmtTime(sonGuncelleme.toISOString()) : '—'}
          </span>
        </div>
      </div>

      {hata && (
        <div className="verde-card" style={{ padding: 12, background: T.redLight, color: T.red, fontSize: 13, fontWeight: 600 }}>
          {hata}
        </div>
      )}

      {yukleniyor && rows.length === 0 ? (
        <div className="verde-card" style={{ padding: 60, textAlign: 'center', color: T.textSoft }}>
          <Loader2 size={26} style={{ animation: 'spin 0.9s linear infinite' }} />
          <div style={{ marginTop: 8 }}>Yükleniyor…</div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="verde-card" style={{ padding: 60, textAlign: 'center', color: T.textSoft }}>
          {durumFilter !== 'TUMU' || arama
            ? 'Filtre koşullarına uyan kayıt yok.'
            : 'Bugün için Oto Yıkama görevi yok.'}
        </div>
      ) : (
        <div className="verde-card" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="verde-table" style={{ minWidth: 1180, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Plaka</th>
                  <th style={{ minWidth: 140 }}>Kullanıcı</th>
                  <th style={{ minWidth: 130 }}>Departman</th>
                  <th style={{ minWidth: 180 }}>İstasyon</th>
                  <th style={{ width: 120, paddingLeft: 2 }}>Durum</th>
                  <th style={{ width: 110, whiteSpace: 'nowrap' }}>Başlatma</th>
                  <th style={{ width: 110, whiteSpace: 'nowrap' }}>Bitirme</th>
                  <th style={{ width: 90 }}>Süre</th>
                  <th style={{ minWidth: 160 }}>Tamamlayan</th>
                  <th style={{ width: 110, textAlign: 'right', paddingRight: 16 }}>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => (
                  <tr key={r.gorev_id}
                    style={{ background: r.durum === 'ISLEMDE' ? DURUM_BG.ISLEMDE : undefined }}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 16, color: T.text }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {r.plaka}
                        {r.ekstra && (
                          <span style={{ padding: '2px 7px', borderRadius: 999, background: '#fde68a', color: '#92400e', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em' }}>
                            EKSTRA
                          </span>
                        )}
                      </span>
                    </td>
                    <td style={{ color: T.textSoft, fontSize: 14 }}>{r.kullanici ?? '—'}</td>
                    <td style={{ color: T.textSoft, fontSize: 14 }}>{r.departman ?? '—'}</td>
                    <td style={{ color: T.textSoft, fontSize: 14 }}>{r.lokasyon}</td>
                    <td style={{ paddingLeft: 2 }}>
                      <span className={r.durum === 'ISLEMDE' ? 'islemde-flash' : undefined}
                        style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: DURUM_BG[r.durum], color: DURUM_FG[r.durum], fontSize: 12, fontWeight: 700 }}>
                        {DURUM_LABEL[r.durum]}
                      </span>
                    </td>
                    <td style={{ color: T.textSoft, fontSize: 15, fontFamily: 'monospace' }}>{fmtTime(r.baslatilma_tarihi)}</td>
                    <td style={{ color: T.textSoft, fontSize: 15, fontFamily: 'monospace' }}>{fmtTime(r.tamamlanma_tarihi)}</td>
                    <td style={{ color: r.durum === 'TAMAMLANDI' ? T.green : T.textSoft, fontSize: 15, fontFamily: 'monospace', fontWeight: 700 }}>
                      {r.durum === 'TAMAMLANDI' ? fmtSure(gorevSuresiSaniye(r)) : '—'}
                    </td>
                    <td style={{ color: T.textSoft, fontSize: 14 }}>{r.tamamlayan ?? '—'}</td>
                    <td style={{ textAlign: 'right', paddingRight: 16, whiteSpace: 'nowrap' }}>
                      <button onClick={() => durumToggle(r)}
                        disabled={islemLoading === r.gorev_id || (r.durum !== 'ACIK' && r.durum !== 'TAMAMLANDI')}
                        title={r.durum === 'ACIK' ? 'Tamamlandı olarak işaretle' : r.durum === 'TAMAMLANDI' ? 'Tekrar açık yap' : 'Sadece ACIK/TAMAMLANDI toggle edilebilir'}
                        style={{
                          padding: 5, marginRight: 6, borderRadius: 6,
                          border: `1px solid ${T.border}`, background: '#fff',
                          cursor: (r.durum === 'ACIK' || r.durum === 'TAMAMLANDI') ? 'pointer' : 'not-allowed',
                          color: T.text, opacity: (r.durum === 'ACIK' || r.durum === 'TAMAMLANDI') ? 1 : 0.4,
                          display: 'inline-flex', alignItems: 'center',
                        }}>
                        <RotateCcw size={13} />
                      </button>
                      <button onClick={() => gorevSil(r)}
                        disabled={islemLoading === r.gorev_id}
                        title="Sil"
                        style={{
                          padding: 5, borderRadius: 6,
                          border: `1px solid ${T.redLight}`, background: '#fff',
                          cursor: 'pointer', color: T.red,
                          display: 'inline-flex', alignItems: 'center',
                        }}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes islemde-flash {
          0%, 49% { opacity: 1 }
          50%, 99% { opacity: 0 }
          100%   { opacity: 1 }
        }
        @keyframes canliScan {
          0%   { transform: translateY(-2px) }
          100% { transform: translateY(22px) }
        }
        @keyframes canliPulse {
          0%,100% { opacity: 1; transform: scale(1) }
          50%     { opacity: 0.4; transform: scale(0.65) }
        }
        .islemde-flash { animation: islemde-flash 1s steps(1, end) infinite; }
      `}</style>
    </div>
  )
}
