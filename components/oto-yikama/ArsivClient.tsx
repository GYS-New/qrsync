'use client'

import { useMemo, useState } from 'react'
import { Search, X, Download, Archive } from 'lucide-react'

export interface ArsivKaydi {
  gorev_id: string
  plaka: string
  hedef_tarih: string | null
  ekstra: boolean
  durum: string | null
  istasyon: string
  olusturma_tarihi: string | null
  baslatilma_tarihi: string | null
  tamamlanma_tarihi: string | null
  tamamlanma_suresi_saniye: number | null
  arsivleme_tarihi: string | null
  olusturan: string | null
  tamamlayan: string | null
  tamamlayan_id: string | null
  iptal_eden: string | null
  iptal_sebep: string | null
}

export interface IstasyonOpt { id: string; tanim: string }
export interface KullaniciOpt { id: string; isim_soyisim: string }

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fef2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  gray: '#9ca3af',
  indigo: '#4f46e5', indigoLight: '#eef2ff',
  purple: '#7c3aed', purpleLight: '#f3e8ff',
}

type ArsivDurum = 'HAZIR' | 'ACIK' | 'ISLEMDE' | 'TAMAMLANDI' | 'IPTAL' | 'DIGER'
type DurumFilter = 'TUMU' | ArsivDurum | 'EKSTRA'

function normalizeDurum(d: string | null): ArsivDurum {
  if (d === 'HAZIR')       return 'HAZIR'
  if (d === 'ACIK')        return 'ACIK'
  if (d === 'ISLEMDE')     return 'ISLEMDE'
  if (d === 'TAMAMLANDI')  return 'TAMAMLANDI'
  if (d && ['IPTAL', 'SILINDI', 'KAPATILDI'].includes(d)) return 'IPTAL'
  return 'DIGER'
}

const DURUM_BG: Record<ArsivDurum, string> = {
  HAZIR: '#f1f5f9', ACIK: T.amberLight, ISLEMDE: T.blueLight,
  TAMAMLANDI: T.greenLight, IPTAL: T.redLight, DIGER: '#f1f5f9',
}
const DURUM_FG: Record<ArsivDurum, string> = {
  HAZIR: '#475569', ACIK: T.amber, ISLEMDE: T.blue,
  TAMAMLANDI: T.green, IPTAL: T.red, DIGER: T.textSoft,
}
const DURUM_LABEL: Record<ArsivDurum, string> = {
  HAZIR: 'Hazır', ACIK: 'Açık', ISLEMDE: 'İşlemde',
  TAMAMLANDI: 'Tamamlandı', IPTAL: 'İptal', DIGER: '—',
}

function fmtTarih(d: string | null): string {
  if (!d) return '—'
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d.slice(8) + '.' + d.slice(5, 7) + '.' + d.slice(0, 4)
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(d))
}
function fmtDateTime(d: string | null): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(d))
}
function fmtSure(saniye: number | null): string {
  if (saniye == null || saniye <= 0) return '—'
  const m = Math.floor(saniye / 60)
  const s = saniye % 60
  if (m === 0) return `${s}sn`
  return `${m}dk ${s}sn`
}

interface Props {
  kayitlar: ArsivKaydi[]
  istasyonlar: IstasyonOpt[]
  tamamlayanlar: KullaniciOpt[]
}

