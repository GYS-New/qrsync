'use client'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useToast } from '@/components/ui/ToastProvider'
import { RefreshCw, FileSpreadsheet, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Target, Activity } from 'lucide-react'
import { useFirma } from '@/components/layout/FirmaContext'

type Props = {
  base: string
  isSA: boolean
  tenantFirmaId?: string | null
  projeId?: string | null
}
type Lokasyon = { id: string; tanim: string; parent_id: string | null }
type GrupMetrik = {
  grup: string; lokasyon: string; gorevTanimi: string; gunlukFrekans: number
  hedef: number; tamamlanan: number; sapma: number; kayip: number
  basariOrani: string; genelOran: string
}
type TamamlananRow = { sn: number; personel: string; lokasyon: string; gorevNo: string; gorevTanimi: string; tarihSaat: string; durum: string }
type SapmaRow = { sn: number; personel: string; lokasyon: string; gorevNo: string; gorevTanimi: string; tarihSaat: string; sapmaNedeni: string }
type KayipRow = { sn: number; lokasyon: string; gorevNo: string; gorevTanimi: string; tarihSaat: string; durum: string }
type RaporData = {
  firmaAdi: string; ustLokTanim: string; altLokTanim: string
  raporTarihLabel: string; gunSayisi: number; raporuAlan: string
  toplamGorev: number; toplamTamamlanan: number; toplamSapma: number
  toplamKayip: number; genelBasari: number
  grupMetrikleri: GrupMetrik[]
  tamamlananGorevler: TamamlananRow[]
  sapmaGorevler: SapmaRow[]
  kayipGorevler: KayipRow[]
}

// ─── Design tokens ───────────────────────────────────────────────
const T = {
  green:    '#1a5c2a',
  greenMid: '#2e8b2e',
  greenLight:'#e8f5e8',
  amber:    '#d97706',
  amberLight:'#fef3c7',
  red:      '#dc2626',
  redLight: '#fee2e2',
  blue:     '#1d4ed8',
  blueLight:'#dbeafe',
  gray:     '#475569',
  grayLight:'#f8fafc',
  border:   '#e2e8f0',
  white:    '#ffffff',
  text:     '#0f172a',
  textMid:  '#334155',
  textSoft: '#64748b',
}

// ─── Shared components ───────────────────────────────────────────
function MetricCard({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string; color: string; icon: any
}) {
  return (
    <div style={{ background: T.white, border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} color={color} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: T.text, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11.5, color: T.textSoft, marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  )
}

function SectionHead({ title, color = T.green }: { title: string; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <div style={{ width: 3, height: 18, borderRadius: 2, background: color }} />
      <span style={{ fontSize: 13, fontWeight: 800, color: T.text, letterSpacing: '0.02em' }}>{title}</span>
    </div>
  )
}

function DataTable({ headers, rows, accentCol, accentColor }: {
  headers: string[]
  rows: (string | number)[][]
  accentCol?: number
  accentColor?: string
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: '8px 12px', background: T.green, color: T.white,
                fontWeight: 700, fontSize: 11.5, textAlign: i === 0 ? 'left' : 'center',
                whiteSpace: 'nowrap', letterSpacing: '0.03em',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} style={{ padding: '24px 12px', textAlign: 'center', color: T.textSoft, fontSize: 13 }}>Veri bulunamadı.</td></tr>
          ) : rows.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? T.grayLight : T.white }}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  padding: '7px 12px',
                  borderBottom: `1px solid ${T.border}`,
                  textAlign: ci === 0 ? 'left' : 'center',
                  fontWeight: ci === accentCol ? 700 : ci === 0 ? 600 : 400,
                  color: ci === accentCol ? (accentColor ?? T.greenMid) : ci === 0 ? T.textMid : T.text,
                  fontSize: 12.5,
                }}>{String(cell ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Badge({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color, background: bg }}>
      {text}
    </span>
  )
}

