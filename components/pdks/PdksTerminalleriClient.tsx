'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'
import { useToast } from '@/components/ui/ToastProvider'
import { RefreshCw, Plus, Trash2, Copy, Power, KeyRound } from 'lucide-react'

interface Props { base: string; isSA: boolean; tenantFirmaId?: string | null }

type Row = {
  id: string
  terminal_key: string
  ad: string
  firma_id: string
  proje_id: string
  proje_adi: string
  aktif: boolean
  cihaz_id: string | null
  son_gorulme: string | null
  olusturma_tarihi: string
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  gray: '#475569', grayLight: '#f8fafc',
}
const inp: React.CSSProperties = {
  height: 34, padding: '0 10px', borderRadius: 8,
  border: `1px solid ${T.border}`, background: '#fff', fontSize: 13, width: '100%',
}

export default function PdksTerminalleriClient({ base, isSA, tenantFirmaId }: Props) {
  const { firmaId: ctxFirmaId } = useFirma()
  const { aktifProje } = useProje()
  const firmaId = isSA ? ctxFirmaId : tenantFirmaId
  const projeId = aktifProje?.id ?? null
  const { toast } = useToast()
  const toastRef = useRef(toast); toastRef.current = toast

  const [rows, setRows] = useState<Row[]>([])
  const [projeler, setProjeler] = useState<{ id: string; ad: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [ekleAcik, setEkleAcik] = useState(false)
  const [yeniAd, setYeniAd] = useState('')
  const [yeniProjeId, setYeniProjeId] = useState('')

  const yukle = useCallback(async () => {
    if (!firmaId) { setRows([]); return }
    setLoading(true)
    try {
      const p = new URLSearchParams({ firma_id: firmaId })
      if (projeId) p.set('proje_id', projeId)
      const res = await fetch(`/api/pdks-terminalleri?${p}`, { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) {
        toastRef.current({ type: 'error', title: 'PDKS', message: json.error ?? 'Yuklenemedi' })
        setRows([])
      } else setRows(json.data ?? [])
    } catch {
      toastRef.current({ type: 'error', title: 'PDKS', message: 'Baglanti hatasi' })
      setRows([])
    } finally { setLoading(false) }
  }, [firmaId, projeId])

  const projeleriYukle = useCallback(async () => {
    if (!firmaId) return
    try {
      const res = await fetch(`/api/projeler?firma_id=${firmaId}`, { cache: 'no-store' })
      const json = await res.json()
      const liste = Array.isArray(json) ? json : (json?.data ?? [])
      setProjeler(liste.map((p: any) => ({ id: p.id, ad: p.ad })))
    } catch { setProjeler([]) }
  }, [firmaId])

  useEffect(() => { yukle() }, [yukle])
  useEffect(() => { projeleriYukle() }, [projeleriYukle])

  async function ekle() {
    if (!yeniAd.trim() || !yeniProjeId) {
      toastRef.current({ type: 'error', title: 'PDKS', message: 'Ad ve proje gerekli' })
      return
    }
    const res = await fetch('/api/pdks-terminalleri', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firma_id: firmaId, proje_id: yeniProjeId, ad: yeniAd.trim() }),
    })
    const json = await res.json()
    if (!json.ok) {
      toastRef.current({ type: 'error', title: 'PDKS', message: json.error ?? 'Eklenemedi' })
      return
    }
    toastRef.current({ type: 'success', title: 'Terminal eklendi', message: `terminal_key: ${json.data?.terminal_key}` })
    setEkleAcik(false); setYeniAd(''); setYeniProjeId('')
    yukle()
  }

  async function aktifDegistir(row: Row) {
    const res = await fetch(`/api/pdks-terminalleri/${row.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aktif: !row.aktif }),
    })
    const json = await res.json()
    if (!json.ok) toastRef.current({ type: 'error', title: 'PDKS', message: json.error })
    else yukle()
  }

  async function keyYenile(row: Row) {
    if (!confirm(`${row.ad} terminalinin anahtari yenilensin mi?\nTabletin yeniden tanimlanmasi gerekecek.`)) return
    const res = await fetch(`/api/pdks-terminalleri/${row.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ islem: 'key-yenile' }),
    })
    const json = await res.json()
    if (!json.ok) toastRef.current({ type: 'error', title: 'PDKS', message: json.error })
    else {
      toastRef.current({ type: 'success', title: 'Anahtar yenilendi', message: json.terminal_key })
      yukle()
    }
  }

  async function sil(row: Row) {
    if (!confirm(`${row.ad} terminali silinsin mi? Bu islem geri alinamaz.`)) return
    const res = await fetch(`/api/pdks-terminalleri/${row.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!json.ok) toastRef.current({ type: 'error', title: 'PDKS', message: json.error })
    else yukle()
  }

  function kopyala(txt: string) {
    navigator.clipboard.writeText(txt).then(
      () => toastRef.current({ type: 'success', title: 'Kopyalandi', message: txt }),
      () => toastRef.current({ type: 'error', title: 'Kopyalanamadi', message: '' }),
    )
  }

  const sonGorulmeFormat = (iso: string | null) => {
    if (!iso) return '—'
    const d = new Date(iso)
    const dk = Math.floor((Date.now() - d.getTime()) / 60000)
    if (dk < 1) return 'az önce'
    if (dk < 60) return `${dk} dk önce`
    const sa = Math.floor(dk / 60)
    if (sa < 24) return `${sa} sa önce`
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  return (
    <div>
      <Topbar
        title="PDKS Terminalleri"
        base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'PDKS Terminalleri' }]}
      />
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        <div className="verde-card" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, fontSize: 13, color: T.textSoft, lineHeight: 1.5 }}>
            Tesis girisine tablet konur; tablet her ~30 sn'de yeni QR gosterir. Terminal olusturunca
            <strong> anahtar</strong> uretilir — bu anahtari tablete elle girin, ilk baglanti oldugunda tablet kilitlenir.
          </div>
          <button onClick={yukle} disabled={loading}
            style={{ height: 34, padding: '0 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', color: T.text, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: loading ? 0.6 : 1 }}>
            <RefreshCw size={14} style={loading ? { animation: 'pdks-spin 0.9s linear infinite' } : undefined} />
            Yenile
          </button>
          <button onClick={() => setEkleAcik(true)} disabled={!firmaId}
            style={{ height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: T.green, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: !firmaId ? 0.5 : 1 }}>
            <Plus size={14} /> Yeni Terminal
          </button>
        </div>

        {ekleAcik && (
          <div className="verde-card" style={{ padding: 14, display: 'grid', gridTemplateColumns: '2fr 1fr auto auto', gap: 10, alignItems: 'end' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase' }}>Terminal Adi</span>
              <input value={yeniAd} onChange={e => setYeniAd(e.target.value)} placeholder="ör. A Blok Ana Giris" style={inp} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase' }}>Proje</span>
              <select value={yeniProjeId} onChange={e => setYeniProjeId(e.target.value)} style={inp}>
                <option value="">Seç…</option>
                {projeler.map(p => <option key={p.id} value={p.id}>{p.ad}</option>)}
              </select>
            </label>
            <button onClick={ekle}
              style={{ height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: T.green, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              Kaydet
            </button>
            <button onClick={() => { setEkleAcik(false); setYeniAd(''); setYeniProjeId('') }}
              style={{ height: 34, padding: '0 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', color: T.text, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
              Vazgeç
            </button>
          </div>
        )}

        <div className="verde-card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: T.textSoft, fontSize: 14 }}>Yükleniyor…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: T.textSoft, fontSize: 14 }}>
              {firmaId ? 'Bu firmada tanimli PDKS terminali yok.' : 'Lütfen bir firma seçin.'}
            </div>
          ) : (
            <div style={{ overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${T.border}`, background: T.grayLight }}>
                    <Th>Terminal</Th>
                    <Th>Proje</Th>
                    <Th>Anahtar</Th>
                    <Th>Bağlı Cihaz</Th>
                    <Th>Son Görülme</Th>
                    <Th>Durum</Th>
                    <Th align="right">İşlem</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <Td><span style={{ fontWeight: 700 }}>{r.ad}</span></Td>
                      <Td>{r.proje_adi || <span style={{ color: T.textSoft, fontStyle: 'italic' }}>—</span>}</Td>
                      <Td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <code style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, background: T.grayLight, padding: '2px 6px', borderRadius: 4 }}>{r.terminal_key}</code>
                          <button onClick={() => kopyala(r.terminal_key)}
                            style={{ height: 26, padding: '0 6px', borderRadius: 4, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            title="Kopyala">
                            <Copy size={12} />
                          </button>
                        </div>
                      </Td>
                      <Td>
                        {r.cihaz_id
                          ? <span title={r.cihaz_id} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11.5, color: T.textSoft }}>{r.cihaz_id.slice(0, 12)}…</span>
                          : <span style={{ color: T.amber, fontSize: 12, fontStyle: 'italic' }}>bağlanmadı</span>}
                      </Td>
                      <Td><span style={{ fontSize: 12, color: T.textSoft }}>{sonGorulmeFormat(r.son_gorulme)}</span></Td>
                      <Td>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
                          background: r.aktif ? T.greenLight : T.redLight, color: r.aktif ? T.green : T.red }}>
                          {r.aktif ? 'AKTİF' : 'PASİF'}
                        </span>
                      </Td>
                      <Td align="right">
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button onClick={() => aktifDegistir(r)}
                            title={r.aktif ? 'Pasifleştir' : 'Aktifleştir'}
                            style={{ height: 30, padding: '0 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: r.aktif ? T.amber : T.green, fontSize: 12, fontWeight: 700 }}>
                            <Power size={13} /> {r.aktif ? 'Pasifleştir' : 'Aktifleştir'}
                          </button>
                          <button onClick={() => keyYenile(r)}
                            title="Anahtarı yenile (mevcut bağlantı kesilir)"
                            style={{ height: 30, padding: '0 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: T.blue, fontSize: 12, fontWeight: 700 }}>
                            <KeyRound size={13} /> Anahtar
                          </button>
                          <button onClick={() => sil(r)}
                            title="Terminali sil"
                            style={{ height: 30, padding: '0 8px', borderRadius: 6, border: `1px solid ${T.red}44`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: T.red, fontSize: 12, fontWeight: 700 }}>
                            <Trash2 size={13} /> Sil
                          </button>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes pdks-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th style={{ padding: '10px 14px', textAlign: align ?? 'left', fontSize: 11.5, fontWeight: 800, color: T.gray, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{children}</th>
}
function Td({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <td style={{ padding: '10px 14px', textAlign: align ?? 'left', color: T.text, verticalAlign: 'middle' }}>{children}</td>
}
