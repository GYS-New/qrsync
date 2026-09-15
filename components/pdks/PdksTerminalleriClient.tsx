'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'
import { useToast } from '@/components/ui/ToastProvider'
import { RefreshCw, Plus, Trash2, Copy, Power, KeyRound, Settings, X } from 'lucide-react'

interface Props { base: string; isSA: boolean; tenantFirmaId?: string | null }

type Tip = 'GIRIS' | 'CIKIS' | 'TOGGLE'
type Row = {
  id: string
  terminal_key: string
  ad: string
  tip: Tip
  firma_id: string
  proje_id: string
  proje_adi: string
  aktif: boolean
  cihaz_id: string | null
  son_gorulme: string | null
  olusturma_tarihi: string
  pin: string
  ad_kisalt: boolean
  ses_acik: boolean
  ses_duzey: 1 | 2 | 3
  pilde_kis: boolean
  liste_gizle: boolean
}

const TIP_LABEL: Record<Tip, string> = {
  GIRIS: 'Sadece GİRİŞ',
  CIKIS: 'Sadece ÇIKIŞ',
  TOGGLE: 'Giriş+Çıkış (Toggle)',
}
const TIP_KISA: Record<Tip, string> = {
  GIRIS: 'GİRİŞ',
  CIKIS: 'ÇIKIŞ',
  TOGGLE: 'TOGGLE',
}
const TIP_RENK: Record<Tip, { bg: string; fg: string }> = {
  GIRIS:  { bg: '#dcfce7', fg: '#16a34a' },
  CIKIS:  { bg: '#fee2e2', fg: '#dc2626' },
  TOGGLE: { bg: '#eff6ff', fg: '#1d4ed8' },
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
  const [yeniTip, setYeniTip] = useState<Tip>('TOGGLE')
  // Ayar duzenleme modali (spec: 1f5941ca)
  const [ayarSatiri, setAyarSatiri] = useState<Row | null>(null)
  const [ayarDegisim, setAyarDegisim] = useState<Partial<Row>>({})
  const [ayarKaydediyor, setAyarKaydediyor] = useState(false)

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
      body: JSON.stringify({ firma_id: firmaId, proje_id: yeniProjeId, ad: yeniAd.trim(), tip: yeniTip }),
    })
    const json = await res.json()
    if (!json.ok) {
      toastRef.current({ type: 'error', title: 'PDKS', message: json.error ?? 'Eklenemedi' })
      return
    }
    toastRef.current({ type: 'success', title: 'Terminal eklendi', message: `terminal_key: ${json.data?.terminal_key}` })
    setEkleAcik(false); setYeniAd(''); setYeniProjeId(''); setYeniTip('TOGGLE')
    yukle()
  }

  function ayarlariAc(r: Row) {
    setAyarSatiri(r)
    setAyarDegisim({
      pin: r.pin,
      ad_kisalt: r.ad_kisalt,
      ses_acik: r.ses_acik,
      ses_duzey: r.ses_duzey,
      pilde_kis: r.pilde_kis,
      liste_gizle: r.liste_gizle,
    })
  }

  async function ayarlariKaydet() {
    if (!ayarSatiri) return
    const body: any = {}
    if (typeof ayarDegisim.pin === 'string' && /^\d{4}$/.test(ayarDegisim.pin)) body.pin = ayarDegisim.pin
    else { toastRef.current({ type: 'error', title: 'PDKS', message: 'PIN 4 haneli olmalı' }); return }
    body.ad_kisalt = !!ayarDegisim.ad_kisalt
    body.ses_acik  = !!ayarDegisim.ses_acik
    body.ses_duzey = [1, 2, 3].includes(ayarDegisim.ses_duzey as any) ? ayarDegisim.ses_duzey : 3
    body.pilde_kis = !!ayarDegisim.pilde_kis
    body.liste_gizle = !!ayarDegisim.liste_gizle
    setAyarKaydediyor(true)
    try {
      const res = await fetch(`/api/pdks-terminalleri/${ayarSatiri.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!json.ok) toastRef.current({ type: 'error', title: 'PDKS', message: json.error })
      else {
        toastRef.current({ type: 'success', title: 'Ayarlar kaydedildi', message: 'Tablet ~10 sn içinde yeni ayarları uygular.' })
        setAyarSatiri(null)
        yukle()
      }
    } finally { setAyarKaydediyor(false) }
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
          <div className="verde-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.5fr auto auto', gap: 10, alignItems: 'end' }}>
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
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase' }}>Tip</span>
                <select value={yeniTip} onChange={e => setYeniTip(e.target.value as Tip)} style={inp}>
                  <option value="TOGGLE">Giriş+Çıkış (Toggle) — tek tablet</option>
                  <option value="GIRIS">Sadece GİRİŞ — iş başı tableti</option>
                  <option value="CIKIS">Sadece ÇIKIŞ — iş bitişi tableti</option>
                </select>
              </label>
              <button onClick={ekle}
                style={{ height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: T.green, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Kaydet
              </button>
              <button onClick={() => { setEkleAcik(false); setYeniAd(''); setYeniProjeId(''); setYeniTip('TOGGLE') }}
                style={{ height: 34, padding: '0 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', color: T.text, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Vazgeç
              </button>
            </div>
            <div style={{ fontSize: 12, color: T.textSoft, lineHeight: 1.5, background: T.grayLight, padding: 10, borderRadius: 8 }}>
              <strong>Tip seçimi:</strong> <em>Toggle</em> = tek tablet açık kayıt yoksa giriş, varsa çıkış yapar (TOGG'a uygun). {' '}
              <em>Sadece GİRİŞ / Sadece ÇIKIŞ</em> = klasik çift QR alışkanlığı — bir tablet girişe, bir tablet çıkışa konur (Çanakkale gibi).
            </div>
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
                    <Th>Tip</Th>
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
                        <span title={TIP_LABEL[r.tip]} style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
                          background: TIP_RENK[r.tip].bg, color: TIP_RENK[r.tip].fg }}>
                          {TIP_KISA[r.tip]}
                        </span>
                      </Td>
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
                          <button onClick={() => ayarlariAc(r)}
                            title="Tablet ayarlarını düzenle (PIN, ses, KVKK)"
                            style={{ height: 30, padding: '0 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: T.gray, fontSize: 12, fontWeight: 700 }}>
                            <Settings size={13} /> Ayarlar
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
      {/* AYARLAR MODALI (spec: 1f5941ca) */}
      {ayarSatiri && (
        <div onClick={() => !ayarKaydediyor && setAyarSatiri(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'grid', placeItems: 'center', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 12, padding: 24, width: 480, maxWidth: '92vw', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Settings size={18} color={T.gray} />
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>Tablet Ayarları</h3>
              </div>
              <button onClick={() => setAyarSatiri(null)} disabled={ayarKaydediyor}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, borderRadius: 6, color: T.textSoft }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: T.textSoft, marginBottom: 16 }}>
              <strong>{ayarSatiri.ad}</strong> · Panelden yapılan değişiklikler tablete ~10 sn içinde yansır.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase' }}>PIN (4 hane) — tablet ayarlar ekranı</span>
                <input type="text" inputMode="numeric" pattern="\d{4}" maxLength={4}
                  value={ayarDegisim.pin ?? ''}
                  onChange={e => setAyarDegisim({ ...ayarDegisim, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                  style={{ ...inp, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.3em', textAlign: 'center', fontSize: 16 }} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase' }}>Ses Düzeyi</span>
                <select value={ayarDegisim.ses_duzey ?? 3}
                  onChange={e => setAyarDegisim({ ...ayarDegisim, ses_duzey: Number(e.target.value) as 1 | 2 | 3 })}
                  style={inp}>
                  <option value={1}>1 — düşük</option>
                  <option value={2}>2 — orta</option>
                  <option value={3}>3 — alarm kanalı + tavan</option>
                </select>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <ToggleSwitch label="Ses açık (okutma bipi)" value={!!ayarDegisim.ses_acik}
                  onChange={v => setAyarDegisim({ ...ayarDegisim, ses_acik: v })} />
                <ToggleSwitch label="Pil kıs — %35 altı" value={!!ayarDegisim.pilde_kis}
                  onChange={v => setAyarDegisim({ ...ayarDegisim, pilde_kis: v })} />
                <ToggleSwitch label='Ad kısalt (KVKK) — "Ahmet Y."' value={!!ayarDegisim.ad_kisalt}
                  onChange={v => setAyarDegisim({ ...ayarDegisim, ad_kisalt: v })} />
                <ToggleSwitch label="Listeyi gizle (sıkı KVKK)" value={!!ayarDegisim.liste_gizle}
                  onChange={v => setAyarDegisim({ ...ayarDegisim, liste_gizle: v })} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
              <button onClick={() => setAyarSatiri(null)} disabled={ayarKaydediyor}
                style={{ height: 36, padding: '0 16px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', color: T.text, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Vazgeç
              </button>
              <button onClick={ayarlariKaydet} disabled={ayarKaydediyor}
                style={{ height: 36, padding: '0 18px', borderRadius: 8, border: 'none', background: T.green, color: '#fff', fontWeight: 700, fontSize: 13, cursor: ayarKaydediyor ? 'wait' : 'pointer', opacity: ayarKaydediyor ? 0.7 : 1 }}>
                {ayarKaydediyor ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes pdks-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function ToggleSwitch({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: value ? T.greenLight : '#fff' }}>
      <div style={{ position: 'relative', width: 34, height: 20, borderRadius: 999, background: value ? T.green : '#cbd5e1', transition: 'background 0.15s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 2, left: value ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>{label}</span>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} style={{ display: 'none' }} />
    </label>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <th style={{ padding: '10px 14px', textAlign: align ?? 'left', fontSize: 11.5, fontWeight: 800, color: T.gray, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{children}</th>
}
function Td({ children, align }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return <td style={{ padding: '10px 14px', textAlign: align ?? 'left', color: T.text, verticalAlign: 'middle' }}>{children}</td>
}