// ─── GİRİŞ SEKMESİ ───────────────────────────────────────────────
function GirisSheet({ data }: { data: RaporData }) {
  const toplamHedef       = data.grupMetrikleri.reduce((s, g) => s + g.hedef, 0) || data.toplamGorev
  const toplamGerceklesen = data.toplamTamamlanan + data.toplamSapma
  const sapmaOrani        = toplamHedef > 0 ? Math.round(data.toplamSapma / toplamHedef * 100) : 0
  const kayipOrani        = toplamHedef > 0 ? Math.round(data.toplamKayip / toplamHedef * 100) : 0


  // ── tablo helper ──────────────────────────────────────────────
  const th = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: '#375623', color: '#fff', fontWeight: 700, fontSize: 10.5,
    padding: '5px 7px', border: '1px solid #b8c8b8',
    textAlign: 'center', verticalAlign: 'middle',
    whiteSpace: 'normal', lineHeight: 1.3, ...extra,
  })
  const td = (extra?: React.CSSProperties): React.CSSProperties => ({
    fontSize: 11, padding: '4px 7px', border: '1px solid #d0d8d0',
    verticalAlign: 'middle', ...extra,
  })
  const stripe = (i: number) => ({ background: i % 2 === 0 ? '#f4f8f4' : '#fff' })
  const totRow: React.CSSProperties = { background: '#e8f4e0', fontWeight: 700 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: 'Calibri, Arial, sans-serif', fontSize: 11 }}>

      {/* ══ SATIR 1: Parametreler | Genel Durum | Hakediş ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '290px 1fr', gap: 10, alignItems: 'start' }}>

        {/* SOL: Parametreler tablosu */}
        <table style={{ borderCollapse: 'collapse', width: '100%', height: '100%' }}>
          <tbody>
            <tr>
              <td rowSpan={6} style={{
                ...td({ background: '#375623', color: '#fff', fontWeight: 800, fontSize: 10.5, width: 22, padding: '8px 3px' }),
                writingMode: 'vertical-lr' as any, transform: 'rotate(180deg)',
                textAlign: 'center', letterSpacing: 1.5,
              }}>PARAMETRELER</td>
              <td style={td({ background: '#FFC000', fontWeight: 600, width: 100 })}>Firma</td>
              <td style={td({ background: '#FFC000', fontWeight: 700 })}>{data.firmaAdi || '—'}</td>
            </tr>
            <tr>
              <td style={td({ background: '#FFC000', fontWeight: 600 })}>Üst Lokasyon:</td>
              <td style={td({ background: '#FFC000', fontWeight: 700 })}>{data.ustLokTanim || 'Tümü'}</td>
            </tr>
            <tr>
              <td style={td({ background: '#FFC000', fontWeight: 600 })}>Alt Lokasyon</td>
              <td style={td({ background: '#FFC000', fontWeight: 700 })}>{data.altLokTanim || 'Tümü'}</td>
            </tr>
            <tr>
              <td style={td({ fontWeight: 600 })}>RaporTarihi:</td>
              <td style={td({ fontWeight: 700 })}>{data.raporTarihLabel || '—'}</td>
            </tr>
            <tr>
              <td style={td({ fontWeight: 600 })}>Rapor Gün Sayısı:</td>
              <td style={td()}>{data.gunSayisi > 0 ? data.gunSayisi : 'Otomatik'}</td>
            </tr>
            <tr>
              <td style={td({ fontWeight: 600 })}>Raporu Alan:</td>
              <td style={td()}>{data.raporuAlan || 'Yönetim'}</td>
            </tr>
          </tbody>
        </table>


        {/* SAĞ: Hakediş Faktörleri tablosu */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#375623', textAlign: 'center', background: '#FFC000', padding: '4px 6px', border: '1px solid #b8c8b8', borderBottom: 'none' }}>
            HAKEDİŞ FAKTÖRLERİ
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                {['GRUP TANIMI','HEDEF FREKANS','BİRİM FİYAT','TOPLAM HAKEDİŞ','KAYIP FREKANS','KAYIP HAKEDİŞ','GERÇEKLEŞEN HAKEDİŞ'].map(h => (
                  <th key={h} style={th({ fontSize: 9, padding: '4px 4px' })}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.grupMetrikleri.length > 0 ? data.grupMetrikleri.map((g, i) => (
                <tr key={i} style={stripe(i)}>
                  <td style={td({ fontWeight: 600, fontSize: 10 })}>{g.grup}</td>
                  <td style={td({ textAlign: 'center', fontSize: 10 })}>{g.hedef}</td>
                  <td style={td({ textAlign: 'center', fontSize: 10, color: '#888' })}>₺0,00</td>
                  <td style={td({ textAlign: 'center', fontSize: 10, color: '#888' })}>₺0,00</td>
                  <td style={td({ textAlign: 'center', fontSize: 10 })}>{g.kayip}</td>
                  <td style={td({ textAlign: 'center', fontSize: 10, color: '#888' })}>₺0,00</td>
                  <td style={td({ textAlign: 'center', fontSize: 10, background: '#E2EFDA', fontWeight: 700, color: '#375623' })}>₺0,00</td>
                </tr>
              )) : (
                <tr><td colSpan={7} style={td({ textAlign: 'center', color: '#aaa', padding: 10, fontSize: 10 })}>Grup tanımı yok</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ SATIR 2: Grup Frekans Göstergeleri | 3 istatistik kutusu ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>

        {/* SOL: Grup Frekans Göstergeleri */}
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#375623', marginBottom: 4, borderBottom: '2px solid #FFC000', paddingBottom: 3 }}>
            GRUP FREKANS GÖSTERGELERİ
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={th({ textAlign: 'left', minWidth: 110 })}>GRUP TANIMI</th>
                <th style={th()}>HEDEF FREKANS SAYISI</th>
                <th style={th()}>TAMAMLANMIŞ FREKANS SAYISI</th>
                <th style={th()}>ZAMANINDA GERÇEKLEŞEN İŞLEM ORANI</th>
                <th style={th()}>SAPMA FREKANS SAYISI</th>
                <th style={th()}>KAYIP FREKANS SAYISI</th>
                <th style={th()}>GENEL ORAN</th>
              </tr>
            </thead>
            <tbody>
              {data.grupMetrikleri.length > 0 ? data.grupMetrikleri.map((g, i) => (
                <tr key={i} style={stripe(i)}>
                  <td style={td({ fontWeight: 600, color: '#375623' })}>{g.grup}</td>
                  <td style={td({ textAlign: 'center' })}>{g.hedef}</td>
                  <td style={td({ textAlign: 'center', color: '#27AE60', fontWeight: 700 })}>{g.tamamlanan}</td>
                  <td style={td({ textAlign: 'center', fontWeight: 800, color: '#1F4E2C' })}>{g.basariOrani}</td>
                  <td style={td({ textAlign: 'center', color: '#C55A00' })}>{g.sapma}</td>
                  <td style={td({ textAlign: 'center', color: '#C0392B' })}>{g.kayip}</td>
                  <td style={td({ textAlign: 'center', fontWeight: 700 })}>{g.genelOran}</td>
                </tr>
              )) : (
                <tr><td colSpan={7} style={td({ textAlign: 'center', color: '#aaa', padding: 14 })}>Grup tanımlanmamış</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* SAĞ: 3 istatistik kutusu yan yana */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 185px)', gap: 8 }}>
          {[
            { title: 'FREKANS GÖSTERGELERİ', color: '#375623', rows: [
              ['Toplam Frekans Sayısı',      toplamHedef,               ''],
              ['Tamamlanmış Frekans Sayısı', data.toplamTamamlanan,     '#27AE60'],
              ['Gerçekleşen Frekans Sayısı', toplamGerceklesen,         ''],
              ['Sapma Frekans Sayısı',       data.toplamSapma,          '#C55A00'],
              ['Kayıp Frekans Sayısı',       data.toplamKayip,          '#C0392B'],
              ['Başarı Ortalaması',          `%${data.genelBasari}`,    '#1F4E2C'],
            ]},
            { title: 'FREKANS SAPMALARI', color: '#C55A00', rows: [
              ['Toplam Frekans Sayısı', toplamHedef,        ''],
              ['Sapma Frekans Sayısı',  data.toplamSapma,   '#C55A00'],
              ['Sapma Frekans Oranı',   `%${sapmaOrani}`,   '#C55A00'],
            ]},
            { title: 'KAYIP FREKANS GÖSTERGELERİ', color: '#C0392B', rows: [
              ['Toplam Frekans Sayısı', toplamHedef,         ''],
              ['Kayıp Frekans Sayısı',  data.toplamKayip,    '#C0392B'],
              ['Kayıp Frekans Oranı',   `%${kayipOrani}`,    '#C0392B'],
            ]},
          ].map((box, bi) => (
            <div key={bi} style={{ border: '1.5px solid #d0d8d0', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ background: box.color, color: '#fff', padding: '5px 8px', fontWeight: 800, fontSize: 10, textAlign: 'center', lineHeight: 1.3 }}>
                {box.title}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {box.rows.map(([label, value, color], i) => (
                    <tr key={i} style={stripe(i)}>
                      <td style={td({ fontSize: 10, color: '#375623' })}>{label as string}</td>
                      <td style={td({ textAlign: 'center', fontWeight: 700, fontSize: 10.5, color: (color as string) || '#1a1a1a', width: 48 })}>{String(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      {/* ══ SATIR 4: Frekans Sapmaları + Kayıp Frekans tabloları ══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#375623', marginBottom: 4, borderBottom: '2px solid #FFC000', paddingBottom: 3 }}>
            FREKANS SAPMALARI
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>{['GRUP TANIMI','TOPLAM FREKANS','SAPMA FREKANS','SAPMA ORANI'].map(h => <th key={h} style={th()}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.grupMetrikleri.length > 0 ? data.grupMetrikleri.map((g, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#FFF8E1' : '#fff' }}>
                  <td style={td({ fontWeight: 600 })}>{g.grup}</td>
                  <td style={td({ textAlign: 'center' })}>{g.hedef}</td>
                  <td style={td({ textAlign: 'center', color: '#C55A00', fontWeight: 700 })}>{g.sapma}</td>
                  <td style={td({ textAlign: 'center' })}>{g.hedef > 0 ? `%${Math.round(g.sapma/g.hedef*100)}` : '%0'}</td>
                </tr>
              )) : <tr><td colSpan={4} style={td({ textAlign: 'center', color: '#aaa', padding: 10 })}>Veri yok</td></tr>}
            </tbody>
          </table>
        </div>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#375623', marginBottom: 4, borderBottom: '2px solid #FFC000', paddingBottom: 3 }}>
            KAYIP FREKANS GÖSTERGESİ
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>{['GRUP TANIMI','TOPLAM FREKANS','KAYIP FREKANS','KAYIP ORANI'].map(h => <th key={h} style={th()}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.grupMetrikleri.length > 0 ? data.grupMetrikleri.map((g, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#FFF0F0' : '#fff' }}>
                  <td style={td({ fontWeight: 600 })}>{g.grup}</td>
                  <td style={td({ textAlign: 'center' })}>{g.hedef}</td>
                  <td style={td({ textAlign: 'center', color: '#C0392B', fontWeight: 700 })}>{g.kayip}</td>
                  <td style={td({ textAlign: 'center' })}>{g.hedef > 0 ? `%${Math.round(g.kayip/g.hedef*100)}` : '%0'}</td>
                </tr>
              )) : <tr><td colSpan={4} style={td({ textAlign: 'center', color: '#aaa', padding: 10 })}>Veri yok</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
// ─── TAMAMLANAN SEKMESİ ───────────────────────────────────────────
function TamamlananSheet({ data }: { data: RaporData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionHead title="TAMAMLANAN FREKANSLAR" />
        <Badge text={`${data.tamamlananGorevler.length} kayıt`} color={T.greenMid} bg={T.greenLight} />
      </div>
      <DataTable
        headers={['SN', 'PERSONEL', 'LOKASYON', 'GÖREV NO', 'GÖREV TANIMI', 'TARİH-SAAT', 'DURUM']}
        rows={data.tamamlananGorevler.map(r => [r.sn, r.personel, r.lokasyon, r.gorevNo, r.gorevTanimi, r.tarihSaat, 'TAMAMLANDI'])}
        accentCol={6} accentColor={T.greenMid}
      />
    </div>
  )
}

// ─── SAPMALAR SEKMESİ ─────────────────────────────────────────────
function SapmaSheet({ data }: { data: RaporData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionHead title="SAPMA FREKANSLAR" color={T.amber} />
        <Badge text={`${data.sapmaGorevler.length} kayıt`} color={T.amber} bg={T.amberLight} />
      </div>
      <DataTable
        headers={['SN', 'PERSONEL', 'LOKASYON', 'GÖREV NO', 'GÖREV TANIMI', 'TARİH-SAAT', 'SAPMA NEDENİ']}
        rows={data.sapmaGorevler.map(r => [r.sn, r.personel, r.lokasyon, r.gorevNo, r.gorevTanimi, r.tarihSaat, r.sapmaNedeni])}
        accentCol={6} accentColor={T.amber}
      />
    </div>
  )
}

// ─── KAYIP FREKANSLAR SEKMESİ ─────────────────────────────────────
function KayipFrekanslarSheet({ data }: { data: RaporData }) {
  const rows = data.kayipGorevler ?? []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SectionHead title="KAYIP FREKANSLAR" color={T.red} />
        <Badge text={`${rows.length} kayıt`} color={T.red} bg={T.redLight} />
      </div>
      <DataTable
        headers={['SN', 'LOKASYON', 'GÖREV NO', 'GÖREV TANIMI', 'TARİH-SAAT', 'DURUM']}
        rows={rows.map(r => [r.sn, r.lokasyon, r.gorevNo, r.gorevTanimi, r.tarihSaat, r.durum])}
        accentCol={5} accentColor={T.red}
      />
    </div>
  )
}

// ─── GRUPLAR SEKMESİ ──────────────────────────────────────────────
function GruplarSheet({ data }: { data: RaporData }) {
  const tT   = data.toplamGorev, tTam = data.toplamTamamlanan
  const tSap = data.toplamSapma, tKay = data.toplamKayip
  const tGunluk = data.grupMetrikleri.reduce((s, g) => s + g.gunlukFrekans, 0)
  const tHedef  = data.grupMetrikleri.reduce((s, g) => s + g.hedef, 0)
  const tBasari = tT > 0 ? Math.round(tTam / tT * 100) : 0
  const tGenel  = tT > 0 ? Math.round((tTam + tSap) / tT * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <SectionHead title="GRUP DETAY TABLOSU" />
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr>
              {['SN', 'GRUP', 'LOKASYON', 'GÖREV TANIMI', 'GÜNLÜK FREKANS', 'HEDEF FREKANS', 'TAMAMLANAN', 'SAPMA', 'KAYIP', 'BAŞARI ORANI\nTamamlanan/Hedef', 'GENEL ORAN\nTamamlanan+Sapma/Hedef'].map((h, i) => (
                <th key={i} style={{
                  padding: '8px 10px', background: T.green, color: T.white, fontWeight: 700,
                  fontSize: 11, textAlign: i < 4 ? 'left' : 'center', whiteSpace: 'pre-line',
                  lineHeight: 1.3, letterSpacing: '0.02em',
                }}>{h}</th>
              ))}
            </tr>
            {/* Toplamlar satırı */}
            <tr style={{ background: '#f0f9f0', borderBottom: `2px solid ${T.green}` }}>
              <td colSpan={4} style={{ padding: '7px 10px', fontWeight: 800, fontSize: 12.5, color: T.green }}>Toplamlar</td>
              <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700 }}>{tGunluk}</td>
              <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700 }}>{tHedef}</td>
              <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 800, color: T.greenMid }}>{tTam}</td>
              <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 800, color: T.amber }}>{tSap}</td>
              <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 800, color: T.red }}>{tKay}</td>
              <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 800, color: T.green }}>%{tBasari}</td>
              <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 800 }}>%{tGenel}</td>
            </tr>
          </thead>
          <tbody>
            {data.grupMetrikleri.length === 0 ? (
              <tr><td colSpan={11} style={{ padding: '24px', textAlign: 'center', color: T.textSoft }}>Lokasyon grubu tanımlanmamış.</td></tr>
            ) : data.grupMetrikleri.map((g, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? T.grayLight : T.white }}>
                <td style={{ padding: '7px 10px', textAlign: 'center', color: T.textSoft, width: 36 }}>{i + 1}</td>
                <td style={{ padding: '7px 10px', fontWeight: 700, color: T.textMid }}>{g.grup}</td>
                <td style={{ padding: '7px 10px', color: T.textSoft }}>{g.lokasyon}</td>
                <td style={{ padding: '7px 10px', color: T.textSoft }}>{g.gorevTanimi}</td>
                <td style={{ padding: '7px 10px', textAlign: 'center' }}>{g.gunlukFrekans}</td>
                <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 600 }}>{g.hedef}</td>
                <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700, color: T.greenMid }}>{g.tamamlanan}</td>
                <td style={{ padding: '7px 10px', textAlign: 'center', color: T.amber }}>{g.sapma}</td>
                <td style={{ padding: '7px 10px', textAlign: 'center', color: T.red }}>{g.kayip}</td>
                <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 800, color: T.green }}>{g.basariOrani}</td>
                <td style={{ padding: '7px 10px', textAlign: 'center', fontWeight: 700 }}>{g.genelOran}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── ANA BİLEŞEN ─────────────────────────────────────────────────
