'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'
import { RefreshCw, Users, Smartphone, MapPin, Filter, Download } from 'lucide-react'

interface Props { base: string; isSA: boolean; tenantFirmaId?: string | null; projeId?: string | null }

type Row = {
  personel_id: string
  isim_soyisim: string
  aktif: boolean
  cihaz_eslesti: boolean
  ust_lokasyon_id: string | null
  ust_lokasyon_adi: string | null
  tamamlandi_sayi: number
  iptal_sayi: number
  ortalama_sure_saniye: number | null
}
type Meta = {
  tarih_baslangic: string
  tarih_bitis: string
  ust_lokasyonlar: { id: string; tanim: string }[]
  personeller: { id: string; isim_soyisim: string }[]
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

function fmtSure(sn: number | null): string {
  if (!sn || sn <= 0) return '—'
  const h = Math.floor(sn / 3600)
  const m = Math.floor((sn % 3600) / 60)
  const s = sn % 60
  if (h > 0) return `${h}sa ${m}dk`
  if (m > 0) return `${m}dk ${s}sn`
  return `${s}sn`
}

function bugunISO(): string {
  return new Date().toISOString().slice(0, 10)
}
function gunOnceISO(gun: number): string {
  const d = new Date()
  d.setDate(d.getDate() - gun)
  return d.toISOString().slice(0, 10)
}

export default function PersonelDegerlendirmeClient({ base, isSA, tenantFirmaId, projeId }: Props) {
  const { firmaId: ctxFirmaId } = useFirma()
  const firmaId = isSA ? ctxFirmaId : tenantFirmaId
  const { toast } = useToast()
  const toastRef = useRef(toast); toastRef.current = toast

  // Filtreler
  const [tarihBaslangic, setTarihBaslangic] = useState(gunOnceISO(30))
  const [tarihBitis, setTarihBitis] = useState(bugunISO())
  const [ustLokFilter, setUstLokFilter] = useState('')
  const [personelFilter, setPersonelFilter] = useState('')

  const [rows, setRows] = useState<Row[]>([])
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(false)

  const yukle = useCallback(async () => {
    if (!firmaId) { setRows([]); setMeta(null); return }
    setLoading(true)
    try {
      const p = new URLSearchParams({ firma_id: firmaId, tarih_baslangic: tarihBaslangic, tarih_bitis: tarihBitis })
      if (projeId) p.set('proje_id', projeId)
      if (ustLokFilter) p.set('ust_lokasyon_id', ustLokFilter)
      if (personelFilter) p.set('personel_id', personelFilter)
      const res = await fetch(`/api/raporlar/personel-degerlendirme?${p}`, { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) {
        toastRef.current({ type: 'error', title: 'Rapor', message: json.error ?? 'Yüklenemedi' })
        setRows([]); setMeta(null)
      } else {
        setRows(json.data ?? [])
        setMeta(json.meta ?? null)
      }
    } catch (e: any) {
      toastRef.current({ type: 'error', title: 'Rapor', message: 'Bağlantı hatası' })
      setRows([]); setMeta(null)
    } finally {
      setLoading(false)
    }
  }, [firmaId, projeId, tarihBaslangic, tarihBitis, ustLokFilter, personelFilter])

  useEffect(() => { yukle() }, [yukle])

  // Özet metrikler
  const ozet = useMemo(() => {
    const toplamPersonel = rows.length
    const aktifSayi = rows.filter(r => r.aktif).length
    const eslesenSayi = rows.filter(r => r.cihaz_eslesti).length
    const toplamTamamlanan = rows.reduce((s, r) => s + r.tamamlandi_sayi, 0)
    const toplamIptal = rows.reduce((s, r) => s + r.iptal_sayi, 0)
    return { toplamPersonel, aktifSayi, eslesenSayi, toplamTamamlanan, toplamIptal }
  }, [rows])

  function exportCSV() {
    if (rows.length === 0) return
    const header = ['Personel', 'Aktif', 'Cihaz Eşleşti', 'Üst Lokasyon', 'Tamamlanan', 'İptal', 'Ort. Süre (sn)']
    const lines = [header.join(';')]
    for (const r of rows) {
      lines.push([
        `"${r.isim_soyisim.replace(/"/g, '""')}"`,
        r.aktif ? 'Evet' : 'Hayır',
        r.cihaz_eslesti ? 'Evet' : 'Hayır',
        `"${(r.ust_lokasyon_adi ?? '').replace(/"/g, '""')}"`,
        String(r.tamamlandi_sayi),
        String(r.iptal_sayi),
        r.ortalama_sure_saniye != null ? String(r.ortalama_sure_saniye) : '',
      ].join(';'))
    }
    const csv = '﻿' + lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `personel-degerlendirme_${tarihBaslangic}_${tarihBitis}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <Topbar
        title="Personel Değerlendirme Raporu"
        base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: `${base}/dashboard/raporlar` }, { label: 'Personel Değerlendirme' }]}
      />

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* ─── Filtre bandı ───────────────────────────────────────────────── */}
        <div className="verde-card" style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr) auto auto', gap: 10, alignItems: 'end' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Başlangıç</span>
            <input type="date" value={tarihBaslangic} onChange={e => setTarihBaslangic(e.target.value)} style={inp} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bitiş</span>
            <input type="date" value={tarihBitis} onChange={e => setTarihBitis(e.target.value)} style={inp} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Üst Lokasyon</span>
            <select value={ustLokFilter} onChange={e => setUstLokFilter(e.target.value)} style={inp}>
              <option value="">Tümü</option>
              {(meta?.ust_lokasyonlar ?? []).map(l => (
                <option key={l.id} value={l.id}>{l.tanim}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Personel</span>
            <select value={personelFilter} onChange={e => setPersonelFilter(e.target.value)} style={inp}>
              <option value="">Tümü</option>
              {(meta?.personeller ?? []).map(p => (
                <option key={p.id} value={p.id}>{p.isim_soyisim}</option>
              ))}
            </select>
          </label>
          <button onClick={yukle} disabled={loading}
            style={{ height: 34, padding: '0 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', color: T.text, fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: loading ? 0.6 : 1 }}>
            <RefreshCw size={14} style={loading ? { animation: 'pdr-spin 0.9s linear infinite' } : undefined} />
            Yenile
          </button>
          <button onClick={exportCSV} disabled={rows.length === 0}
            style={{ height: 34, padding: '0 14px', borderRadius: 8, border: 'none', background: T.text, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: rows.length === 0 ? 0.5 : 1 }}>
            <Download size={14} /> CSV
          </button>
        </div>

        {/* ─── Özet kartları ───────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          <KpiKart Icon={Users} label="Toplam Personel" value={String(ozet.toplamPersonel)} color={T.gray} />
          <KpiKart Icon={Users} label="Aktif" value={String(ozet.aktifSayi)} color={T.green} />
          <KpiKart Icon={Smartphone} label="Cihaz Eşleşmiş" value={String(ozet.eslesenSayi)} color={T.blue} />
          <KpiKart Icon={Filter} label="Tamamlanan" value={String(ozet.toplamTamamlanan)} color={T.green} />
          <KpiKart Icon={Filter} label="İptal" value={String(ozet.toplamIptal)} color={T.red} />
        </div>

        {/* ─── Tablo ───────────────────────────────────────────────────────── */}
        <div className="verde-card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 60, textAlign: 'center', color: T.textSoft, fontSize: 14 }}>Yükleniyor…</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: T.textSoft, fontSize: 14 }}>
              {firmaId ? 'Bu kriterlerle eşleşen personel yok.' : 'Lütfen bir firma seçin.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: T.grayLight, borderBottom: `2px solid ${T.border}` }}>
                    <th style={thS}>#</th>
                    <th style={thS}>Personel</th>
                    <th style={thS}>Cihaz</th>
                    <th style={thS}>Üst Lokasyon</th>
                    <th style={thS}>Durum</th>
                    <th style={{ ...thS, textAlign: 'right' }}>Tamamlanan</th>
                    <th style={{ ...thS, textAlign: 'right' }}>İptal</th>
                    <th style={{ ...thS, textAlign: 'right' }}>Ort. Süre</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.personel_id} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={tdS}>{i + 1}</td>
                      <td style={{ ...tdS, fontWeight: 700, color: T.text }}>{r.isim_soyisim}</td>
                      <td style={tdS}>
                        <Badge text={r.cihaz_eslesti ? 'Eşleşmiş' : 'Eşleşmemiş'} bg={r.cihaz_eslesti ? T.greenLight : T.amberLight} fg={r.cihaz_eslesti ? T.green : T.amber} />
                      </td>
                      <td style={tdS}>{r.ust_lokasyon_adi || <span style={{ color: T.textSoft, fontStyle: 'italic' }}>—</span>}</td>
                      <td style={tdS}>
                        <Badge text={r.aktif ? 'Aktif' : 'Pasif'} bg={r.aktif ? T.greenLight : T.redLight} fg={r.aktif ? T.green : T.red} />
                      </td>
                      <td style={{ ...tdS, textAlign: 'right', fontWeight: 700, color: T.green }}>{r.tamamlandi_sayi}</td>
                      <td style={{ ...tdS, textAlign: 'right', fontWeight: 700, color: r.iptal_sayi > 0 ? T.red : T.textSoft }}>{r.iptal_sayi}</td>
                      <td style={{ ...tdS, textAlign: 'right', fontWeight: 600 }}>{fmtSure(r.ortalama_sure_saniye)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes pdr-spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

const thS: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 11.5, fontWeight: 800,
  color: T.gray, textTransform: 'uppercase', letterSpacing: '0.04em',
}
const tdS: React.CSSProperties = { padding: '10px 14px', color: T.text, verticalAlign: 'middle' }

function Badge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: bg, color: fg, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

function KpiKart({ Icon, label, value, color }: { Icon: any; label: string; value: string; color: string }) {
  return (
    <div className="verde-card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: color + '18', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: T.text, lineHeight: 1.1 }}>{value}</div>
      </div>
    </div>
  )
}
