'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { X, Loader2, Search, Trash2, Plus } from 'lucide-react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { aralikPlanTahmin, type TahminArac } from '@/lib/oto-yikama/yikamaPlanTahmin'
import type { TakvimGercekKayit, TakvimResponse, TakvimArac } from '@/app/api/oto-yikama/takvim/route'

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
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
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
  const [vurguPlaka, setVurguPlaka] = useState<string>('')

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

    // Skip set'i — kullanıcı tahmini iptal etmişse o (arac, tarih) çifti
    // tahminden de gizlenir (cron da skip yapar; UI ile DB sync)
    const skipSet = new Set<string>()
    for (const s of (data.skipler ?? [])) {
      skipSet.add(`${s.tarih}|${s.arac_id}`)
    }

    const tahminAraclar: TahminArac[] = data.araclar as TahminArac[]
    const tahminler = aralikPlanTahmin(tahminAraclar, `${yil}-01-01`, `${yil}-12-31`)
    for (const t of tahminler) {
      if (t.tarih < CUTOFF_ISO) continue
      const key = `${t.tarih}|${t.arac_id}`
      if (gercekSet.has(key)) continue
      if (skipSet.has(key)) continue  // kullanıcı iptal etmiş — gösterme
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

  // Plaka arama dropdown listesi — araclar listesinden unique + alfabetik
  const plakaListesi = useMemo(() => {
    if (!data?.araclar) return [] as string[]
    const set = new Set<string>()
    for (const a of data.araclar) if (a.plaka) set.add(a.plaka)
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'))
  }, [data])

  return (
    <div>
      {/* Üst bar — yıl + plaka arama + lejant */}
      <div className="verde-card" style={{ padding: '12px 16px', marginBottom: 12, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>
          {yil} Yıkama Takvimi
        </div>
        <div style={{ fontSize: 12, color: T.textSoft }}>
          Bir güne tıklayarak detayı görün
        </div>

        {/* Plaka arama — seçildiğinde o aracın yıkama günleri kırmızı vurgulu */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 6 }}>
          <Search size={14} color={T.textSoft} />
          <input list="takvim-plaka-listesi" value={vurguPlaka}
            onChange={e => setVurguPlaka(e.target.value.toUpperCase().replace(/\s+/g, ''))}
            placeholder="Plaka ara…"
            style={{
              padding: '6px 10px', fontSize: 13, fontFamily: 'monospace', fontWeight: 700,
              border: `1.5px solid ${vurguPlaka ? '#dc2626' : T.border}`,
              borderRadius: 6, background: vurguPlaka ? '#fee2e2' : '#fff',
              color: vurguPlaka ? '#991b1b' : T.text, width: 160,
            }} />
          <datalist id="takvim-plaka-listesi">
            {plakaListesi.map(p => <option key={p} value={p} />)}
          </datalist>
          {vurguPlaka && (
            <button onClick={() => setVurguPlaka('')} title="Vurguyu temizle"
              style={{ padding: '4px 7px', fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 5, background: '#fff', cursor: 'pointer', color: T.textSoft }}>
              <X size={12} />
            </button>
          )}
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
          {vurguPlaka && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#991b1b', fontWeight: 700 }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: '#fee2e2', border: '2px solid #dc2626' }} />
              {vurguPlaka} günleri
            </span>
          )}
        </div>
      </div>

      {/* 6 ay × 2 satır grid */}
      <div style={{ position: 'relative', minHeight: 400 }}>
        {yukleniyor && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.85)', zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12,
            flexDirection: 'column', gap: 12,
          }}>
            <Loader2 size={40} color={T.blue} style={{ animation: 'spin 0.9s linear infinite' }} />
            <div style={{ color: T.text, fontSize: 14, fontWeight: 700 }}>Yıllık takvim hazırlanıyor…</div>
            <div style={{ color: T.textSoft, fontSize: 12 }}>Plakalar ve yıkama planları yükleniyor</div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 10 }}>
          {Array.from({ length: 12 }, (_, m) => (
            <AyBlock key={m} yil={yil} ay={m} harita={gunKartlari}
              vurguPlaka={vurguPlaka}
              onGunTik={iso => setSeciliGun(iso)} />
          ))}
        </div>
      </div>

      {seciliGun && (
        <GunPopup
          tarih={seciliGun}
          kartlar={gunKartlari.get(seciliGun) ?? []}
          lokAd={data?.lokasyonAdMap ?? {}}
          araclar={data?.araclar ?? []}
          firmaId={firmaId}
          onClose={() => setSeciliGun(null)}
          onChange={() => { yukle(); /* popup açık kalsın, veriler yenilensin */ }}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── Ay bloğu ───────────────────────────────────────────────
function AyBlock({ yil, ay, harita, onGunTik, vurguPlaka }: {
  yil: number; ay: number;
  harita: Map<string, PlakaKart[]>;
  onGunTik: (iso: string) => void;
  vurguPlaka?: string;
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

          // Plaka vurgusu: durum renklerinin üzerine kırmızı vurgu (en yüksek öncelik)
          const vurgulu = !!vurguPlaka && inMonth && !onceCut &&
            kartlar.some(k => k.plaka === vurguPlaka)
          if (vurgulu) {
            bg = '#fee2e2'
            fg = '#991b1b'
            bd = '#dc2626'
          }

          const tiklanabilir = inMonth && !onceCut

          return (
            <button key={iso}
              onClick={() => tiklanabilir && onGunTik(iso)}
              disabled={!tiklanabilir}
              title={
                onceCut ? 'Sistem öncesi — gösterim yok'
                : !inMonth ? ''
                : vurgulu ? `${vurguPlaka} bu gün yıkanacak — toplam ${kartlar.length} araç`
                : kartlar.length > 0 ? `${kartlar.length} araç` : 'Plan yok'
              }
              style={{
                aspectRatio: '1',
                background: bg,
                color: fg,
                border: `${vurgulu ? 2 : 1}px solid ${isBugun ? T.blue : bd}`,
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
function GunPopup({ tarih, kartlar, lokAd, araclar, firmaId, onClose, onChange }: {
  tarih: string;
  kartlar: PlakaKart[];
  lokAd: Record<string, string>;
  araclar: TakvimArac[];
  firmaId: string;
  onClose: () => void;
  onChange: () => void;
}) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const d = isoToDate(tarih)
  const dowAdi = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'][isoDow(d) - 1]
  const tarihEt = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'long', year: 'numeric' }).format(d)
  const isoHafta = isoHaftaNo(d)
  const gunNo = yilinKacinciGunu(d)
  const isBugun = tarih === bugunIso()
  // Düzenleme yetkisi: bugün + gelecek tarih (geçmiş tarih read-only)
  const duzenlenebilir = tarih >= bugunIso()

  const [aktif, setAktif] = useState(false) // loading state
  const [ekleAcik, setEkleAcik] = useState(false)

  const sayilar: Record<Durum, number> = { HAZIR: 0, ACIK: 0, ISLEMDE: 0, TAMAMLANDI: 0, IPTAL: 0, YAPILAMADI: 0 }
  for (const k of kartlar) sayilar[k.durum]++

  // Silinebilir mi?
  // - Gerçek HAZIR/ACIK görev → DELETE ile silinir
  // - Tahmini görev (k.gercek=null) → POST {iptal:true} ile IPTAL kaydı
  //   oluşturulup cron tekrar üretmeyecek hale getirilir
  // - Diğer durumlar (ISLEMDE/TAMAMLANDI/IPTAL/YAPILAMADI) silinemez
  function silinebilir(k: PlakaKart): boolean {
    if (!duzenlenebilir || !k.arac_id) return false
    if (!k.gercek) return true // tahmini her zaman iptal edilebilir
    return k.durum === 'HAZIR' || k.durum === 'ACIK'
  }

  async function bireyselSil(k: PlakaKart) {
    if (!k.arac_id) return
    const tahminMi = !k.gercek
    const ok = await confirm({
      title: tahminMi ? 'Tahmini Plan İptal' : 'Plakayı Sil',
      message: tahminMi
        ? `${k.plaka} için ${tarihEt} tarihindeki tahmini yıkama planı iptal edilecek. Cron tekrar oluşturmayacak. Onaylıyor musunuz?`
        : `${k.plaka} için ${tarihEt} tarihindeki planlı görev silinecek. Onaylıyor musunuz?`,
      confirmText: tahminMi ? 'İptal Et' : 'Sil', cancelText: 'Vazgeç', variant: 'danger',
    })
    if (!ok) return
    setAktif(true)
    try {
      let res: Response
      if (tahminMi) {
        // Tahmin için: IPTAL durumlu görev oluştur (cron mevcut metadata
        // gördüğü için tekrar üretmez)
        res = await fetch('/api/oto-yikama/takvim/gun', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firma_id: firmaId, arac_id: k.arac_id, tarih, iptal: true }),
        })
      } else {
        // Gerçek HAZIR/ACIK görev: doğrudan sil
        const url = `/api/oto-yikama/takvim/gun?firma_id=${firmaId}&tarih=${tarih}&arac_id=${k.arac_id}`
        res = await fetch(url, { method: 'DELETE' })
      }
      const j = await res.json()
      if (!j.ok) throw new Error(j.error)
      toast({ type: 'success', title: tahminMi ? 'İptal edildi' : 'Silindi', message: `${k.plaka}` })
      onChange()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setAktif(false)
    }
  }

  async function tumunuSil() {
    const silinebilirler = kartlar.filter(k => silinebilir(k))
    if (silinebilirler.length === 0) {
      toast({ type: 'info', title: 'Bilgi', message: 'Silinebilir görev yok' })
      return
    }
    const tahminAdet = silinebilirler.filter(k => !k.gercek).length
    const gercekAdet = silinebilirler.filter(k => k.gercek).length
    const ok = await confirm({
      title: `${tarihEt} — Tümünü Sil`,
      message:
        `Bu gün için ${silinebilirler.length} plan iptal/silinecek:\n` +
        (gercekAdet > 0 ? `  • ${gercekAdet} mevcut planlı görev silinecek\n` : '') +
        (tahminAdet > 0 ? `  • ${tahminAdet} tahmini plan iptal edilecek (cron üretmeyecek)\n` : '') +
        `\nİşlemde/Tamamlanmış görevler korunur. Onaylıyor musunuz?`,
      confirmText: 'Tümünü Sil', cancelText: 'Vazgeç', variant: 'danger',
    })
    if (!ok) return
    setAktif(true)
    try {
      // 1) Gerçek HAZIR/ACIK görevleri toplu sil (DELETE — arac_id yok = tümü)
      if (gercekAdet > 0) {
        const url = `/api/oto-yikama/takvim/gun?firma_id=${firmaId}&tarih=${tarih}`
        const res = await fetch(url, { method: 'DELETE' })
        const j = await res.json()
        if (!j.ok) throw new Error(j.error)
      }
      // 2) Tahmini görevler için sırayla POST {iptal:true}
      let tahminBasarili = 0
      for (const k of silinebilirler.filter(k => !k.gercek)) {
        try {
          const res = await fetch('/api/oto-yikama/takvim/gun', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ firma_id: firmaId, arac_id: k.arac_id, tarih, iptal: true }),
          })
          const j = await res.json()
          if (j.ok) tahminBasarili++
        } catch {}
      }
      toast({
        type: 'success', title: 'Temizlendi',
        message: `${gercekAdet} silindi, ${tahminBasarili} tahmin iptal edildi`,
      })
      onChange()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setAktif(false)
    }
  }

  // Eklenebilir araç listesi: bu gün için zaten görev olmayanlar
  const eklenebilirAraclar = useMemo(() => {
    const mevcutAracIds = new Set(kartlar.map(k => k.arac_id).filter(Boolean) as string[])
    return araclar
      .filter(a => a.aktif && !mevcutAracIds.has(a.id))
      .sort((a, b) => a.plaka.localeCompare(b.plaka, 'tr'))
  }, [araclar, kartlar])

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 80,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} className="verde-card"
        style={{ width: 'min(760px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
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

        {/* Durum dağılımı + Aksiyon butonları */}
        {(kartlar.length > 0 || duzenlenebilir) && (
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
            {duzenlenebilir && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button onClick={() => setEkleAcik(true)} disabled={aktif || eklenebilirAraclar.length === 0}
                  title={eklenebilirAraclar.length === 0 ? 'Eklenebilir araç yok (hepsi planlı)' : 'Bu güne plaka ekle'}
                  style={{
                    padding: '6px 12px', borderRadius: 6, border: 'none',
                    background: aktif || eklenebilirAraclar.length === 0 ? '#cbd5e1' : 'linear-gradient(145deg, #1d4ed8, #1e40af)',
                    color: '#fff', cursor: aktif || eklenebilirAraclar.length === 0 ? 'not-allowed' : 'pointer',
                    fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5,
                  }}>
                  <Plus size={13} /> Plaka Ekle
                </button>
                <button onClick={tumunuSil} disabled={aktif || kartlar.filter(k => silinebilir(k)).length === 0}
                  style={{
                    padding: '6px 12px', borderRadius: 6,
                    border: `1.5px solid ${T.red}`, background: '#fff', color: T.red,
                    cursor: aktif ? 'not-allowed' : 'pointer',
                    fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 5,
                    opacity: kartlar.filter(k => silinebilir(k)).length === 0 ? 0.4 : 1,
                  }}>
                  <Trash2 size={13} /> Tümünü Sil
                </button>
              </div>
            )}
          </div>
        )}

        {/* Plaka grid */}
        <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
          {kartlar.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 36, color: T.textSoft, fontSize: 13 }}>
              Bu gün için planlanmış yıkama yok.
              {duzenlenebilir && eklenebilirAraclar.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12 }}>Yukarıdan <strong>"Plaka Ekle"</strong> ile bir plaka ekleyebilirsiniz.</div>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
              {kartlar.map((k, i) => (
                <div key={`${k.arac_id ?? 'x'}-${i}`}
                  style={{
                    padding: '8px 10px', borderRadius: 7,
                    border: `1px solid ${DURUM_BORDER[k.durum]}`,
                    background: DURUM_BG[k.durum],
                    display: 'flex', flexDirection: 'column', gap: 3,
                    position: 'relative',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{
                      fontFamily: 'monospace', fontWeight: 800, fontSize: 17,
                      color: DURUM_FG[k.durum],
                    }}>{k.plaka}</span>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: DURUM_FG[k.durum] }}>{DURUM_LABEL[k.durum]}</span>
                      {silinebilir(k) && (
                        <button onClick={() => bireyselSil(k)} disabled={aktif}
                          title={k.gercek ? 'Bu plakayı bu günden sil' : 'Tahmini planı iptal et (cron üretmez)'}
                          style={{
                            padding: 3, borderRadius: 4, border: 'none',
                            background: 'rgba(220,38,38,0.12)', color: T.red,
                            cursor: aktif ? 'not-allowed' : 'pointer',
                            display: 'inline-flex', alignItems: 'center',
                          }}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: T.textSoft, display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span>{k.departman ?? '—'}</span>
                    {k.lokasyon_id && <><span>·</span><span>{lokAd[k.lokasyon_id] ?? '—'}</span></>}
                    {!k.gercek && (
                      <span style={{ marginLeft: 4, fontStyle: 'italic', color: '#94a3b8' }}>(tahmini)</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {ekleAcik && (
        <PlakaEkleModal
          tarih={tarih}
          tarihEt={tarihEt}
          firmaId={firmaId}
          araclar={eklenebilirAraclar}
          lokAd={lokAd}
          onClose={() => setEkleAcik(false)}
          onSaved={() => { setEkleAcik(false); onChange() }}
        />
      )}
    </div>
  )
}

// ── Plaka Ekle Alt-Modal ───────────────────────────────────
function PlakaEkleModal({ tarih, tarihEt, firmaId, araclar, lokAd, onClose, onSaved }: {
  tarih: string; tarihEt: string; firmaId: string;
  araclar: TakvimArac[]; lokAd: Record<string, string>;
  onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useToast()
  const [seciliAracId, setSeciliAracId] = useState<string>('')
  const [arama, setArama] = useState('')
  const [kaydet, setKaydet] = useState(false)

  const filtreli = useMemo(() => {
    const q = arama.trim().toUpperCase()
    if (!q) return araclar  // tüm aktif araçlar (limit yok)
    return araclar.filter(a =>
      a.plaka.toUpperCase().includes(q) ||
      (a.departman ?? '').toUpperCase().includes(q)
    )
  }, [araclar, arama])

  const seciliArac = araclar.find(a => a.id === seciliAracId)

  async function ekle() {
    if (!seciliAracId) {
      toast({ type: 'error', title: 'Hata', message: 'Bir plaka seçin' })
      return
    }
    setKaydet(true)
    try {
      const res = await fetch('/api/oto-yikama/takvim/gun', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firma_id: firmaId, arac_id: seciliAracId, tarih }),
      })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error)
      toast({ type: 'success', title: 'Eklendi', message: `${j.plaka} → ${tarihEt}` })
      onSaved()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setKaydet(false)
    }
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', zIndex: 90,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} className="verde-card"
        style={{ width: 'min(520px, 96vw)', maxHeight: '85vh', padding: 18, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Plus size={16} color={T.blue} /> Plaka Ekle — {tarihEt}
          </div>
          <button onClick={onClose} style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: T.textSoft }}>
            <X size={18} />
          </button>
        </div>

        <input type="text" autoFocus value={arama} onChange={e => setArama(e.target.value)}
          placeholder="Plaka veya departman ara…"
          style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 10 }} />

        <div style={{ flex: 1, overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: 6 }}>
          {filtreli.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: T.textSoft, fontSize: 13 }}>
              {araclar.length === 0 ? 'Eklenebilir araç yok — hepsi bu gün için planlı.' : 'Arama sonucu yok.'}
            </div>
          ) : (
            filtreli.map(a => {
              const selected = a.id === seciliAracId
              return (
                <button key={a.id} type="button" onClick={() => setSeciliAracId(a.id)}
                  style={{
                    width: '100%', padding: '8px 12px', textAlign: 'left',
                    background: selected ? T.blueLight : '#fff',
                    border: 'none', borderBottom: `1px solid ${T.border}`,
                    borderLeft: `3px solid ${selected ? T.blue : 'transparent'}`,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%',
                    border: `1.5px solid ${selected ? T.blue : '#cbd5e1'}`,
                    background: '#fff', flexShrink: 0, position: 'relative',
                  }}>
                    {selected && <div style={{ position: 'absolute', inset: 3, borderRadius: '50%', background: T.blue }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 16, color: T.text }}>{a.plaka}</div>
                    <div style={{ fontSize: 11, color: T.textSoft, display: 'flex', gap: 4 }}>
                      {a.departman && <span>{a.departman}</span>}
                      {a.varsayilan_lokasyon_id && lokAd[a.varsayilan_lokasyon_id] && (
                        <><span>·</span><span>İstasyon: {lokAd[a.varsayilan_lokasyon_id]}</span></>
                      )}
                      {!a.varsayilan_lokasyon_id && (
                        <span style={{ color: T.amber }}>· Varsayılan istasyon yok</span>
                      )}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {seciliArac && !seciliArac.varsayilan_lokasyon_id && (
          <div style={{ marginTop: 10, padding: '8px 12px', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, color: '#78350f' }}>
            ⚠️ Bu aracın varsayılan istasyonu yok. Önce Araç Kayıtları'ndan istasyon atayın.
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
          <button onClick={onClose} disabled={kaydet}
            style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
            İptal
          </button>
          <button onClick={ekle}
            disabled={kaydet || !seciliAracId || (seciliArac ? !seciliArac.varsayilan_lokasyon_id : true)}
            style={{
              padding: '7px 16px', borderRadius: 6, border: 'none',
              background: kaydet || !seciliAracId || (seciliArac && !seciliArac.varsayilan_lokasyon_id)
                ? '#cbd5e1' : 'linear-gradient(145deg, #1d4ed8, #1e40af)',
              color: '#fff',
              cursor: kaydet || !seciliAracId ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
            {kaydet
              ? <><Loader2 size={13} style={{ animation: 'spin 0.9s linear infinite' }} /> Ekleniyor…</>
              : <><Plus size={13} /> Ekle</>}
          </button>
        </div>
      </div>
    </div>
  )
}
