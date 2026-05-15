'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Loader2, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'

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

  // İlk yükleme + 5sn polling
  useEffect(() => {
    setRows([])
    if (!firmaId) { setYukleniyor(false); return }
    fetchData(true)
    const tid = setInterval(() => fetchData(false), 5000)
    return () => clearInterval(tid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId])

  // Sıralama: hareket eden (ACIK olmayan) üstte, durum_degisim_tarihi DESC.
  // ACIK satırlar altta (henüz işlem görmedi). Son tamamlanan/iptal/işleme alınan
  // her zaman tepeye taşınır — canlı akış mantığı.
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const aHar = a.durum === 'ACIK' ? 1 : 0
      const bHar = b.durum === 'ACIK' ? 1 : 0
      if (aHar !== bHar) return aHar - bHar
      const ta = a.durum_degisim_tarihi ? new Date(a.durum_degisim_tarihi).getTime() : 0
      const tb = b.durum_degisim_tarihi ? new Date(b.durum_degisim_tarihi).getTime() : 0
      return tb - ta
    })
  }, [rows])

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

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Üst bar: özet + son güncelleme */}
      <div className="verde-card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Pil label="Toplam" sayi={sayilar.toplam} bg={T.grayLight} fg={T.text} />
          <Pil label="İşlemde" sayi={sayilar.ISLEMDE} bg={DURUM_BG.ISLEMDE} fg={DURUM_FG.ISLEMDE} blink={sayilar.ISLEMDE > 0} />
          <Pil label="Açık" sayi={sayilar.ACIK} bg={DURUM_BG.ACIK} fg={DURUM_FG.ACIK} />
          <Pil label="Tamamlandı" sayi={sayilar.TAMAMLANDI} bg={DURUM_BG.TAMAMLANDI} fg={DURUM_FG.TAMAMLANDI} />
          <Pil label="İptal" sayi={sayilar.IPTAL} bg={DURUM_BG.IPTAL} fg={DURUM_FG.IPTAL} />
          <div style={{ padding: '6px 12px', borderRadius: 8, background: T.greenLight, color: T.green, display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 16, fontWeight: 900 }}>{fmtSure(toplamSureSaniye)}</span>
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Toplam Süre</span>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: T.textSoft }}>
          <span>Tarih: <strong style={{ color: T.text }}>{today || '—'}</strong></span>
          <span>•</span>
          <span>Son güncelleme: {sonGuncelleme ? fmtTime(sonGuncelleme.toISOString()) : '—'}</span>
          <button onClick={() => fetchData(true)} disabled={yukleniyor}
            style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: yukleniyor ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
            <RefreshCw size={12} style={{ animation: yukleniyor ? 'spin 0.9s linear infinite' : undefined }} />
            Yenile
          </button>
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
          Bugün için Oto Yıkama görevi yok.
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
                  <th style={{ minWidth: 180 }}>Lokasyon</th>
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
                    <td style={{ fontFamily: 'monospace', fontWeight: 800, color: T.text }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {r.plaka}
                        {r.ekstra && (
                          <span style={{ padding: '1px 6px', borderRadius: 999, background: '#fde68a', color: '#92400e', fontSize: 10, fontWeight: 800, letterSpacing: '0.04em' }}>
                            EKSTRA
                          </span>
                        )}
                      </span>
                    </td>
                    <td style={{ color: T.textSoft, fontSize: 12 }}>{r.kullanici ?? '—'}</td>
                    <td style={{ color: T.textSoft, fontSize: 12 }}>{r.departman ?? '—'}</td>
                    <td style={{ color: T.textSoft, fontSize: 12 }}>{r.lokasyon}</td>
                    <td style={{ paddingLeft: 2 }}>
                      <span className={r.durum === 'ISLEMDE' ? 'islemde-flash' : undefined}
                        style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: DURUM_BG[r.durum], color: DURUM_FG[r.durum], fontSize: 11, fontWeight: 700 }}>
                        {DURUM_LABEL[r.durum]}
                      </span>
                    </td>
                    <td style={{ color: T.textSoft, fontSize: 12, fontFamily: 'monospace' }}>{fmtTime(r.baslatilma_tarihi)}</td>
                    <td style={{ color: T.textSoft, fontSize: 12, fontFamily: 'monospace' }}>{fmtTime(r.tamamlanma_tarihi)}</td>
                    <td style={{ color: r.durum === 'TAMAMLANDI' ? T.green : T.textSoft, fontSize: 12, fontFamily: 'monospace', fontWeight: 700 }}>
                      {r.durum === 'TAMAMLANDI' ? fmtSure(gorevSuresiSaniye(r)) : '—'}
                    </td>
                    <td style={{ color: T.textSoft, fontSize: 12 }}>{r.tamamlayan ?? '—'}</td>
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
        @keyframes islemde-pulse {
          0%, 100% { opacity: 1; transform: scale(1) }
          50%      { opacity: 0.55; transform: scale(0.96) }
        }
        @keyframes islemde-flash {
          0%, 49% { opacity: 1 }
          50%, 99% { opacity: 0 }
          100%   { opacity: 1 }
        }
        .islemde-blink { animation: islemde-pulse 1.1s ease-in-out infinite; }
        .islemde-flash { animation: islemde-flash 1s steps(1, end) infinite; }
      `}</style>
    </div>
  )
}

function Pil({ label, sayi, bg, fg, blink }: { label: string; sayi: number; bg: string; fg: string; blink?: boolean }) {
  return (
    <div className={blink ? 'islemde-blink' : undefined}
      style={{ padding: '6px 12px', borderRadius: 8, background: bg, color: fg, display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: 18, fontWeight: 900 }}>{sayi}</span>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
    </div>
  )
}