const TABS = ['Giriş', 'Tamamlanan Frekanslar', 'Sapmalar', 'Kayıp Frekanslar', 'Gruplar'] as const
type TabName = typeof TABS[number]

const TAB_COLORS: Record<TabName, { active: string; dot: string }> = {
  'Giriş':                  { active: T.green,    dot: T.green },
  'Tamamlanan Frekanslar':  { active: T.greenMid, dot: T.greenMid },
  'Sapmalar':               { active: T.amber,    dot: T.amber },
  'Kayıp Frekanslar':       { active: T.red,      dot: T.red },
  'Gruplar':                { active: T.blue,     dot: T.blue },
}

const spinning = { animation: 'spin 0.9s linear infinite' }

const inp: React.CSSProperties = {
  height: 34, padding: '0 10px', borderRadius: 8, border: `1px solid ${T.border}`,
  background: T.white, fontSize: 13, color: T.text, outline: 'none', width: '100%',
}

export default function TemplateReportsClient({ base, isSA, tenantFirmaId, projeId }: Props) {
  return (
    <div>
      <Topbar title="Rapor Özelleştir" base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: `${base}/dashboard/raporlar` }, { label: 'Rapor Özelleştir' }]} />
      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <GenelRaporKarti base={base} isSA={isSA} tenantFirmaId={tenantFirmaId} projeId={projeId} />
        <SpesifikRaporKarti base={base} isSA={isSA} tenantFirmaId={tenantFirmaId} projeId={projeId} />
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── GENEL RAPOR KARTI ────────────────────────────────────────────
function GenelRaporKarti({ base, isSA, tenantFirmaId, projeId }: Props) {
  const { toast } = useToast()
  const { firmaId: saFirmaId } = useFirma()
  const [lokasyonlar, setLokasyonlar] = useState<Lokasyon[]>([])
  const [ustLokasyonId, setUstLokasyonId] = useState('')
  const [altLokasyonId, setAltLokasyonId] = useState('')
  const [raporBaslangic, setRaporBaslangic] = useState('')
  const [raporBitis, setRaporBitis] = useState('')
  const [raporuAlan, setRaporuAlan] = useState('')
  const [activeTab, setActiveTab] = useState<TabName>('Giriş')
  const [raporData, setRaporData] = useState<RaporData | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingExcel, setLoadingExcel] = useState(false)
  const debounceRef = useRef<any>(null)

  const currentFirmaId = isSA ? (saFirmaId ?? '') : (tenantFirmaId ?? '')
  const ustLokasyonlar = useMemo(() => lokasyonlar.filter(l => !l.parent_id), [lokasyonlar])
  const altLokasyonlar = useMemo(() => lokasyonlar.filter(l => l.parent_id === ustLokasyonId), [lokasyonlar, ustLokasyonId])

  useEffect(() => {
    if (!currentFirmaId) { setLokasyonlar([]); return }
    const lokParams = new URLSearchParams({ firmaId: currentFirmaId })
    if (projeId) lokParams.set('projeId', projeId)
    fetch(`/api/lokasyonlar-list?${lokParams}`, { cache: 'no-store' })
      .then(r => r.json()).then(d => setLokasyonlar(Array.isArray(d) ? d : []))
      .catch(() => setLokasyonlar([]))
  }, [currentFirmaId])

  const fetchRaporData = useCallback(async () => {
    if (!currentFirmaId) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ firmaId: currentFirmaId })
      if (projeId) params.set('projeId', projeId)
      if (ustLokasyonId) params.set('ustLokasyonId', ustLokasyonId)
      if (altLokasyonId) params.set('altLokasyonId', altLokasyonId)
      if (raporBaslangic) params.set('raporBaslangic', raporBaslangic)
      if (raporBitis) params.set('raporBitis', raporBitis)
      if (raporuAlan) params.set('raporuAlan', raporuAlan)
      const res = await fetch(`/api/reports/genel-rapor?${params}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Rapor verisi alınamadı.')
      setRaporData(json)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setLoading(false)
  }, [currentFirmaId, projeId, ustLokasyonId, altLokasyonId, raporBaslangic, raporBitis, raporuAlan, toast])

  useEffect(() => {
    if (!currentFirmaId) return
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(fetchRaporData, 600)
    return () => clearTimeout(debounceRef.current)
  }, [currentFirmaId, ustLokasyonId, altLokasyonId, raporBaslangic, raporBitis, raporuAlan, fetchRaporData])

  const handleExcelExport = useCallback(async () => {
    if (!raporData || !currentFirmaId) return
    setLoadingExcel(true)
    try {
      const params = new URLSearchParams({ firmaId: currentFirmaId })
      if (projeId) params.set('projeId', projeId)
      if (ustLokasyonId) params.set('ustLokasyonId', ustLokasyonId)
      if (altLokasyonId) params.set('altLokasyonId', altLokasyonId)
      if (raporBaslangic) params.set('raporBaslangic', raporBaslangic)
      if (raporBitis) params.set('raporBitis', raporBitis)
      if (raporuAlan) params.set('raporuAlan', raporuAlan)
      const res = await fetch(`/api/reports/genel-rapor-excel?${params}`)
      if (!res.ok) throw new Error('Excel indirilemedi.')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `genel-rapor-${Date.now()}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setLoadingExcel(false)
  }, [raporData, currentFirmaId, projeId, ustLokasyonId, altLokasyonId, raporBaslangic, raporBitis, raporuAlan, toast])

  return (
    <div className="verde-card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.border}`, background: T.grayLight }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>QR-SYNC Frekans Raporu</div>
        <h2 style={{ fontSize: 17, fontWeight: 900, color: T.text, margin: 0 }}>Genel Rapor Şablonu</h2>
      </div>
      <div style={{ padding: '20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={fetchRaporData} disabled={loading || !currentFirmaId}
                style={{ height: 36, padding: '0 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.grayLight, color: T.textMid, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5 }}>
                <RefreshCw size={13} style={loading ? spinning : {}} />
                {loading ? 'Yükleniyor…' : 'Yenile'}
              </button>
              <button onClick={handleExcelExport} disabled={loadingExcel || !raporData}
                style={{ height: 36, padding: '0 14px', borderRadius: 8, border: `1px solid #d1fae5`, background: T.greenLight, color: T.green, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5 }}>
                <FileSpreadsheet size={13} />
                {loadingExcel ? 'İndiriliyor…' : 'Excel İndir'}
              </button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {[
              { label: 'Üst Lokasyon', node: (
                <select value={ustLokasyonId} onChange={e => { setUstLokasyonId(e.target.value); setAltLokasyonId('') }} style={inp}>
                  <option value="">Tümü</option>
                  {ustLokasyonlar.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                </select>
              )},
              { label: 'Alt Lokasyon', node: (
                <select value={altLokasyonId} onChange={e => setAltLokasyonId(e.target.value)} style={inp} disabled={!ustLokasyonId}>
                  <option value="">Tümü</option>
                  {altLokasyonlar.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                </select>
              )},
              { label: 'Başlangıç Tarihi', node: <input type="date" value={raporBaslangic} onChange={e => setRaporBaslangic(e.target.value)} style={inp} /> },
              { label: 'Bitiş Tarihi', node: <input type="date" value={raporBitis} onChange={e => setRaporBitis(e.target.value)} style={inp} /> },
              { label: 'Raporu Alan', node: <input value={raporuAlan} onChange={e => setRaporuAlan(e.target.value)} placeholder="Yönetim" style={inp} /> },
            ].map(({ label, node }) => (
              <label key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                {node}
              </label>
            ))}
          </div>
        </div>

        {!currentFirmaId ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: T.text, marginBottom: 8 }}>Firma Seçin</div>
            <div style={{ color: T.textSoft, fontSize: 13 }}>Raporu görüntülemek için üstten bir firma seçin.</div>
          </div>
        ) : (
          <div>
            {/* Sekmeler */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, background: T.grayLight, overflowX: 'auto' }}>
              {TABS.map(tab => {
                const isActive = activeTab === tab
                const tc = TAB_COLORS[tab]
                return (
                  <button key={tab} onClick={() => setActiveTab(tab)} style={{
                    padding: '12px 20px', fontWeight: isActive ? 800 : 500, fontSize: 13,
                    color: isActive ? tc.active : T.textSoft,
                    background: isActive ? T.white : 'transparent',
                    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                    borderBottom: isActive ? `2.5px solid ${tc.active}` : '2.5px solid transparent',
                    marginBottom: -1, transition: 'all 0.12s',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: tc.dot }} />}
                    {tab}
                  </button>
                )
              })}
              {loading && (
                <div style={{ marginLeft: 'auto', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 6, color: T.greenMid, fontSize: 11, fontWeight: 700 }}>
                  <RefreshCw size={11} style={spinning} /> Veri yükleniyor…
                </div>
              )}
            </div>

            {/* İçerik */}
            <div style={{ padding: '20px 24px', minHeight: 300, overflowX: 'auto', overflowY: 'visible' }}>
              {!raporData && loading && (
                <div style={{ textAlign: 'center', padding: 60, color: T.textSoft }}>
                  <RefreshCw size={24} style={{ ...spinning, margin: '0 auto 12px', display: 'block', color: T.greenMid }} />
                  <div style={{ fontWeight: 700 }}>Rapor verisi hazırlanıyor…</div>
                </div>
              )}
              {!raporData && !loading && (
                <div style={{ textAlign: 'center', padding: 60, color: T.textSoft }}>
                  <Activity size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
                  <div style={{ fontWeight: 700 }}>Filtre seçildiğinde rapor otomatik yüklenecek.</div>
                </div>
              )}
              {raporData && activeTab === 'Giriş'                 && <GirisSheet data={raporData} />}
              {raporData && activeTab === 'Tamamlanan Frekanslar' && <TamamlananSheet data={raporData} />}
              {raporData && activeTab === 'Sapmalar'              && <SapmaSheet data={raporData} />}
              {raporData && activeTab === 'Kayıp Frekanslar'      && <KayipFrekanslarSheet data={raporData} />}
              {raporData && activeTab === 'Gruplar'               && <GruplarSheet data={raporData} />}
            </div>
          </div>
        )}
      </div>
  )
}

