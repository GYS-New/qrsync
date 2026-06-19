'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react'
import { useToast } from '@/components/ui/ToastProvider'
import { aralikPlanTahmin, type TahminArac } from '@/lib/oto-yikama/yikamaPlanTahmin'
import type { TakvimGercekKayit, TakvimResponse } from '@/app/api/oto-yikama/takvim/route'

type Sekme = 'gunluk' | 'haftalik' | 'aylik' | 'yillik'

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
  HAZIR: 'Hazır (Planlı)',
  ACIK: 'Açık',
  ISLEMDE: 'İşlemde',
  TAMAMLANDI: 'Tamamlandı',
  IPTAL: 'İptal',
  YAPILAMADI: 'Yapılamadı',
}
// Heatmap önceliği (büyük = daha kritik) — yıllık görünümde hücre rengi için
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

const GUN_KISA = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const AY_AD = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

// ── Tarih helper'ları (UTC tabanlı — TZ kayması olmasın) ───────────────────
function isoToDate(iso: string): Date { return new Date(iso + 'T12:00:00Z') }
function dateToIso(d: Date): string { return d.toISOString().slice(0, 10) }
function isoDow(d: Date): number { const g = d.getUTCDay(); return g === 0 ? 7 : g }
function addDays(d: Date, n: number): Date { return new Date(d.getTime() + n * 86400000) }
function bugunIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}
function ayBasi(d: Date): Date { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12, 0, 0)) }
function ayBitisi(d: Date): Date { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12, 0, 0)) }
function haftaBasi(d: Date): Date {
  const dow = isoDow(d)
  return addDays(d, -(dow - 1))
}

// Sekmeye göre aralık [baslangic, bitis]
function aralikHesapla(sekme: Sekme, anchor: Date): { baslangic: Date; bitis: Date } {
  if (sekme === 'gunluk') return { baslangic: anchor, bitis: anchor }
  if (sekme === 'haftalik') {
    const b = haftaBasi(anchor)
    return { baslangic: b, bitis: addDays(b, 6) }
  }
  if (sekme === 'aylik') {
    // Grid ilk Pzt → son Paz (max 6 hafta)
    const ilk = ayBasi(anchor)
    const son = ayBitisi(anchor)
    return { baslangic: haftaBasi(ilk), bitis: addDays(haftaBasi(son), 6) }
  }
  // yillik
  const y = anchor.getUTCFullYear()
  return {
    baslangic: new Date(Date.UTC(y, 0, 1, 12, 0, 0)),
    bitis: new Date(Date.UTC(y, 11, 31, 12, 0, 0)),
  }
}

// ── Plaka kart birleşmiş tipi ─────────────────────────────────────────────
type PlakaKart = {
  tarih: string
  arac_id: string | null
  plaka: string
  durum: Durum
  // Eğer gerçek bir görev varsa onun referansı:
  gercek: TakvimGercekKayit | null
  departman: string | null
  lokasyon_id: string | null
}

