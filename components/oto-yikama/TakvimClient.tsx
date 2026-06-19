'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useToast } from '@/components/ui/ToastProvider'
import { aralikPlanTahmin, type TahminArac } from '@/lib/oto-yikama/yikamaPlanTahmin'
import type { TakvimGercekKayit, TakvimResponse } from '@/app/api/oto-yikama/takvim/route'

type Durum = 'HAZIR' | 'ACIK' | 'ISLEMDE' | 'TAMAMLANDI' | 'IPTAL' | 'YAPILAMADI'

const DURUM_BG: Record<Durum, string> = {
  HAZIR:      '#ffffff',
  ACIK:       '#fef3c7',
  ISLEMDE:    '#dbeafe',
  TAMAMLANDI: '#dcfce7',
  IPTAL:      '#fee2e2',
  YAPILAMADI: '#fde2e2',
}
const DURUM_FG: Record<Durum, string> = {
  HAZIR:      '#475569',
  ACIK:       '#b45309',
  ISLEMDE:    '#1d4ed8',
  TAMAMLANDI: '#15803d',
  IPTAL:      '#b91c1c',
  YAPILAMADI: '#991b1b',
}
const DURUM_BORDER: Record<Durum, string> = {
  HAZIR:      '#cbd5e1',
  ACIK:       '#fbbf24',
  ISLEMDE:    '#60a5fa',
  TAMAMLANDI: '#4ade80',
  IPTAL:      '#f87171',
  YAPILAMADI: '#dc2626',
}
const DURUM_LABEL: Record<Durum, string> = {
  HAZIR: 'Planlı',
  ACIK: 'Açık',
  ISLEMDE: 'İşlemde',
  TAMAMLANDI: 'Tamamlandı',
  IPTAL: 'İptal',
  YAPILAMADI: 'Yapılamadı',
}
// Hücre arka plan rengi için kritiklik sırası (büyük = baskın)
const DURUM_PRIO: Record<Durum, number> = {
  IPTAL: 6,
  YAPILAMADI: 5,
  ISLEMDE: 4,
  ACIK: 3,
  TAMAMLANDI: 2,
  HAZIR: 1,
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  grayLight: '#f8fafc',
}

// Oto Yıkama operasyonel başlangıç. Bu tarihten önceki günler tıklanamaz.
const CUTOFF_ISO = '2026-06-22'

const GUN_KISA = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const AY_AD = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

// ── Tarih helper'ları (UTC tabanlı — TZ kayması olmasın) ──
function isoToDate(iso: string): Date { return new Date(iso + 'T12:00:00Z') }
function dateToIso(d: Date): string { return d.toISOString().slice(0, 10) }
function isoDow(d: Date): number { const g = d.getUTCDay(); return g === 0 ? 7 : g }
function addDays(d: Date, n: number): Date { return new Date(d.getTime() + n * 86400000) }
function bugunIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}
function haftaBasi(d: Date): Date { return addDays(d, -(isoDow(d) - 1)) }

// ISO 8601 hafta numarası (Pzt başlangıç, 4 Ocak'ı içeren hafta 1. haftadır)
function isoHaftaNo(d: Date): { yil: number; hafta: number } {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - dow + 3)
  const yil = t.getUTCFullYear()
  const ocak4 = new Date(Date.UTC(yil, 0, 4))
  const hafta = 1 + Math.round(
    (((t.getTime() - ocak4.getTime()) / 86400000) - 3 + ((ocak4.getUTCDay() + 6) % 7)) / 7,
  )
  return { yil, hafta }
}

function yilinKacinciGunu(d: Date): number {
  const ilk = new Date(Date.UTC(d.getUTCFullYear(), 0, 1, 12, 0, 0))
  return Math.floor((d.getTime() - ilk.getTime()) / 86400000) + 1
}

type PlakaKart = {
  tarih: string
  arac_id: string | null
  plaka: string
  durum: Durum
  gercek: TakvimGercekKayit | null
  departman: string | null
  lokasyon_id: string | null
}