// ─── SPESİFİK RAPOR KARTI ─────────────────────────────────────────
type SpesifikOzet = { toplam: number; tamamlanan: number; acik: number; islemde: number; iptal: number; basariOrani: number; ortSure: number | null }
type SpesifikLokRow = { lokasyon: string; toplam: number; tamamlanan: number; iptal: number; basari: string }
type SpesifikPersRow = { personel: string; toplam: number; tamamlanan: number; basari: string }
type SpesifikTamamlananRow = { sn: number; tanim: string; lokasyon: string; atanan: string; tamamlayan: string; olusturma: string; tamamlanma: string; sure: string }
type SpesifikAktifRow = { sn: number; tanim: string; lokasyon: string; atanan: string; durum: string; olusturma: string; sonIslem: string }
type SpesifikData = {
  meta: { firmaAdi: string; projeAdi: string; raporTarihLabel: string; raporuAlan: string }
  ozet: SpesifikOzet
  lokBazliRows: SpesifikLokRow[]
  persBazliRows: SpesifikPersRow[]
  tamamlananGorevler: SpesifikTamamlananRow[]
  aktifGorevler: SpesifikAktifRow[]
  lokasyonlar: { id: string; tanim: string }[]
  kullanicilar: { id: string; isim_soyisim: string }[]
}

