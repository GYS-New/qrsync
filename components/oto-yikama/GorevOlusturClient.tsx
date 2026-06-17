'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { ChevronLeft, ChevronRight, Search, X, Calendar, Car, MapPin, Loader2, ChevronDown, ChevronUp, Check } from 'lucide-react'

type Arac = {
  id: string
  plaka: string
  marka: string | null
  model: string | null
  departman: string | null
  kullanici_adi_soyadi: string | null
  aktif: boolean
}

type Lokasyon = {
  id: string
  tanim: string
  parent_id: string | null
  aktif: boolean
  ust?: { id: string; tanim: string } | null
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  grayLight: '#f8fafc',
}

function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function startOfWeek(d: Date) {
  const x = new Date(d)
  const dow = (x.getDay() + 6) % 7  // pazartesi = 0
  x.setDate(x.getDate() - dow)
  return x
}

const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const GUN_ADLARI = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

// Lokasyon display: "OTO YIKAMA > İSTASYON-1" gibi
function lokasyonDisplay(l: Lokasyon): string {
  if (l.ust?.tanim) return `${l.ust.tanim} > ${l.tanim}`
  return l.tanim
}

export default function GorevOlusturClient({ firmaId }: { firmaId: string }) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [araclar, setAraclar] = useState<Arac[]>([])
  const [lokasyonlar, setLokasyonlar] = useState<Lokasyon[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)

  const [q, setQ] = useState('')
  const [filterDepartman, setFilterDepartman] = useState('')

  // arac_id → lokasyon_id
  const [secimMap, setSecimMap] = useState<Map<string, string>>(new Map())
  const [tarihler, setTarihler] = useState<Set<string>>(new Set())
  const [ayBaslangic, setAyBaslangic] = useState(() => startOfMonth(new Date()))
  const [olusturLoading, setOlusturLoading] = useState(false)
  // "Plakalara özel istasyon" paneli (collapse)
  const [detayAcik, setDetayAcik] = useState(false)
  // Aktif "toplu istasyon" seçimi (üst kart radio). Plaka eklendikçe yenilere bu uygulanır.
  const [topluLokasyon, setTopluLokasyon] = useState<string>('')

  async function yukle() {
    setYukleniyor(true)
    try {
      const [aracRes, lokRes] = await Promise.all([
        fetch(`/api/oto-yikama/araclar?firma_id=${firmaId}&aktif=true`, { cache: 'no-store' }),
        fetch(`/api/oto-yikama/lokasyonlar?firma_id=${firmaId}`, { cache: 'no-store' }),
      ])
      const aracJ = await aracRes.json()
      const lokJ = await lokRes.json()
      if (!aracJ.ok) throw new Error(aracJ.error)
      if (!lokJ.ok) throw new Error(lokJ.error)
      setAraclar(aracJ.data)
      setLokasyonlar(lokJ.data)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { yukle() }, [firmaId])

  const departmanlar = useMemo(() => {
    const s = new Set<string>()
    for (const a of araclar) if (a.departman) s.add(a.departman)
    return [...s].sort((a, b) => a.localeCompare(b, 'tr'))
  }, [araclar])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    return araclar.filter(a => {
      if (filterDepartman && a.departman !== filterDepartman) return false
      if (s) {
        const hay = `${a.plaka} ${a.marka ?? ''} ${a.model ?? ''} ${a.departman ?? ''} ${a.kullanici_adi_soyadi ?? ''}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [araclar, q, filterDepartman])

  // Varsayılan lokasyon — sadece alt lokasyonlar (parent_id NOT NULL) tercih edilir
  const altLokasyonlar = useMemo(() => lokasyonlar.filter(l => l.parent_id != null), [lokasyonlar])
  const varsayilanLokasyon = altLokasyonlar[0]?.id ?? lokasyonlar[0]?.id ?? ''
  // Toplu lokasyon başlangıçta varsayılan (ilk altLokasyon) olur
  useEffect(() => {
    if (!topluLokasyon && varsayilanLokasyon) setTopluLokasyon(varsayilanLokasyon)
  }, [varsayilanLokasyon, topluLokasyon])

  function toggleArac(a: Arac) {
    setSecimMap(prev => {
      const m = new Map(prev)
      if (m.has(a.id)) m.delete(a.id)
      else m.set(a.id, topluLokasyon || varsayilanLokasyon)
      return m
    })
  }

  function setLokasyon(aracId: string, lokId: string) {
    setSecimMap(prev => {
      const m = new Map(prev)
      m.set(aracId, lokId)
      return m
    })
  }

  function tumunuSec() {
    setSecimMap(prev => {
      const m = new Map(prev)
      for (const a of filtered) if (!m.has(a.id)) m.set(a.id, topluLokasyon || varsayilanLokasyon)
      return m
    })
  }
  function temizleSecim() { setSecimMap(new Map()) }

  function tumLokasyon(lokId: string) {
    setTopluLokasyon(lokId)
    setSecimMap(prev => {
      const m = new Map<string, string>()
      for (const [k] of prev) m.set(k, lokId)
      return m
    })
  }

  function toggleTarih(d: Date) {
    const k = fmtDate(d)
    setTarihler(prev => {
      const s = new Set(prev)
      if (s.has(k)) s.delete(k)
      else s.add(k)
      return s
    })
  }
  function hizliSec(gunSayisi: number, baslangic: 'bugun' | 'yarin' = 'bugun') {
    const baslangicD = new Date()
    if (baslangic === 'yarin') baslangicD.setDate(baslangicD.getDate() + 1)
    baslangicD.setHours(0, 0, 0, 0)
    const yeni = new Set<string>()
    for (let i = 0; i < gunSayisi; i++) {
      const d = new Date(baslangicD)
      d.setDate(d.getDate() + i)
      yeni.add(fmtDate(d))
    }
    setTarihler(yeni)
  }
  function buAyHaftaIciSec() {
    const yeni = new Set<string>()
    const son = new Date(ayBaslangic.getFullYear(), ayBaslangic.getMonth() + 1, 0)
    const bugun = new Date(); bugun.setHours(0, 0, 0, 0)
    for (let d = new Date(ayBaslangic); d <= son; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay()
      if (dow !== 0 && dow !== 6 && d >= bugun) yeni.add(fmtDate(new Date(d)))
    }
    setTarihler(yeni)
  }

  const takvimHucreler = useMemo(() => {
    const ayBas = startOfMonth(ayBaslangic)
    const gridBas = startOfWeek(ayBas)
    const hucreler: { date: Date; ayDisi: boolean }[] = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridBas)
      d.setDate(d.getDate() + i)
      hucreler.push({ date: d, ayDisi: d.getMonth() !== ayBaslangic.getMonth() })
    }
    return hucreler
  }, [ayBaslangic])

  const atamaListesi = useMemo(() => {
    const ids = [...secimMap.keys()]
    return araclar.filter(a => ids.includes(a.id))
  }, [araclar, secimMap])

  const beklenenGorev = atamaListesi.length * tarihler.size

  async function olustur() {
    if (atamaListesi.length === 0) { toast({ type: 'error', title: 'Hata', message: 'En az bir plaka seçin' }); return }
    if (tarihler.size === 0) { toast({ type: 'error', title: 'Hata', message: 'En az bir tarih seçin' }); return }
    const eksikLok = atamaListesi.find(a => !secimMap.get(a.id))
    if (eksikLok) { toast({ type: 'error', title: 'Hata', message: `${eksikLok.plaka} için lokasyon seçilmedi` }); return }

    const sortedTarihler = [...tarihler].sort()
    const ok = await confirm({
      title: 'Görev Oluştur',
      message: `${atamaListesi.length} plaka × ${tarihler.size} tarih = ${beklenenGorev} görev oluşturulacak.\n\nTarihler: ${sortedTarihler.slice(0, 5).join(', ')}${sortedTarihler.length > 5 ? ` ve ${sortedTarihler.length - 5} tarih daha` : ''}\n\nDevam edilsin mi?`,
      confirmText: 'Oluştur',
      cancelText: 'İptal',
    })
    if (!ok) return

    setOlusturLoading(true)
    try {
      const res = await fetch('/api/oto-yikama/gorevler/olustur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firma_id: firmaId,
          atamalar: atamaListesi.map(a => ({ arac_id: a.id, lokasyon_id: secimMap.get(a.id) })),
          tarihler: sortedTarihler,
        }),
      })
      const j = await res.json()
      if (!j.ok && !j.eklenen) throw new Error(j.error ?? 'Görev oluşturulamadı')
      toast({
        type: j.eklenen > 0 ? 'success' : 'error',
        title: 'Sonuç',
        message: `+${j.eklenen} görev eklendi${j.duplicate ? `, ${j.duplicate} duplicate atlandı` : ''}${j.hatalar?.length ? `, ${j.hatalar.length} hata` : ''}`,
      })
      if (j.eklenen > 0) {
        setSecimMap(new Map())
        setTarihler(new Set())
      }
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setOlusturLoading(false)
    }
  }

  // İstasyona göre kaç plaka atanmış (toplu/özel ayrımı için)
  // NOT: useMemo erken return'lardan ÖNCE çağrılmalı (React Hooks kuralı).
  const istasyonDagilim = useMemo(() => {
    const m = new Map<string, number>()
    for (const [, lokId] of secimMap) m.set(lokId, (m.get(lokId) ?? 0) + 1)
    return m
  }, [secimMap])
  const farkliIstasyonSayisi = istasyonDagilim.size

  if (yukleniyor) {
    return (
      <div style={{ padding: '60px 28px', textAlign: 'center', color: T.textSoft }}>
        <Loader2 size={28} style={{ animation: 'spin 0.9s linear infinite' }} />
        <div style={{ marginTop: 8 }}>Yükleniyor…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (altLokasyonlar.length === 0) {
    return (
      <div style={{ padding: '24px 28px' }}>
        <div className="verde-card" style={{ padding: 32, textAlign: 'center' }}>
          <MapPin size={32} color={T.amber} style={{ marginBottom: 8 }} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Önce Yıkama İstasyonları Oluşturun</h3>
          <p style={{ marginTop: 8, color: T.textSoft, fontSize: 13 }}>
            Görev oluşturmak için Yıkama İstasyonları sayfasından bir üst istasyon (örn. "ARAÇ YIKAMA")
            ve altına en az bir alt istasyon (örn. "İSTASYON-1") tanımlamış olmalısınız.
          </p>
          <a href="/oto-yikama/lokasyonlar"
            style={{ display: 'inline-block', marginTop: 14, padding: '8px 18px', borderRadius: 8, background: T.text, color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
            Yıkama İstasyonlarına Git
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── STICKY ÖZET BAR + Oluştur ── */}
      <div className="verde-card" style={{
        padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        position: 'sticky', top: 0, zIndex: 10, boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <OzetPil ikon={<Car size={14} />} sayi={atamaListesi.length} etiket="plaka" renk={T.blue} />
          <span style={{ color: T.textSoft, fontSize: 14 }}>×</span>
          <OzetPil ikon={<Calendar size={14} />} sayi={tarihler.size} etiket="tarih" renk={T.amber} />
          <span style={{ color: T.textSoft, fontSize: 14 }}>=</span>
          <OzetPil sayi={beklenenGorev} etiket="görev" renk={beklenenGorev > 0 ? T.green : T.textSoft} buyuk />
        </div>
        <button onClick={olustur} disabled={beklenenGorev === 0 || olusturLoading}
          style={{
            padding: '10px 22px', borderRadius: 8, border: 'none',
            background: beklenenGorev > 0 && !olusturLoading
              ? 'linear-gradient(145deg, #16a34a, #15803d)'
              : '#cbd5e1',
            color: '#fff',
            cursor: beklenenGorev > 0 && !olusturLoading ? 'pointer' : 'not-allowed',
            fontSize: 14, fontWeight: 800,
            boxShadow: beklenenGorev > 0 ? '0 4px 12px rgba(22,163,74,0.25)' : 'none',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
          {olusturLoading
            ? <><Loader2 size={14} style={{ animation: 'spin 0.9s linear infinite' }} /> Oluşturuluyor…</>
            : <><Check size={14} /> {beklenenGorev > 0 ? `${beklenenGorev} Görev Oluştur` : 'Görev Oluştur'}</>}
        </button>
      </div>

      {/* ── ANA KARTLAR: Sol geniş PLAKA | Sağ stack (İSTASYON üst + TARİH alt) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 340px',
        gap: 14,
        alignItems: 'start',
        // sayfa dolacak şekilde minimum yükseklik (sticky bar + container padding düşülmüş)
        minHeight: 'calc(100vh - 200px)',
      }}>

        {/* KART 1: PLAKALAR — sayfa altına kadar uzar */}
        <div className="verde-card" style={{
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          height: 'calc(100vh - 200px)',
        }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: T.blue + '14', color: T.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13 }}>1</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Plakalar</div>
              <div style={{ marginLeft: 'auto', fontSize: 11, color: T.textSoft }}>{atamaListesi.length} / {araclar.length} seçili</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 180, background: T.grayLight, border: `1px solid ${T.border}`, borderRadius: 6, padding: '5px 10px' }}>
                <Search size={13} color={T.textSoft} />
                <input placeholder="Plaka, kullanıcı, departman…"
                  value={q} onChange={e => setQ(e.target.value)}
                  style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12.5, color: T.text }} />
              </div>
              <select className="verde-select" value={filterDepartman} onChange={e => setFilterDepartman(e.target.value)}
                style={{ width: 130, padding: '5px 8px', fontSize: 12 }}>
                <option value="">Tüm Dept.</option>
                {departmanlar.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <button onClick={tumunuSec}
                style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: T.text }}>
                Tümü ({filtered.length})
              </button>
              {atamaListesi.length > 0 && (
                <button onClick={temizleSecim}
                  style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.redLight}`, background: '#fff', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: T.red }}>
                  Temizle
                </button>
              )}
            </div>
          </div>
          {/* Plaka chip grid */}
          {/* Plaka chip grid — parent yüksekliğini doldurur, kendi içinde scroll */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 12 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: T.textSoft, fontSize: 13 }}>Sonuç yok.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 6 }}>
                {filtered.map(a => {
                  const selected = secimMap.has(a.id)
                  return (
                    <button key={a.id} type="button" onClick={() => toggleArac(a)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 7,
                        border: `1.5px solid ${selected ? T.blue : T.border}`,
                        background: selected ? T.blueLight : '#fff',
                        cursor: 'pointer', textAlign: 'left',
                        transition: 'all 0.1s',
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{
                          width: 14, height: 14, borderRadius: 4,
                          border: `1.5px solid ${selected ? T.blue : '#cbd5e1'}`,
                          background: selected ? T.blue : '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        }}>
                          {selected && <Check size={9} color="#fff" strokeWidth={3.5} />}
                        </span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 13, color: T.text, letterSpacing: '0.03em' }}>{a.plaka}</span>
                      </div>
                      <div style={{ fontSize: 10.5, color: T.textSoft, paddingLeft: 20, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {a.kullanici_adi_soyadi ?? '—'} {a.departman ? `· ${a.departman}` : ''}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* SAĞ SÜTUN: İstasyon + Tarihler alt alta — sayfa altına kadar uzar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* KART 2: İSTASYON */}
        <div className="verde-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: T.amber + '14', color: T.amber, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13 }}>2</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>İstasyon</div>
              {farkliIstasyonSayisi > 1 && (
                <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, color: T.amber, background: T.amberLight, padding: '2px 8px', borderRadius: 999 }}>
                  {farkliIstasyonSayisi} farklı
                </span>
              )}
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: T.textSoft }}>
              Tüm seçili plakalar için ortak istasyon. Plaka-özel istasyon için aşağıyı aç.
            </p>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {altLokasyonlar.length === 0 ? (
              <div style={{ padding: 16, textAlign: 'center', color: T.textSoft, fontSize: 12.5 }}>İstasyon tanımlı değil.</div>
            ) : altLokasyonlar.map(l => {
              const active = topluLokasyon === l.id
              const adetBuLok = istasyonDagilim.get(l.id) ?? 0
              return (
                <button key={l.id} type="button" onClick={() => tumLokasyon(l.id)}
                  style={{
                    padding: '10px 12px', borderRadius: 7,
                    border: `1.5px solid ${active ? T.blue : T.border}`,
                    background: active ? T.blueLight : '#fff',
                    cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: '50%',
                    border: `2px solid ${active ? T.blue : '#cbd5e1'}`,
                    background: '#fff', position: 'relative', flexShrink: 0,
                  }}>
                    {active && (
                      <span style={{
                        position: 'absolute', inset: 3, borderRadius: '50%', background: T.blue,
                      }} />
                    )}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.tanim}
                    </div>
                    {l.ust?.tanim && (
                      <div style={{ fontSize: 10.5, color: T.textSoft, marginTop: 1 }}>{l.ust.tanim}</div>
                    )}
                  </div>
                  {adetBuLok > 0 && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: T.blue, background: '#fff', border: `1px solid ${T.blue}33`, padding: '2px 7px', borderRadius: 999 }}>
                      {adetBuLok}
                    </span>
                  )}
                </button>
              )
            })}

            {/* Plakalara özel istasyon paneli */}
            {atamaListesi.length > 0 && (
              <button type="button" onClick={() => setDetayAcik(v => !v)}
                style={{
                  marginTop: 4,
                  padding: '7px 12px', borderRadius: 7,
                  border: `1px dashed ${T.border}`, background: T.grayLight,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 600, color: T.textSoft,
                }}>
                {detayAcik ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                Plaka-özel istasyon ({atamaListesi.length})
              </button>
            )}

            {detayAcik && atamaListesi.length > 0 && (
              <div style={{ maxHeight: 240, overflowY: 'auto', border: `1px solid ${T.border}`, borderRadius: 7 }}>
                {atamaListesi.map(a => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 8px', borderBottom: `1px solid ${T.border}`,
                  }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 12, color: T.text, width: 80, flexShrink: 0 }}>{a.plaka}</span>
                    <select value={secimMap.get(a.id) ?? ''}
                      onChange={e => setLokasyon(a.id, e.target.value)}
                      style={{ flex: 1, minWidth: 0, padding: '3px 6px', fontSize: 11.5, border: `1px solid ${T.border}`, borderRadius: 5, background: '#fff' }}>
                      {altLokasyonlar.map(l => (
                        <option key={l.id} value={l.id}>{lokasyonDisplay(l)}</option>
                      ))}
                    </select>
                    <button onClick={() => toggleArac(a)} title="Kaldır"
                      style={{ padding: 3, background: 'transparent', border: 'none', cursor: 'pointer', color: T.red, display: 'flex' }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* KART 3: TARİHLER */}
        <div className="verde-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: T.green + '14', color: T.green, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13 }}>3</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Tarihler</div>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: T.textSoft }}>{tarihler.size} gün</span>
            </div>
          </div>

          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button onClick={() => hizliSec(1, 'bugun')} style={hizliBtn}>Bugün</button>
              <button onClick={() => hizliSec(1, 'yarin')} style={hizliBtn}>Yarın</button>
              <button onClick={() => hizliSec(7)} style={hizliBtn}>7 gün</button>
              <button onClick={() => hizliSec(30)} style={hizliBtn}>30 gün</button>
              <button onClick={buAyHaftaIciSec} style={hizliBtn}>Hafta içi</button>
              {tarihler.size > 0 && (
                <button onClick={() => setTarihler(new Set())} style={{ ...hizliBtn, color: T.red }}>Temizle</button>
              )}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <button onClick={() => setAyBaslangic(new Date(ayBaslangic.getFullYear(), ayBaslangic.getMonth() - 1, 1))}
                  style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: T.text }}>
                  <ChevronLeft size={18} />
                </button>
                <div style={{ fontSize: 13, fontWeight: 800 }}>
                  {AY_ADLARI[ayBaslangic.getMonth()]} {ayBaslangic.getFullYear()}
                </div>
                <button onClick={() => setAyBaslangic(new Date(ayBaslangic.getFullYear(), ayBaslangic.getMonth() + 1, 1))}
                  style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: T.text }}>
                  <ChevronRight size={18} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                {GUN_ADLARI.map(g => (
                  <div key={g} style={{ padding: 4, textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: T.textSoft }}>{g}</div>
                ))}
                {takvimHucreler.map((h, i) => {
                  const k = fmtDate(h.date)
                  const selected = tarihler.has(k)
                  const bugun = fmtDate(new Date()) === k
                  const dow = h.date.getDay()
                  const haftasonu = dow === 0 || dow === 6
                  return (
                    <button key={i} onClick={() => toggleTarih(h.date)}
                      style={{
                        padding: '6px 0', borderRadius: 5, border: 'none', cursor: 'pointer',
                        background: selected ? T.green : 'transparent',
                        color: selected ? '#fff' : (h.ayDisi ? '#cbd5e1' : haftasonu ? '#94a3b8' : T.text),
                        fontWeight: bugun ? 800 : 500,
                        fontSize: 12,
                        outline: bugun && !selected ? `2px solid ${T.green}` : undefined,
                        outlineOffset: -2,
                      }}>
                      {h.date.getDate()}
                    </button>
                  )
                })}
              </div>
            </div>

            {tarihler.size > 0 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxHeight: 80, overflowY: 'auto', borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
                {[...tarihler].sort().map(t => (
                  <span key={t} style={{ padding: '2px 8px', borderRadius: 999, background: T.greenLight, color: T.green, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {t.slice(8)}.{t.slice(5, 7)}
                    <X size={10} onClick={() => setTarihler(prev => { const s = new Set(prev); s.delete(t); return s })} style={{ cursor: 'pointer' }} />
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* /SAĞ SÜTUN */}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

function OzetPil({ ikon, sayi, etiket, renk, buyuk }: { ikon?: React.ReactNode; sayi: number; etiket: string; renk: string; buyuk?: boolean }) {
  return (
    <div style={{
      padding: buyuk ? '4px 14px' : '4px 12px',
      borderRadius: 8,
      background: renk + '0F',
      color: renk,
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      {ikon}
      <span style={{ fontSize: buyuk ? 20 : 16, fontWeight: 900, lineHeight: 1 }}>{sayi}</span>
      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{etiket}</span>
    </div>
  )
}

const hizliBtn: React.CSSProperties = {
  padding: '4px 8px',
  borderRadius: 6,
  border: `1px solid ${T.border}`,
  background: '#fff',
  cursor: 'pointer',
  fontSize: 11,
  fontWeight: 600,
}