export default function ArsivClient({ kayitlar, istasyonlar, tamamlayanlar }: Props) {
  const [arama, setArama] = useState('')
  const [istasyonFilter, setIstasyonFilter] = useState<string>('')
  const [tamamlayanFilter, setTamamlayanFilter] = useState<string>('')
  const [hedefBas, setHedefBas] = useState<string>('')
  const [hedefSon, setHedefSon] = useState<string>('')
  const [durumFilter, setDurumFilter] = useState<DurumFilter>('TUMU')

  // Sayaçlar (filtre öncesi)
  const sayilar = useMemo(() => {
    const s = { TOPLAM: kayitlar.length, ACIK: 0, ISLEMDE: 0, TAMAMLANDI: 0, IPTAL: 0, EKSTRA: 0 }
    for (const k of kayitlar) {
      const d = normalizeDurum(k.durum)
      if (d === 'ACIK')       s.ACIK++
      if (d === 'ISLEMDE')    s.ISLEMDE++
      if (d === 'TAMAMLANDI') s.TAMAMLANDI++
      if (d === 'IPTAL')      s.IPTAL++
      if (k.ekstra)           s.EKSTRA++
    }
    return s
  }, [kayitlar])

  // Filtreleme
  const filtrelenmis = useMemo(() => {
    const q = arama.trim().toLocaleLowerCase('tr')
    return kayitlar.filter(k => {
      if (q) {
        const blob = `${k.plaka} ${k.istasyon} ${k.olusturan ?? ''} ${k.tamamlayan ?? ''}`.toLocaleLowerCase('tr')
        if (!blob.includes(q)) return false
      }
      if (istasyonFilter) {
        const istLabel = istasyonlar.find(i => i.id === istasyonFilter)?.tanim
        if (!istLabel || istLabel !== k.istasyon) return false
      }
      if (tamamlayanFilter && k.tamamlayan_id !== tamamlayanFilter) return false
      if (hedefBas && (!k.hedef_tarih || k.hedef_tarih < hedefBas)) return false
      if (hedefSon && (!k.hedef_tarih || k.hedef_tarih > hedefSon)) return false
      if (durumFilter !== 'TUMU') {
        if (durumFilter === 'EKSTRA') {
          if (!k.ekstra) return false
        } else {
          if (normalizeDurum(k.durum) !== durumFilter) return false
        }
      }
      return true
    })
  }, [kayitlar, arama, istasyonFilter, tamamlayanFilter, hedefBas, hedefSon, durumFilter, istasyonlar])

  const filtreVar =
    !!arama || !!istasyonFilter || !!tamamlayanFilter || !!hedefBas || !!hedefSon || durumFilter !== 'TUMU'

  function temizle() {
    setArama(''); setIstasyonFilter(''); setTamamlayanFilter('')
    setHedefBas(''); setHedefSon(''); setDurumFilter('TUMU')
  }

  function exportCsv() {
    if (filtrelenmis.length === 0) return
    const rows: string[][] = [[
      'Plaka', 'İstasyon', 'Hedef Tarih', 'Durum', 'Ekstra',
      'Başlatma', 'Tamamlanma', 'Süre', 'Tamamlayan', 'Arşivleme Tarihi',
    ]]
    for (const k of filtrelenmis) {
      const d = normalizeDurum(k.durum)
      rows.push([
        k.plaka, k.istasyon, fmtTarih(k.hedef_tarih), DURUM_LABEL[d], k.ekstra ? 'EKSTRA' : '',
        fmtDateTime(k.baslatilma_tarihi), fmtDateTime(k.tamamlanma_tarihi),
        fmtSure(k.tamamlanma_suresi_saniye), k.tamamlayan ?? '',
        fmtDateTime(k.arsivleme_tarihi),
      ])
    }
    const csv = rows.map(r => r.map(c => `"${(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `oto-yikama-arsiv-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className="verde-card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Başlık satırı */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Archive size={20} style={{ color: T.indigo }} />
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.text, letterSpacing: '-0.3px' }}>Arşiv</div>
          <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2 }}>
            Hedef tarihi 30 günü geçen tüm yıkama görevleri (otomatik taşınır, geri çevrilmez).
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <Pill label="Toplam"     sayi={sayilar.TOPLAM}     renk={T.text}    aktif={durumFilter === 'TUMU'}       onClick={() => setDurumFilter('TUMU')} />
          <Pill label="Açık"       sayi={sayilar.ACIK}       renk={T.amber}   aktif={durumFilter === 'ACIK'}       onClick={() => setDurumFilter('ACIK')} />
          <Pill label="İşlemde"    sayi={sayilar.ISLEMDE}    renk={T.blue}    aktif={durumFilter === 'ISLEMDE'}    onClick={() => setDurumFilter('ISLEMDE')} />
          <Pill label="Tamamlandı" sayi={sayilar.TAMAMLANDI} renk={T.green}   aktif={durumFilter === 'TAMAMLANDI'} onClick={() => setDurumFilter('TAMAMLANDI')} />
          <Pill label="İptal"      sayi={sayilar.IPTAL}      renk={T.red}     aktif={durumFilter === 'IPTAL'}      onClick={() => setDurumFilter('IPTAL')} />
          <Pill label="Ekstra"     sayi={sayilar.EKSTRA}     renk={T.purple}  aktif={durumFilter === 'EKSTRA'}     onClick={() => setDurumFilter('EKSTRA')} />
        </div>
      </div>

      {/* Filtre satırı */}
      <div style={{ padding: '12px 18px', borderBottom: `1px solid ${T.border}`, display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1.3fr', gap: 10 }}>
        <div>
          <Label>Arama</Label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 9px', border: `1px solid ${T.border}`, borderRadius: 6, background: '#fff' }}>
            <Search size={13} style={{ color: T.textSoft }} />
            <input value={arama} onChange={e => setArama(e.target.value)} placeholder="Plaka, istasyon, kişi…"
              style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, minWidth: 0 }} />
          </div>
        </div>
        <div>
          <Label>İstasyon</Label>
          <select value={istasyonFilter} onChange={e => setIstasyonFilter(e.target.value)}
            style={{ width: '100%', padding: '6px 9px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: '#fff' }}>
            <option value="">Tümü</option>
            {istasyonlar.map(i => <option key={i.id} value={i.id}>{i.tanim}</option>)}
          </select>
        </div>
        <div>
          <Label>Tamamlayan</Label>
          <select value={tamamlayanFilter} onChange={e => setTamamlayanFilter(e.target.value)}
            style={{ width: '100%', padding: '6px 9px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: '#fff' }}>
            <option value="">Tümü</option>
            {tamamlayanlar.map(u => <option key={u.id} value={u.id}>{u.isim_soyisim}</option>)}
          </select>
        </div>
        <div>
          <Label>Hedef Tarih</Label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="date" value={hedefBas} onChange={e => setHedefBas(e.target.value)}
              style={{ flex: 1, padding: '5px 7px', fontSize: 12.5, border: `1px solid ${T.border}`, borderRadius: 5 }} />
            <span style={{ alignSelf: 'center', fontSize: 11, color: T.textSoft }}>→</span>
            <input type="date" value={hedefSon} onChange={e => setHedefSon(e.target.value)}
              style={{ flex: 1, padding: '5px 7px', fontSize: 12.5, border: `1px solid ${T.border}`, borderRadius: 5 }} />
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ padding: '8px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: T.textSoft }}>
        <strong style={{ color: T.text }}>{filtrelenmis.length}</strong> / {kayitlar.length} kayıt
        {filtreVar && (
          <button onClick={temizle}
            style={{ padding: '4px 9px', borderRadius: 5, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: T.text, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <X size={11} /> Temizle
          </button>
        )}
        <button onClick={exportCsv}
          disabled={filtrelenmis.length === 0}
          style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 5, border: `1px solid ${T.border}`, background: '#fff', cursor: filtrelenmis.length === 0 ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 700, color: T.text, display: 'inline-flex', alignItems: 'center', gap: 5, opacity: filtrelenmis.length === 0 ? 0.5 : 1 }}>
          <Download size={11} /> CSV
        </button>
      </div>

      {/* Tablo */}
      {filtrelenmis.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: T.textSoft, fontSize: 13 }}>
          {kayitlar.length === 0
            ? 'Arşivde kayıt yok. (Hedef tarihi 30 günü geçen yıkama görevleri her gece arşive taşınır.)'
            : 'Filtreye uyan kayıt yok.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 260px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 1200 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <Th>Plaka</Th>
                <Th>İstasyon</Th>
                <Th align="center">Hedef Tarih</Th>
                <Th align="center">Durum</Th>
                <Th align="center">Başlatma</Th>
                <Th align="center">Tamamlanma</Th>
                <Th align="center">Süre</Th>
                <Th>Tamamlayan</Th>
                <Th align="center">Arşiv Tarihi</Th>
              </tr>
            </thead>
            <tbody>
              {filtrelenmis.map(k => {
                const gd = normalizeDurum(k.durum)
                return (
                  <tr key={k.gorev_id}>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 15, color: T.text, letterSpacing: '0.03em' }}>{k.plaka}</span>
                        {k.ekstra && (
                          <span style={{ padding: '2px 7px', borderRadius: 999, background: T.purpleLight, color: T.purple, fontSize: 11, fontWeight: 800, letterSpacing: '0.04em' }}>EKSTRA</span>
                        )}
                      </div>
                    </Td>
                    <Td muted>{k.istasyon}</Td>
                    <Td align="center">{fmtTarih(k.hedef_tarih)}</Td>
                    <Td align="center">
                      <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: DURUM_BG[gd], color: DURUM_FG[gd], fontSize: 12, fontWeight: 700 }}>
                        {DURUM_LABEL[gd]}
                      </span>
                    </Td>
                    <Td align="center" muted><span style={{ fontFamily: 'monospace', fontSize: 14 }}>{fmtDateTime(k.baslatilma_tarihi)}</span></Td>
                    <Td align="center" muted><span style={{ fontFamily: 'monospace', fontSize: 14 }}>{fmtDateTime(k.tamamlanma_tarihi)}</span></Td>
                    <Td align="center" muted>
                      <span style={{ fontFamily: 'monospace', fontSize: 14, color: gd === 'TAMAMLANDI' ? T.green : T.textSoft, fontWeight: gd === 'TAMAMLANDI' ? 700 : 400 }}>
                        {fmtSure(k.tamamlanma_suresi_saniye)}
                      </span>
                    </Td>
                    <Td muted>{k.tamamlayan ?? '—'}</Td>
                    <Td align="center" muted><span style={{ fontFamily: 'monospace', fontSize: 14 }}>{fmtDateTime(k.arsivleme_tarihi)}</span></Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
      {children}
    </div>
  )
}

function Pill({ label, sayi, renk, aktif, onClick }: {
  label: string; sayi: number; renk: string; aktif: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      style={{
        padding: '5px 11px', borderRadius: 7,
        border: aktif ? `1.5px solid ${renk}` : `1px solid ${T.border}`,
        background: aktif ? `${renk}10` : '#fff',
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        transition: 'all 0.15s',
      }}>
      <span style={{ fontSize: 18, fontWeight: 900, color: renk, lineHeight: 1 }}>{sayi}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: renk, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
    </button>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' | 'center' }) {
  return <th style={{ textAlign: align ?? 'left', padding: '11px 12px', borderBottom: '2px solid #e5e7eb', color: '#374151', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, background: '#fafafa' }}>{children}</th>
}

function Td({ children, muted, align }: { children: React.ReactNode; muted?: boolean; align?: 'right' | 'left' | 'center' }) {
  return <td style={{ padding: '11px 12px', borderBottom: '1px solid #f1f5f9', textAlign: align ?? 'left', color: muted ? '#64748b' : '#0f172a' }}>{children}</td>
}