const SP_TABS = ['Özet', 'Tamamlanan', 'Açık / İptal', 'Lokasyon', 'Personel'] as const
type SpTab = typeof SP_TABS[number]

function SpesifikRaporKarti({ base, isSA, tenantFirmaId, projeId }: Props) {
  const { toast } = useToast()
  const { firmaId: saFirmaId } = useFirma()
  const currentFirmaId = isSA ? (saFirmaId ?? '') : (tenantFirmaId ?? '')

  const [baslangic, setBaslangic] = useState('')
  const [bitis,     setBitis]     = useState('')
  const [raporuAlan, setRaporuAlan] = useState('')
  const [lokasyonId, setLokasyonId] = useState('')
  const [atananId,   setAtananId]   = useState('')
  const [durum,      setDurum]      = useState('TUMU')
  const [data,    setData]    = useState<SpesifikData | null>(null)
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<SpTab>('Özet')

  const fetchData = useCallback(async () => {
    if (!currentFirmaId) return
    setLoading(true)
    try {
      const p = new URLSearchParams({ firmaId: currentFirmaId })
      if (projeId)    p.set('projeId', projeId)
      if (baslangic)  p.set('baslangic', baslangic)
      if (bitis)      p.set('bitis', bitis)
      if (raporuAlan) p.set('raporuAlan', raporuAlan)
      if (lokasyonId) p.set('lokasyonId', lokasyonId)
      if (atananId)   p.set('atananId', atananId)
      if (durum !== 'TUMU') p.set('durum', durum)
      const res  = await fetch(`/api/reports/spesifik-rapor?${p}`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Veri alınamadı.')
      setData(json)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setLoading(false)
  }, [currentFirmaId, projeId, baslangic, bitis, raporuAlan, lokasyonId, atananId, durum, toast])

  const debRef = useRef<any>(null)
  useEffect(() => {
    if (!currentFirmaId) return
    clearTimeout(debRef.current)
    debRef.current = setTimeout(fetchData, 600)
    return () => clearTimeout(debRef.current)
  }, [fetchData, currentFirmaId])

  const DURUM_LABELS: Record<string, string> = {
    TUMU: 'Tümü', ACIK: 'Açık', ISLEMDE: 'İşlemde', TAMAMLANDI: 'Tamamlandı', IPTAL: 'İptal'
  }

  const tabStyle = (t: SpTab): React.CSSProperties => ({
    padding: '6px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer',
    background: activeTab === t ? T.green : 'transparent', color: activeTab === t ? T.white : T.textSoft,
    transition: 'all .15s',
  })

  const oz = data?.ozet

  return (
    <div className="verde-card" style={{ overflow: 'hidden' }}>
      {/* Kart başlığı */}
      <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.border}`, background: '#f0f9ff' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>QR-SYNC Spesifik Raporu</div>
        <h2 style={{ fontSize: 17, fontWeight: 900, color: T.text, margin: 0 }}>Spesifik Görevler Raporu</h2>
      </div>

      <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Filtreler */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10 }}>
          {[
            { label: 'Başlangıç', node: <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} style={inp} /> },
            { label: 'Bitiş',     node: <input type="date" value={bitis}     onChange={e => setBitis(e.target.value)}     style={inp} /> },
            { label: 'Lokasyon',  node: (
              <select value={lokasyonId} onChange={e => setLokasyonId(e.target.value)} style={inp}>
                <option value="">Tümü</option>
                {(data?.lokasyonlar ?? []).map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
              </select>
            )},
            { label: 'Atanan',    node: (
              <select value={atananId} onChange={e => setAtananId(e.target.value)} style={inp}>
                <option value="">Tümü</option>
                {(data?.kullanicilar ?? []).map(u => <option key={u.id} value={u.id}>{u.isim_soyisim}</option>)}
              </select>
            )},
            { label: 'Durum',     node: (
              <select value={durum} onChange={e => setDurum(e.target.value)} style={inp}>
                {Object.entries(DURUM_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )},
            { label: 'Raporu Alan', node: <input type="text" value={raporuAlan} onChange={e => setRaporuAlan(e.target.value)} placeholder="Ad Soyad" style={inp} /> },
          ].map(({ label, node }) => (
            <label key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.textSoft, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{label}</span>
              {node}
            </label>
          ))}
        </div>

        {/* Yenile butonu */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={fetchData} disabled={loading || !currentFirmaId}
            style={{ height: 34, padding: '0 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.grayLight, color: T.textMid, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5 }}>
            <RefreshCw size={13} style={loading ? spinning : {}} />
            {loading ? 'Yükleniyor…' : 'Yenile'}
          </button>
        </div>

        {/* KPI kartlar */}
        {oz && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', gap: 10 }}>
            <MetricCard label="Toplam Görev"  value={oz.toplam}      color={T.blue}     icon={Activity} />
            <MetricCard label="Tamamlanan"    value={oz.tamamlanan}  color={T.greenMid} icon={CheckCircle} sub={`%${oz.basariOrani} başarı`} />
            <MetricCard label="Açık"          value={oz.acik}        color={T.amber}    icon={AlertTriangle} />
            <MetricCard label="İşlemde"       value={oz.islemde}     color={T.blue}     icon={TrendingUp} />
            <MetricCard label="İptal"         value={oz.iptal}       color={T.red}      icon={TrendingDown} />
            {oz.ortSure != null && <MetricCard label="Ort. Sure" value={fmtSure(oz.ortSure)} color={T.gray} icon={Target} />}
          </div>
        )}

        {/* Sekme navigasyon */}
        {data && (
          <>
            <div style={{ display: 'flex', gap: 4, background: T.grayLight, borderRadius: 8, padding: 4, alignSelf: 'flex-start', flexWrap: 'wrap' }}>
              {SP_TABS.map(t => (
                <button key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>{t}</button>
              ))}
            </div>

            {/* Meta bilgi satırı */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: T.textSoft, padding: '8px 12px', background: T.grayLight, borderRadius: 8 }}>
              <span><strong>Firma:</strong> {data.meta.firmaAdi}</span>
              {data.meta.projeAdi && <span><strong>Proje:</strong> {data.meta.projeAdi}</span>}
              <span><strong>Dönem:</strong> {data.meta.raporTarihLabel}</span>
              {data.meta.raporuAlan && <span><strong>Raporu Alan:</strong> {data.meta.raporuAlan}</span>}
            </div>

            {/* ── ÖZET SEKMESİ ── */}
            {activeTab === 'Özet' && oz && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <SectionHead title="GENEL DURUM" color={T.blue} />
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 400 }}>
                    <tbody>
                      {[
                        { label: 'Toplam Görev', val: oz.toplam, color: T.text },
                        { label: 'Tamamlanan',   val: oz.tamamlanan, color: T.greenMid },
                        { label: 'Başarı Oranı', val: `%${oz.basariOrani}`, color: oz.basariOrani >= 80 ? T.green : oz.basariOrani >= 50 ? T.amber : T.red },
                        { label: 'Açık',         val: oz.acik, color: T.amber },
                        { label: 'İşlemde',      val: oz.islemde, color: T.blue },
                        { label: 'İptal',        val: oz.iptal, color: T.red },
                        ...(oz.ortSure != null ? [{ label: 'Ort. Tamamlanma Süresi', val: fmtSure(oz.ortSure), color: T.gray }] : []),
                      ].map(({ label, val, color }) => (
                        <tr key={label}>
                          <td style={{ padding: '6px 16px 6px 0', fontWeight: 600, color: T.textSoft, fontSize: 12.5, whiteSpace: 'nowrap' }}>{label}</td>
                          <td style={{ padding: '6px 0', fontWeight: 800, color, fontSize: 15 }}>{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAMAMLANAN SEKMESİ ── */}
            {activeTab === 'Tamamlanan' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <SectionHead title="TAMAMLANAN GÖREVLER" color={T.greenMid} />
                  <Badge text={`${data.tamamlananGorevler.length} kayıt`} color={T.greenMid} bg={T.greenLight} />
                </div>
                <DataTable
                  headers={['SN', 'GÖREV', 'LOKASYON', 'ATANAN', 'TAMAMLAYAN', 'OLUŞTURMA', 'TAMAMLANMA', 'SÜRE']}
                  rows={data.tamamlananGorevler.map(r => [r.sn, r.tanim, r.lokasyon, r.atanan, r.tamamlayan, r.olusturma, r.tamamlanma, r.sure])}
                  accentCol={7} accentColor={T.greenMid}
                />
              </div>
            )}

            {/* ── AÇIK / İPTAL SEKMESİ ── */}
            {activeTab === 'Açık / İptal' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <SectionHead title="AÇIK / İPTAL GÖREVLER" color={T.amber} />
                  <Badge text={`${data.aktifGorevler.length} kayıt`} color={T.amber} bg={T.amberLight} />
                </div>
                <DataTable
                  headers={['SN', 'GÖREV', 'LOKASYON', 'ATANAN', 'DURUM', 'OLUŞTURMA', 'SON İŞLEM']}
                  rows={data.aktifGorevler.map(r => [r.sn, r.tanim, r.lokasyon, r.atanan, r.durum, r.olusturma, r.sonIslem])}
                  accentCol={4} accentColor={T.amber}
                />
              </div>
            )}

            {/* ── LOKASYON SEKMESİ ── */}
            {activeTab === 'Lokasyon' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <SectionHead title="LOKASYON BAZLI DAĞILIM" color={T.blue} />
                <DataTable
                  headers={['LOKASYON', 'TOPLAM', 'TAMAMLANAN', 'İPTAL', 'BAŞARI']}
                  rows={data.lokBazliRows.map(r => [r.lokasyon, r.toplam, r.tamamlanan, r.iptal, r.basari])}
                  accentCol={4} accentColor={T.green}
                />
              </div>
            )}

            {/* ── PERSONEL SEKMESİ ── */}
            {activeTab === 'Personel' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <SectionHead title="PERSONEL BAZLI DAĞILIM" color={T.greenMid} />
                <DataTable
                  headers={['PERSONEL', 'TOPLAM', 'TAMAMLANAN', 'BAŞARI']}
                  rows={data.persBazliRows.map(r => [r.personel, r.toplam, r.tamamlanan, r.basari])}
                  accentCol={3} accentColor={T.green}
                />
              </div>
            )}
          </>
        )}

        {!data && !loading && (
          <div style={{ textAlign: 'center', padding: 48, color: T.textSoft }}>
            <Activity size={28} style={{ margin: '0 auto 10px', display: 'block', opacity: 0.3 }} />
            <div style={{ fontWeight: 700 }}>Filtre seçildiğinde rapor otomatik yüklenecek.</div>
          </div>
        )}
      </div>
    </div>
  )
}

function fmtSure(sn: number | null | undefined) {
  if (!sn) return '—'
  const h = Math.floor(sn / 3600), m = Math.floor((sn % 3600) / 60), s = sn % 60
  if (h > 0) return `${h}s ${m}dk`
  if (m > 0) return `${m}dk ${s}sn`
  return `${s}sn`
}
