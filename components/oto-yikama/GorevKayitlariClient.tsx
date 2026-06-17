'use client'

import { useMemo, useState } from 'react'
import { Search, X, Filter, Calendar, Download } from 'lucide-react'

export interface GorevKaydi {
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
  olusturan: string | null
  tamamlayan: string | null
  iptal_eden: string | null
  iptal_sebep: string | null
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fef2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  gray: '#9ca3af',
}

type Filtre = 'TUMU' | 'ACIK' | 'ISLEMDE' | 'TAMAMLANDI' | 'IPTAL' | 'EKSTRA'

const DURUM_BG: Record<string, string> = {
  ACIK: T.amberLight, ISLEMDE: T.blueLight, TAMAMLANDI: T.greenLight, IPTAL: T.redLight,
}
const DURUM_FG: Record<string, string> = {
  ACIK: T.amber, ISLEMDE: T.blue, TAMAMLANDI: T.green, IPTAL: T.red,
}
const DURUM_LABEL: Record<string, string> = {
  ACIK: 'Açık', ISLEMDE: 'İşlemde', TAMAMLANDI: 'Tamamlandı', IPTAL: 'İptal',
  ZAMANI_GECMIS: 'Zamanı Geçmiş', SILINDI: 'Silindi', KAPATILDI: 'Kapatıldı',
}

