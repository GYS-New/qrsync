'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'
import { Loader2, RefreshCw } from 'lucide-react'

type Durum = 'ACIK' | 'ISLEMDE' | 'TAMAMLANDI' | 'IPTAL'

type Row = {
  gorev_id: string
  plaka: string
  marka: string | null
  model: string | null
  departman: string | null
  kullanici: string | null
  lokasyon: string
  durum: Durum
  baslatan: string | null
  baslatilma_tarihi: string | null
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

const DURUM_ORDER: Record<Durum, number> = { ISLEMDE: 0, ACIK: 1, TAMAMLANDI: 2, IPTAL: 3 }
const DURUM_LABEL: Record<Durum, string> = { ISLEMDE: 'İşlemde', ACIK: 'Açık', TAMAMLANDI: 'Tamamlandı', IPTAL: 'İptal' }
const DURUM_BG: Record<Durum, string> = { ISLEMDE: T.blueLight, ACIK: T.amberLight, TAMAMLANDI: T.greenLight, IPTAL: T.redLight }
const DURUM_FG: Record<Durum, string> = { ISLEMDE: T.blue, ACIK: T.amber, TAMAMLANDI: T.green, IPTAL: T.red }

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function GunlukClient() {
  const { firmaId } = useFirma()
  const { toast } = useToast()
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

  // Sıralama: ISLEMDE > ACIK > TAMAMLANDI > IPTAL — aynı grupta durum_degisim DESC
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const od = DURUM_ORDER[a.durum] - DURUM_ORDER[b.durum]
      if (od !== 0) return od
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
          <Pil label="İşlemde" sayi={sayilar.ISLEMDE} bg={DURUM_BG.ISLEMDE} fg={DURUM_FG.ISLEMDE} />
          <Pil label="Açık" sayi={sayilar.ACIK} bg={DURUM_BG.ACIK} fg={DURUM_FG.ACIK} />
          <Pil label="Tamamlandı" sayi={sayilar.TAMAMLANDI} bg={DURUM_BG.TAMAMLANDI} fg={DURUM_FG.TAMAMLANDI} />
          <Pil label="İptal" sayi={sayilar.IPTAL} bg={DURUM_BG.IPTAL} fg={DURUM_FG.IPTAL} />
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
            <table className="verde-table" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Plaka</th>
                  <th>Kullanıcı</th>
                  <th>Departman</th>
                  <th>Lokasyon</th>
                  <th style={{ width: 110 }}>Durum</th>
                  <th>Başlatan</th>
                  <th style={{ width: 90 }}>Başlatma</th>
                  <th>Tamamlayan</th>
                  <th style={{ width: 90 }}>Tamamlama</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(r => (
                  <tr key={r.gorev_id}
                    style={{ background: r.durum === 'ISLEMDE' ? DURUM_BG.ISLEMDE : undefined }}>
                    <td style={{ fontFamily: 'monospace', fontWeight: 800, color: T.text }}>{r.plaka}</td>
                    <td style={{ color: T.textSoft, fontSize: 12 }}>{r.kullanici ?? '—'}</td>
                    <td style={{ color: T.textSoft, fontSize: 12 }}>{r.departman ?? '—'}</td>
                    <td style={{ color: T.textSoft, fontSize: 12 }}>{r.lokasyon}</td>
                    <td>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, background: DURUM_BG[r.durum], color: DURUM_FG[r.durum], fontSize: 11, fontWeight: 700 }}>
                        {DURUM_LABEL[r.durum]}
                      </span>
                    </td>
                    <td style={{ color: T.textSoft, fontSize: 12 }}>{r.baslatan ?? '—'}</td>
                    <td style={{ color: T.textSoft, fontSize: 12, fontFamily: 'monospace' }}>{fmtTime(r.baslatilma_tarihi)}</td>
                    <td style={{ color: T.textSoft, fontSize: 12 }}>{r.tamamlayan ?? '—'}</td>
                    <td style={{ color: T.textSoft, fontSize: 12, fontFamily: 'monospace' }}>{fmtTime(r.tamamlanma_tarihi)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function Pil({ label, sayi, bg, fg }: { label: string; sayi: number; bg: string; fg: string }) {
  return (
    <div style={{ padding: '6px 12px', borderRadius: 8, background: bg, color: fg, display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: 18, fontWeight: 900 }}>{sayi}</span>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
    </div>
  )
}