// ── Ana bileşen ─────────────────────────────────────────────
export default function TakvimClient({ firmaId }: { firmaId: string }) {
  const { toast } = useToast()

  // Sabit yıl — yıl atlama yok. Cut-off yılı veya bugünün yılı (hangisi büyükse).
  const yil = useMemo(() => {
    const cutoffYil = isoToDate(CUTOFF_ISO).getUTCFullYear()
    const bugunYil = isoToDate(bugunIso()).getUTCFullYear()
    return Math.max(cutoffYil, bugunYil)
  }, [])

  const [data, setData] = useState<TakvimResponse | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [seciliGun, setSeciliGun] = useState<string | null>(null)

  async function yukle() {
    setYukleniyor(true)
    try {
      const qp = new URLSearchParams({
        firma_id: firmaId,
        baslangic: `${yil}-01-01`,
        bitis: `${yil}-12-31`,
      })
      const res = await fetch(`/api/oto-yikama/takvim?${qp}`, { cache: 'no-store' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error)
      setData(j as TakvimResponse)
    } catch (e: any) {
      toast({ type: 'error', title: 'Takvim yüklenemedi', message: e.message })
    } finally {
      setYukleniyor(false)
    }
  }
  useEffect(() => { yukle() }, [firmaId, yil])

  // Gercek + Tahmin birleştir: tarih → PlakaKart[]
  const gunKartlari: Map<string, PlakaKart[]> = useMemo(() => {
    const harita = new Map<string, PlakaKart[]>()
    if (!data) return harita

    const gercekKey = (k: TakvimGercekKayit) => `${k.hedef_tarih}|${k.arac_id ?? `__noarac_${k.gorev_id}`}`
    const gercekSet = new Set<string>()

    for (const k of data.gercek) {
      if (!k.durum) continue
      if (k.hedef_tarih < CUTOFF_ISO) continue
      const dep = k.arac_id ? (data.araclar.find(a => a.id === k.arac_id)?.departman ?? null) : null
      const kart: PlakaKart = {
        tarih: k.hedef_tarih,
        arac_id: k.arac_id,
        plaka: k.plaka,
        durum: k.durum as Durum,
        gercek: k,
        departman: dep,
        lokasyon_id: k.lokasyon_id,
      }
      const liste = harita.get(k.hedef_tarih) ?? []
      liste.push(kart)
      harita.set(k.hedef_tarih, liste)
      gercekSet.add(gercekKey(k))
    }

    const tahminAraclar: TahminArac[] = data.araclar as TahminArac[]
    const tahminler = aralikPlanTahmin(tahminAraclar, `${yil}-01-01`, `${yil}-12-31`)
    for (const t of tahminler) {
      if (t.tarih < CUTOFF_ISO) continue
      const key = `${t.tarih}|${t.arac_id}`
      if (gercekSet.has(key)) continue
      const kart: PlakaKart = {
        tarih: t.tarih,
        arac_id: t.arac_id,
        plaka: t.plaka,
        durum: 'HAZIR',
        gercek: null,
        departman: t.departman,
        lokasyon_id: t.lokasyon_id,
      }
      const liste = harita.get(t.tarih) ?? []
      liste.push(kart)
      harita.set(t.tarih, liste)
    }

    for (const liste of harita.values()) {
      liste.sort((a, b) => {
        const p = DURUM_PRIO[b.durum] - DURUM_PRIO[a.durum]
        if (p !== 0) return p
        return a.plaka.localeCompare(b.plaka, 'tr')
      })
    }
    return harita
  }, [data, yil])

  return (
    <div>
      {/* Üst bar — yıl + lejant */}
      <div className="verde-card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>
          {yil} Yıkama Takvimi
        </div>
        <div style={{ fontSize: 12, color: T.textSoft }}>
          Bir güne tıklayarak yıkama detaylarını görüntüleyin
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 11, color: T.textSoft, alignItems: 'center', flexWrap: 'wrap' }}>
          {(Object.keys(DURUM_LABEL) as Durum[]).map(d => (
            <span key={d} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{
                width: 14, height: 14, borderRadius: 4,
                background: DURUM_BG[d], border: `1px solid ${DURUM_BORDER[d]}`,
              }} />
              {DURUM_LABEL[d]}
            </span>
          ))}
        </div>
      </div>

      {/* 4 ay × 3 satır grid */}
      <div style={{ position: 'relative' }}>
        {yukleniyor && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.6)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, color: T.textSoft, fontSize: 13, fontWeight: 600 }}>
            Yükleniyor…
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 10 }}>
          {Array.from({ length: 12 }, (_, m) => (
            <AyBlock key={m} yil={yil} ay={m} harita={gunKartlari} onGunTik={iso => setSeciliGun(iso)} />
          ))}
        </div>
      </div>

      {seciliGun && (
        <GunPopup
          tarih={seciliGun}
          kartlar={gunKartlari.get(seciliGun) ?? []}
          lokAd={data?.lokasyonAdMap ?? {}}
          onClose={() => setSeciliGun(null)}
        />
      )}
    </div>
  )
}