function fmtTarih(d: string | null): string {
  if (!d) return '—'
  // YYYY-MM-DD veya ISO
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

export default function GorevKayitlariClient({ kayitlar }: { kayitlar: GorevKaydi[] }) {
  const [arama, setArama] = useState('')
  const [filtre, setFiltre] = useState<Filtre>('TUMU')
  const [baslangic, setBaslangic] = useState('')
  const [bitis, setBitis] = useState('')

  const sayilar = useMemo(() => {
    let acik = 0, islemde = 0, tamam = 0, iptal = 0, ekstra = 0
    for (const k of kayitlar) {
      if (k.durum === 'ACIK')        acik++
      if (k.durum === 'ISLEMDE')     islemde++
      if (k.durum === 'TAMAMLANDI')  tamam++
      if (['IPTAL','SILINDI','KAPATILDI'].includes(k.durum ?? '')) iptal++
      if (k.ekstra)                  ekstra++
    }
    return { toplam: kayitlar.length, acik, islemde, tamam, iptal, ekstra }
  }, [kayitlar])

  const filtrelenmis = useMemo(() => {
    const ara = arama.trim().toUpperCase()
    let list = kayitlar
    if (filtre === 'ACIK')       list = list.filter(k => k.durum === 'ACIK')
    if (filtre === 'ISLEMDE')    list = list.filter(k => k.durum === 'ISLEMDE')
    if (filtre === 'TAMAMLANDI') list = list.filter(k => k.durum === 'TAMAMLANDI')
    if (filtre === 'IPTAL')      list = list.filter(k => ['IPTAL','SILINDI','KAPATILDI'].includes(k.durum ?? ''))
    if (filtre === 'EKSTRA')     list = list.filter(k => k.ekstra)
    if (baslangic) list = list.filter(k => k.hedef_tarih && k.hedef_tarih >= baslangic)
    if (bitis)     list = list.filter(k => k.hedef_tarih && k.hedef_tarih <= bitis)
    if (ara) list = list.filter(k =>
      (k.plaka ?? '').toUpperCase().includes(ara)
      || (k.istasyon ?? '').toUpperCase().includes(ara)
      || (k.olusturan ?? '').toUpperCase().includes(ara)
      || (k.tamamlayan ?? '').toUpperCase().includes(ara)
    )
    return list
  }, [kayitlar, arama, filtre, baslangic, bitis])

  function exportCsv() {
    const headers = ['Plaka', 'İstasyon', 'Hedef Tarih', 'Durum', 'Ekstra', 'Oluşturma', 'Başlatma', 'Tamamlanma', 'Süre (sn)', 'Oluşturan', 'Tamamlayan', 'İptal Eden', 'İptal Sebebi']
    const rows = filtrelenmis.map(k => [
      k.plaka,
      k.istasyon,
      k.hedef_tarih ?? '',
      DURUM_LABEL[k.durum ?? ''] ?? k.durum ?? '',
      k.ekstra ? 'Evet' : 'Hayır',
      k.olusturma_tarihi ?? '',
      k.baslatilma_tarihi ?? '',
      k.tamamlanma_tarihi ?? '',
      k.tamamlanma_suresi_saniye ?? '',
      k.olusturan ?? '',
      k.tamamlayan ?? '',
      k.iptal_eden ?? '',
      k.iptal_sebep ?? '',
    ])
    const csv = [headers, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `oto-yikama-gorev-kayitlari-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="verde-card" style={{ overflow: 'hidden' }}>
      {/* ÜST BAR */}
      <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.text, letterSpacing: '-0.3px' }}>Görev Kayıtları</div>
          <div style={{ fontSize: 12, color: T.textSoft, marginTop: 2 }}>
            Oluşturulmuş tüm yıkama görevleri — geçmiş + güncel + iptal
          </div>
        </div>
        <KpiPil renk={T.text}   etiket="toplam"     sayi={sayilar.toplam}    active={filtre === 'TUMU'}
                onClick={() => setFiltre('TUMU')} />
        <KpiPil renk={T.amber}  etiket="açık"        sayi={sayilar.acik}      active={filtre === 'ACIK'}
                onClick={() => setFiltre(filtre === 'ACIK' ? 'TUMU' : 'ACIK')} />
        <KpiPil renk={T.blue}   etiket="işlemde"    sayi={sayilar.islemde}   active={filtre === 'ISLEMDE'}
                onClick={() => setFiltre(filtre === 'ISLEMDE' ? 'TUMU' : 'ISLEMDE')} />
        <KpiPil renk={T.green}  etiket="tamamlandı" sayi={sayilar.tamam}     active={filtre === 'TAMAMLANDI'}
                onClick={() => setFiltre(filtre === 'TAMAMLANDI' ? 'TUMU' : 'TAMAMLANDI')} />
        <KpiPil renk={T.red}    etiket="iptal"      sayi={sayilar.iptal}     active={filtre === 'IPTAL'}
                onClick={() => setFiltre(filtre === 'IPTAL' ? 'TUMU' : 'IPTAL')} />
        <KpiPil renk="#7c3aed"  etiket="ekstra"     sayi={sayilar.ekstra}    active={filtre === 'EKSTRA'}
                onClick={() => setFiltre(filtre === 'EKSTRA' ? 'TUMU' : 'EKSTRA')} />
      </div>

      <div style={{ padding: '10px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 240, maxWidth: 420, background: '#f9fafb', border: `1px solid ${T.border}`, borderRadius: 7, padding: '6px 10px' }}>
          <Search size={14} color={T.textSoft} />
          <input type="text" value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Plaka, istasyon, oluşturan, tamamlayan ara…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: T.text }} />
          {arama && (
            <button type="button" onClick={() => setArama('')}
              style={{ border: 'none', background: 'transparent', color: T.textSoft, cursor: 'pointer', fontSize: 14 }}>×</button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textSoft }}>
          <Calendar size={13} />
          <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)}
            style={{ padding: '4px 8px', fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 5, color: T.text }} />
          <span>→</span>
          <input type="date" value={bitis} onChange={e => setBitis(e.target.value)}
            style={{ padding: '4px 8px', fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 5, color: T.text }} />
        </div>

        {(filtre !== 'TUMU' || arama || baslangic || bitis) && (
          <button onClick={() => { setFiltre('TUMU'); setArama(''); setBaslangic(''); setBitis('') }}
            style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: T.text, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <X size={12} /> Filtreyi Temizle
          </button>
        )}

        <button onClick={exportCsv} disabled={filtrelenmis.length === 0}
          style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: filtrelenmis.length === 0 ? 'not-allowed' : 'pointer', fontSize: 11.5, fontWeight: 700, color: T.text, display: 'inline-flex', alignItems: 'center', gap: 5, opacity: filtrelenmis.length === 0 ? 0.5 : 1 }}>
          <Download size={12} /> CSV
        </button>

        <span style={{ marginLeft: 'auto', fontSize: 11, color: T.textSoft }}>
          {filtrelenmis.length} / {kayitlar.length} kayıt
        </span>
      </div>

      {/* TABLO */}
      {filtrelenmis.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: T.textSoft, fontSize: 13 }}>
          {kayitlar.length === 0 ? 'Henüz görev kaydı yok.' : 'Filtre koşullarına uyan kayıt yok.'}
        </div>
      ) : (
        <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 320px)', overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1100 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#fafafa', zIndex: 2 }}>
              <tr>
                <Th>Plaka</Th>
                <Th>İstasyon</Th>
                <Th align="center">Hedef Tarih</Th>
                <Th align="center">Durum</Th>
                <Th align="center">Oluşturma</Th>
                <Th align="center">Tamamlanma</Th>
                <Th align="center">Süre</Th>
                <Th>Tamamlayan</Th>
                <Th>Oluşturan</Th>
              </tr>
            </thead>
            <tbody>
              {filtrelenmis.map(k => {
                const durumLabel = DURUM_LABEL[k.durum ?? ''] ?? (k.durum ?? '—')
                const durumBg = DURUM_BG[k.durum ?? ''] ?? '#f1f5f9'
                const durumFg = DURUM_FG[k.durum ?? ''] ?? T.textSoft
                return (
                  <tr key={k.gorev_id}>
                    <Td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, color: T.text, letterSpacing: '0.03em' }}>{k.plaka}</span>
                        {k.ekstra && (
                          <span style={{ padding: '1px 6px', borderRadius: 999, background: '#f3e8ff', color: '#7c3aed', fontSize: 10, fontWeight: 800, letterSpacing: '0.04em' }}>EKSTRA</span>
                        )}
                      </div>
                    </Td>
                    <Td muted>{k.istasyon}</Td>
                    <Td align="center">{fmtTarih(k.hedef_tarih)}</Td>
                    <Td align="center">
                      <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 999, background: durumBg, color: durumFg, fontSize: 11, fontWeight: 700 }}>
                        {durumLabel}
                      </span>
                    </Td>
                    <Td align="center" muted><span style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{fmtDateTime(k.olusturma_tarihi)}</span></Td>
                    <Td align="center" muted><span style={{ fontFamily: 'monospace', fontSize: 11.5 }}>{fmtDateTime(k.tamamlanma_tarihi)}</span></Td>
                    <Td align="center" muted><span style={{ fontFamily: 'monospace', fontSize: 11.5, color: k.durum === 'TAMAMLANDI' ? T.green : T.textSoft, fontWeight: k.durum === 'TAMAMLANDI' ? 700 : 400 }}>{fmtSure(k.tamamlanma_suresi_saniye)}</span></Td>
                    <Td muted>{k.tamamlayan ?? '—'}</Td>
                    <Td muted>{k.olusturan ?? '—'}</Td>
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

function KpiPil({ etiket, sayi, renk, active, onClick }: {
  etiket: string; sayi: number; renk: string; active?: boolean; onClick?: () => void
}) {
  return (
    <button type="button" onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 8,
        background: active ? renk + '14' : '#fafafa',
        border: active ? `1.5px solid ${renk}` : '1px solid #e5e7eb',
        cursor: 'pointer',
        display: 'inline-flex', alignItems: 'baseline', gap: 6,
        transition: 'all 0.15s',
      }}>
      <span style={{ fontSize: 16, fontWeight: 900, color: renk, lineHeight: 1 }}>{sayi}</span>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: renk, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{etiket}</span>
    </button>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' | 'center' }) {
  return <th style={{ textAlign: align ?? 'left', padding: '10px 12px', borderBottom: '2px solid #e5e7eb', color: '#374151', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, background: '#fafafa' }}>{children}</th>
}

function Td({ children, muted, align }: { children: React.ReactNode; muted?: boolean; align?: 'right' | 'left' | 'center' }) {
  return <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9', textAlign: align ?? 'left', color: muted ? '#64748b' : '#0f172a' }}>{children}</td>
}