export default function TakvimClient({ firmaId }: { firmaId: string }) {
  const { toast } = useToast()
  const [sekme, setSekme] = useState<Sekme>('haftalik')
  const [anchor, setAnchor] = useState<Date>(() => isoToDate(bugunIso()))
  const [data, setData] = useState<TakvimResponse | null>(null)
  const [yukleniyor, setYukleniyor] = useState(true)
  const [detayKart, setDetayKart] = useState<PlakaKart | null>(null)

  const { baslangic, bitis } = useMemo(() => aralikHesapla(sekme, anchor), [sekme, anchor])

  async function yukle() {
    setYukleniyor(true)
    try {
      const qp = new URLSearchParams({
        firma_id: firmaId,
        baslangic: dateToIso(baslangic),
        bitis: dateToIso(bitis),
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

  useEffect(() => { yukle() }, [firmaId, sekme, dateToIso(baslangic), dateToIso(bitis)])

  // Gercek + Tahmin birleştir: tarih → PlakaKart[]
  const gunKartlari: Map<string, PlakaKart[]> = useMemo(() => {
    const harita = new Map<string, PlakaKart[]>()
    if (!data) return harita

    const gercekKey = (k: TakvimGercekKayit) => `${k.hedef_tarih}|${k.arac_id ?? `__noarac_${k.gorev_id}`}`
    const gercekSet = new Set<string>()

    // 1) Gerçek görevler
    for (const k of data.gercek) {
      if (!k.durum) continue
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

    // 2) Tahmini görevler (aralıktaki tüm günler için)
    const tahminAraclar: TahminArac[] = data.araclar as TahminArac[]
    const tahminler = aralikPlanTahmin(tahminAraclar, dateToIso(baslangic), dateToIso(bitis))
    for (const t of tahminler) {
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

    // 3) Sıra: durum prio desc, sonra plaka alfabetik
    for (const liste of harita.values()) {
      liste.sort((a, b) => {
        const p = DURUM_PRIO[b.durum] - DURUM_PRIO[a.durum]
        if (p !== 0) return p
        return a.plaka.localeCompare(b.plaka, 'tr')
      })
    }
    return harita
  }, [data, baslangic, bitis])

  // ── Nav ─────────────────────────────────────────────────────
  function navigasyon(yon: -1 | 0 | 1) {
    if (yon === 0) { setAnchor(isoToDate(bugunIso())); return }
    if (sekme === 'gunluk') setAnchor(d => addDays(d, yon))
    else if (sekme === 'haftalik') setAnchor(d => addDays(d, yon * 7))
    else if (sekme === 'aylik') setAnchor(d => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + yon, 15, 12, 0, 0)))
    else setAnchor(d => new Date(Date.UTC(d.getUTCFullYear() + yon, d.getUTCMonth(), 15, 12, 0, 0)))
  }

  function anchorEtiketi(): string {
    if (sekme === 'gunluk') {
      return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' }).format(anchor)
    }
    if (sekme === 'haftalik') {
      const b = haftaBasi(anchor)
      const s = addDays(b, 6)
      const ay1 = b.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
      const ay2 = s.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
      return `${ay1} — ${ay2}`
    }
    if (sekme === 'aylik') return `${AY_AD[anchor.getUTCMonth()]} ${anchor.getUTCFullYear()}`
    return String(anchor.getUTCFullYear())
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <div>
      {/* Sekme + nav */}
      <div className="verde-card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: T.grayLight, borderRadius: 8, padding: 3 }}>
          {(['gunluk', 'haftalik', 'aylik', 'yillik'] as Sekme[]).map(s => (
            <button key={s} onClick={() => setSekme(s)}
              style={{
                padding: '6px 14px', borderRadius: 6, border: 'none',
                background: sekme === s ? '#fff' : 'transparent',
                color: sekme === s ? T.text : T.textSoft,
                cursor: 'pointer', fontSize: 13, fontWeight: 700,
                boxShadow: sekme === s ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
              }}>
              {s === 'gunluk' ? 'Günlük' : s === 'haftalik' ? 'Haftalık' : s === 'aylik' ? 'Aylık' : 'Yıllık'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginLeft: 8 }}>
          <button onClick={() => navigasyon(-1)} title="Önceki"
            style={navBtnStyle}><ChevronLeft size={16} /></button>
          <button onClick={() => navigasyon(0)} title="Bugün"
            style={{ ...navBtnStyle, fontWeight: 700, padding: '6px 12px', fontSize: 12 }}>Bugün</button>
          <button onClick={() => navigasyon(1)} title="Sonraki"
            style={navBtnStyle}><ChevronRight size={16} /></button>
        </div>

        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginLeft: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={15} color={T.textSoft} />
          {anchorEtiketi()}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: 11, color: T.textSoft, alignItems: 'center' }}>
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

      {/* İçerik */}
      <div style={{ position: 'relative' }}>
        {yukleniyor && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.6)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12, color: T.textSoft, fontSize: 13, fontWeight: 600 }}>
            Yükleniyor…
          </div>
        )}

        {sekme === 'gunluk' && <GunlukView tarih={anchor} kartlar={gunKartlari.get(dateToIso(anchor)) ?? []} setDetay={setDetayKart} lokAd={data?.lokasyonAdMap ?? {}} />}
        {sekme === 'haftalik' && <HaftalikView baslangic={baslangic} harita={gunKartlari} setDetay={setDetayKart} />}
        {sekme === 'aylik' && <AylikView anchor={anchor} baslangic={baslangic} harita={gunKartlari} setDetay={setDetayKart} setAnchor={setAnchor} setSekme={setSekme} />}
        {sekme === 'yillik' && <YillikView yil={anchor.getUTCFullYear()} harita={gunKartlari} setAnchor={setAnchor} setSekme={setSekme} />}
      </div>

      {detayKart && (
        <DetayModal kart={detayKart} onClose={() => setDetayKart(null)}
          lokAd={data?.lokasyonAdMap ?? {}} kullaniciAd={data?.kullaniciAdMap ?? {}} />
      )}
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`,
  background: '#fff', cursor: 'pointer', color: T.text,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

// ── Chip bileşeni ────────────────────────────────────────────
function Chip({ kart, onClick, size = 'sm' }: { kart: PlakaKart; onClick: () => void; size?: 'xs' | 'sm' | 'md' }) {
  const padX = size === 'xs' ? 6 : size === 'sm' ? 8 : 12
  const padY = size === 'xs' ? 1 : size === 'sm' ? 2 : 4
  const fs = size === 'xs' ? 10 : size === 'sm' ? 11 : 13
  return (
    <button onClick={onClick} title={`${kart.plaka} — ${DURUM_LABEL[kart.durum]}${kart.departman ? ' — ' + kart.departman : ''}`}
      style={{
        padding: `${padY}px ${padX}px`,
        borderRadius: 4,
        border: `1px solid ${DURUM_BORDER[kart.durum]}`,
        background: DURUM_BG[kart.durum],
        color: DURUM_FG[kart.durum],
        fontFamily: 'monospace',
        fontWeight: 700,
        fontSize: fs,
        cursor: 'pointer',
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}>
      {kart.plaka}
    </button>
  )
}

// ── GünLük ──────────────────────────────────────────────────
function GunlukView({ tarih, kartlar, setDetay, lokAd }: { tarih: Date; kartlar: PlakaKart[]; setDetay: (k: PlakaKart) => void; lokAd: Record<string, string> }) {
  const sayilar = sayar(kartlar)
  const bugun = dateToIso(tarih) === bugunIso()
  return (
    <div className="verde-card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>
          {new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).format(tarih)}
        </div>
        <div style={{ fontSize: 13, color: T.textSoft }}>{GUN_KISA[isoDow(tarih) - 1]}</div>
        {bugun && <span style={{ padding: '2px 8px', borderRadius: 999, background: T.blueLight, color: T.blue, fontSize: 11, fontWeight: 700 }}>BUGÜN</span>}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: T.textSoft }}>Toplam: <strong style={{ color: T.text }}>{kartlar.length}</strong></div>
      </div>

      {/* Özet sayıları */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {(Object.keys(DURUM_LABEL) as Durum[]).map(d => (
          sayilar[d] > 0 && (
            <div key={d} style={{
              padding: '4px 10px', borderRadius: 6,
              background: DURUM_BG[d], color: DURUM_FG[d], border: `1px solid ${DURUM_BORDER[d]}`,
              fontSize: 12, fontWeight: 700,
            }}>{DURUM_LABEL[d]}: {sayilar[d]}</div>
          )
        ))}
      </div>

      {kartlar.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: T.textSoft, fontSize: 13 }}>
          Bu gün için planlanmış yıkama yok.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {kartlar.map((k, i) => (
            <button key={`${k.arac_id ?? 'x'}-${i}`} onClick={() => setDetay(k)}
              style={{
                padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${DURUM_BORDER[k.durum]}`,
                background: DURUM_BG[k.durum],
                cursor: 'pointer', textAlign: 'left',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 16, color: DURUM_FG[k.durum] }}>{k.plaka}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: DURUM_FG[k.durum] }}>{DURUM_LABEL[k.durum]}</span>
              </div>
              <div style={{ fontSize: 11, color: T.textSoft }}>
                {k.departman ?? '—'}
                {k.lokasyon_id ? <> · {lokAd[k.lokasyon_id] ?? '—'}</> : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Haftalık ────────────────────────────────────────────────
function HaftalikView({ baslangic, harita, setDetay }: { baslangic: Date; harita: Map<string, PlakaKart[]>; setDetay: (k: PlakaKart) => void }) {
  const today = bugunIso()
  const gunler = Array.from({ length: 7 }, (_, i) => addDays(baslangic, i))
  return (
    <div className="verde-card" style={{ padding: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
        {gunler.map(g => {
          const iso = dateToIso(g)
          const kartlar = harita.get(iso) ?? []
          const isBugun = iso === today
          return (
            <div key={iso} style={{
              border: `1.5px solid ${isBugun ? T.blue : T.border}`,
              borderRadius: 8, padding: 8, minHeight: 280,
              background: isBugun ? T.blueLight : '#fff',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: isBugun ? T.blue : T.textSoft, textTransform: 'uppercase' }}>{GUN_KISA[isoDow(g) - 1]}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: isBugun ? T.blue : T.text }}>{g.getUTCDate()}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', maxHeight: 320 }}>
                {kartlar.length === 0 ? (
                  <span style={{ fontSize: 11, color: T.textSoft, fontStyle: 'italic' }}>—</span>
                ) : kartlar.map((k, i) => (
                  <Chip key={`${k.arac_id ?? 'x'}-${i}`} kart={k} onClick={() => setDetay(k)} size="sm" />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Aylık ───────────────────────────────────────────────────
function AylikView({ anchor, baslangic, harita, setDetay, setAnchor, setSekme }: {
  anchor: Date; baslangic: Date; harita: Map<string, PlakaKart[]>;
  setDetay: (k: PlakaKart) => void;
  setAnchor: (d: Date) => void; setSekme: (s: Sekme) => void;
}) {
  const today = bugunIso()
  const ay = anchor.getUTCMonth()
  // 42 gün — 6 hafta
  const gunler = Array.from({ length: 42 }, (_, i) => addDays(baslangic, i))
  return (
    <div className="verde-card" style={{ padding: 12 }}>
      {/* Başlık satırı */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 8 }}>
        {GUN_KISA.map(g => (
          <div key={g} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', padding: '4px 0' }}>{g}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: 'minmax(96px, 1fr)', gap: 6 }}>
        {gunler.map(g => {
          const iso = dateToIso(g)
          const kartlar = harita.get(iso) ?? []
          const isBugun = iso === today
          const inMonth = g.getUTCMonth() === ay
          const display = kartlar.slice(0, 3)
          const overflow = kartlar.length - display.length
          return (
            <div key={iso}
              style={{
                border: `1.5px solid ${isBugun ? T.blue : T.border}`,
                borderRadius: 6, padding: 6,
                background: !inMonth ? '#fafbfc' : (isBugun ? T.blueLight : '#fff'),
                opacity: inMonth ? 1 : 0.55,
                display: 'flex', flexDirection: 'column', gap: 4,
                overflow: 'hidden',
              }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, fontWeight: isBugun ? 800 : 600, color: isBugun ? T.blue : T.text }}>{g.getUTCDate()}</div>
                {kartlar.length > 0 && (
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.textSoft }}>{kartlar.length}</div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {display.map((k, i) => (
                  <Chip key={`${k.arac_id ?? 'x'}-${i}`} kart={k} onClick={() => setDetay(k)} size="xs" />
                ))}
                {overflow > 0 && (
                  <button onClick={() => { setAnchor(g); setSekme('gunluk') }}
                    style={{
                      padding: '1px 6px', borderRadius: 4, border: `1px dashed ${T.border}`,
                      background: '#fff', color: T.textSoft, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    }}>+{overflow} daha</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Yıllık ──────────────────────────────────────────────────
function YillikView({ yil, harita, setAnchor, setSekme }: {
  yil: number; harita: Map<string, PlakaKart[]>;
  setAnchor: (d: Date) => void; setSekme: (s: Sekme) => void;
}) {
  const today = bugunIso()
  return (
    <div className="verde-card" style={{ padding: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {Array.from({ length: 12 }, (_, m) => (
          <MiniAy key={m} yil={yil} ay={m} harita={harita} today={today}
            onAyTik={() => { setAnchor(new Date(Date.UTC(yil, m, 15, 12, 0, 0))); setSekme('aylik') }}
            onGunTik={(d) => { setAnchor(d); setSekme('gunluk') }}
          />
        ))}
      </div>
    </div>
  )
}

function MiniAy({ yil, ay, harita, today, onAyTik, onGunTik }: {
  yil: number; ay: number; harita: Map<string, PlakaKart[]>; today: string;
  onAyTik: () => void; onGunTik: (d: Date) => void;
}) {
  const ilk = new Date(Date.UTC(yil, ay, 1, 12, 0, 0))
  const baslangic = haftaBasi(ilk)
  const gunler = Array.from({ length: 42 }, (_, i) => addDays(baslangic, i))
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8, background: '#fff' }}>
      <button onClick={onAyTik} style={{
        width: '100%', textAlign: 'left', padding: '2px 4px', marginBottom: 6,
        background: 'transparent', border: 'none', cursor: 'pointer',
        fontSize: 13, fontWeight: 800, color: T.text,
      }}>{AY_AD[ay]}</button>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 2 }}>
        {GUN_KISA.map(g => (
          <div key={g} style={{ fontSize: 9, color: T.textSoft, textAlign: 'center', fontWeight: 600 }}>{g[0]}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {gunler.map(g => {
          const iso = dateToIso(g)
          const kartlar = harita.get(iso) ?? []
          const inMonth = g.getUTCMonth() === ay
          const isBugun = iso === today
          // Hücre rengi: en kritik durumun rengi
          let bg = inMonth ? '#fff' : '#f8fafc'
          let fg = inMonth ? T.text : '#cbd5e1'
          let bd = T.border
          if (inMonth && kartlar.length > 0) {
            const enKritik = kartlar.reduce<Durum>((acc, k) =>
              DURUM_PRIO[k.durum] > DURUM_PRIO[acc] ? k.durum : acc, kartlar[0].durum)
            bg = DURUM_BG[enKritik]
            fg = DURUM_FG[enKritik]
            bd = DURUM_BORDER[enKritik]
          }
          return (
            <button key={iso} onClick={() => onGunTik(g)}
              title={kartlar.length > 0 ? `${iso} — ${kartlar.length} plaka` : iso}
              style={{
                aspectRatio: '1',
                fontSize: 9, fontWeight: isBugun ? 800 : 600,
                color: fg, background: bg,
                border: `1px solid ${isBugun ? T.blue : bd}`,
                borderRadius: 3, cursor: 'pointer', padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{g.getUTCDate()}</button>
          )
        })}
      </div>
    </div>
  )
}

// ── Detay Modal ─────────────────────────────────────────────
function DetayModal({ kart, onClose, lokAd, kullaniciAd }: {
  kart: PlakaKart; onClose: () => void;
  lokAd: Record<string, string>; kullaniciAd: Record<string, string>;
}) {
  const g = kart.gercek
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 80,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} className="verde-card"
        style={{ width: 'min(480px, 96vw)', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
          <div style={{
            padding: '6px 12px', borderRadius: 6,
            background: DURUM_BG[kart.durum], color: DURUM_FG[kart.durum],
            border: `1px solid ${DURUM_BORDER[kart.durum]}`,
            fontFamily: 'monospace', fontWeight: 800, fontSize: 18,
          }}>{kart.plaka}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: DURUM_FG[kart.durum] }}>{DURUM_LABEL[kart.durum]}</div>
            <div style={{ fontSize: 12, color: T.textSoft }}>
              {new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long' }).format(isoToDate(kart.tarih))}
            </div>
          </div>
          <button onClick={onClose} style={{
            padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: T.textSoft,
          }}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <Satir label="Departman" deger={kart.departman ?? '—'} />
          <Satir label="İstasyon" deger={kart.lokasyon_id ? (lokAd[kart.lokasyon_id] ?? '—') : '—'} />
          {!g && (
            <div style={{
              marginTop: 8, padding: 10, background: T.grayLight, borderRadius: 6,
              fontSize: 12, color: T.textSoft, fontStyle: 'italic',
            }}>
              Bu yıkama için henüz görev kaydı oluşturulmamış. Cron sistemi hedef tarihten 1 gün önce
              otomatik olarak görevi oluşturur — sonra mobil personel HAZIR'dan AÇIK'a alıp yıkamayı başlatır.
            </div>
          )}
          {g && (
            <>
              <Satir label="Görev Türü" deger={g.ekstra ? 'Ekstra' : 'Planlı'} />
              {g.baslatilma_tarihi && <Satir label="Başlatma" deger={fmtDT(g.baslatilma_tarihi)} />}
              {g.tamamlanma_tarihi && <Satir label="Tamamlanma" deger={fmtDT(g.tamamlanma_tarihi)} />}
              {g.tamamlanma_suresi_saniye != null && g.tamamlanma_suresi_saniye > 0 &&
                <Satir label="Süre" deger={fmtSure(g.tamamlanma_suresi_saniye)} />}
              {g.km != null && <Satir label="KM" deger={g.km.toLocaleString('tr-TR')} />}
              {g.islemi_yapan_id && (g.durum === 'TAMAMLANDI' || g.durum === 'IPTAL' || g.durum === 'YAPILAMADI') &&
                <Satir label={g.durum === 'IPTAL' ? 'İptal Eden' : g.durum === 'YAPILAMADI' ? 'Bırakan' : 'Tamamlayan'}
                  deger={kullaniciAd[g.islemi_yapan_id] ?? '—'} />}
              {g.iptal_sebep && <Satir label="İptal Sebebi" deger={g.iptal_sebep} />}
              {g.notlar && <Satir label="Açıklama" deger={g.notlar} />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Satir({ label, deger }: { label: string; deger: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, padding: '4px 0', borderBottom: '1px dashed #f1f5f9' }}>
      <span style={{ color: T.textSoft, fontWeight: 600 }}>{label}</span>
      <span style={{ color: T.text }}>{deger}</span>
    </div>
  )
}

function fmtDT(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
         d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}
function fmtSure(saniye: number): string {
  const h = Math.floor(saniye / 3600), m = Math.floor((saniye % 3600) / 60)
  if (h > 0) return `${h}sa ${m}dk`
  if (m > 0) return `${m}dk`
  return `${saniye}sn`
}
function sayar(kartlar: PlakaKart[]): Record<Durum, number> {
  const x: Record<Durum, number> = { HAZIR: 0, ACIK: 0, ISLEMDE: 0, TAMAMLANDI: 0, IPTAL: 0, YAPILAMADI: 0 }
  for (const k of kartlar) x[k.durum]++
  return x
}