// ── Ay bloğu ───────────────────────────────────────────────
function AyBlock({ yil, ay, harita, onGunTik }: {
  yil: number; ay: number;
  harita: Map<string, PlakaKart[]>;
  onGunTik: (iso: string) => void;
}) {
  const today = bugunIso()
  const ilk = new Date(Date.UTC(yil, ay, 1, 12, 0, 0))
  const baslangic = haftaBasi(ilk)
  const gunler = Array.from({ length: 42 }, (_, i) => addDays(baslangic, i))

  return (
    <div style={{
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      padding: 8,
      background: '#fff',
      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 6, letterSpacing: 0.2 }}>
        {AY_AD[ay].toLocaleUpperCase('tr')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
        {GUN_KISA.map(g => (
          <div key={g} style={{ fontSize: 9, color: T.textSoft, textAlign: 'center', fontWeight: 700, padding: '1px 0' }}>{g}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {gunler.map(g => {
          const iso = dateToIso(g)
          const kartlar = harita.get(iso) ?? []
          const inMonth = g.getUTCMonth() === ay
          const isBugun = iso === today
          const onceCut = iso < CUTOFF_ISO

          // Hücre rengi: en kritik durumun rengi (varsa)
          let bg = '#fff'
          let fg = T.text
          let bd = T.border
          if (kartlar.length > 0) {
            const enKritik = kartlar.reduce<Durum>((acc, k) =>
              DURUM_PRIO[k.durum] > DURUM_PRIO[acc] ? k.durum : acc, kartlar[0].durum)
            bg = DURUM_BG[enKritik]
            fg = DURUM_FG[enKritik]
            bd = DURUM_BORDER[enKritik]
          }
          if (!inMonth) { bg = '#fafbfc'; fg = '#cbd5e1'; bd = '#eef2f6' }
          if (onceCut) { bg = '#f1f5f9'; fg = '#cbd5e1'; bd = '#e5e7eb' }

          const tiklanabilir = inMonth && !onceCut

          return (
            <button key={iso}
              onClick={() => tiklanabilir && onGunTik(iso)}
              disabled={!tiklanabilir}
              title={
                onceCut ? 'Sistem öncesi — gösterim yok'
                : !inMonth ? ''
                : kartlar.length > 0 ? `${kartlar.length} araç` : 'Plan yok'
              }
              style={{
                aspectRatio: '1',
                background: bg,
                color: fg,
                border: `1px solid ${isBugun ? T.blue : bd}`,
                borderRadius: 4,
                padding: 0,
                cursor: tiklanabilir ? 'pointer' : 'not-allowed',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 0,
                fontFamily: 'inherit',
                position: 'relative',
                overflow: 'hidden',
                minHeight: 26,
              }}>
              <span style={{
                fontSize: 10,
                fontWeight: isBugun ? 800 : 600,
                color: isBugun && tiklanabilir ? T.blue : fg,
                lineHeight: 1,
              }}>{g.getUTCDate()}</span>
              {kartlar.length > 0 && inMonth && !onceCut && (
                <span style={{
                  fontSize: 8, fontWeight: 700, color: fg,
                  background: 'rgba(255,255,255,0.7)',
                  padding: '0 3px', borderRadius: 3, lineHeight: 1.3,
                  marginTop: 1,
                }}>{kartlar.length}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Gün Popup ──────────────────────────────────────────────
function GunPopup({ tarih, kartlar, lokAd, onClose }: {
  tarih: string;
  kartlar: PlakaKart[];
  lokAd: Record<string, string>;
  onClose: () => void;
}) {
  const d = isoToDate(tarih)
  const dowAdi = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'][isoDow(d) - 1]
  const tarihEt = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d)
  const isoHafta = isoHaftaNo(d)
  const gunNo = yilinKacinciGunu(d)
  const isBugun = tarih === bugunIso()

  const sayilar: Record<Durum, number> = { HAZIR: 0, ACIK: 0, ISLEMDE: 0, TAMAMLANDI: 0, IPTAL: 0, YAPILAMADI: 0 }
  for (const k of kartlar) sayilar[k.durum]++

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 80,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} className="verde-card"
        style={{ width: 'min(720px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'flex-start', gap: 14,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 10,
            background: isBugun ? T.blueLight : T.grayLight,
            border: `1px solid ${isBugun ? T.blue : T.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', flexShrink: 0,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: isBugun ? T.blue : T.textSoft, textTransform: 'uppercase' }}>
              {dowAdi.slice(0, 3)}
            </span>
            <span style={{ fontSize: 22, fontWeight: 800, color: isBugun ? T.blue : T.text, lineHeight: 1 }}>
              {d.getUTCDate()}
            </span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>
              {tarihEt}
              {isBugun && <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 999, background: T.blueLight, color: T.blue, fontSize: 11, fontWeight: 700, verticalAlign: 'middle' }}>BUGÜN</span>}
            </div>
            <div style={{ fontSize: 13, color: T.textSoft, marginTop: 2 }}>{dowAdi}</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: T.textSoft, flexWrap: 'wrap' }}>
              <span><strong style={{ color: T.text }}>{isoHafta.hafta}.</strong> hafta ({isoHafta.yil})</span>
              <span>Yılın <strong style={{ color: T.text }}>{gunNo}.</strong> günü</span>
              <span>Toplam <strong style={{ color: T.text }}>{kartlar.length}</strong> araç</span>
            </div>
          </div>
          <button onClick={onClose} style={{
            padding: 6, background: 'transparent', border: 'none', cursor: 'pointer', color: T.textSoft,
          }}><X size={20} /></button>
        </div>

        {/* Durum dağılımı */}
        {kartlar.length > 0 && (
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(Object.keys(DURUM_LABEL) as Durum[]).map(durum => (
              sayilar[durum] > 0 && (
                <div key={durum} style={{
                  padding: '4px 10px', borderRadius: 6,
                  background: DURUM_BG[durum], color: DURUM_FG[durum],
                  border: `1px solid ${DURUM_BORDER[durum]}`,
                  fontSize: 12, fontWeight: 700,
                }}>{DURUM_LABEL[durum]}: {sayilar[durum]}</div>
              )
            ))}
          </div>
        )}

        {/* Plaka grid */}
        <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
          {kartlar.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 36, color: T.textSoft, fontSize: 13 }}>
              Bu gün için planlanmış yıkama yok.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {kartlar.map((k, i) => (
                <div key={`${k.arac_id ?? 'x'}-${i}`}
                  style={{
                    padding: '8px 10px', borderRadius: 7,
                    border: `1px solid ${DURUM_BORDER[k.durum]}`,
                    background: DURUM_BG[k.durum],
                    display: 'flex', flexDirection: 'column', gap: 3,
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{
                      fontFamily: 'monospace', fontWeight: 800, fontSize: 15,
                      color: DURUM_FG[k.durum],
                    }}>{k.plaka}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: DURUM_FG[k.durum] }}>{DURUM_LABEL[k.durum]}</span>
                  </div>
                  <div style={{ fontSize: 11, color: T.textSoft, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>{k.departman ?? '—'}</span>
                    {k.lokasyon_id && <><span>·</span><span>{lokAd[k.lokasyon_id] ?? '—'}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
