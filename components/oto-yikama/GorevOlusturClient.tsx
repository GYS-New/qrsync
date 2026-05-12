'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { ChevronLeft, ChevronRight, Search, X, Calendar, Car, MapPin, Loader2 } from 'lucide-react'

type Arac = {
  id: string
  plaka: string
  marka: string | null
  model: string | null
  departman: string | null
  kullanici_adi_soyadi: string | null
  aktif: boolean
}

type Istasyon = {
  id: string
  ad: string
  aktif: boolean
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  grayLight: '#f8fafc',
}

// 'YYYY-MM-DD' formatında (yerel saat, UTC kayması yok)
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

export default function GorevOlusturClient({ firmaId }: { firmaId: string }) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [araclar, setAraclar] = useState<Arac[]>([])
  const [istasyonlar, setIstasyonlar] = useState<Istasyon[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)

  const [q, setQ] = useState('')
  const [filterDepartman, setFilterDepartman] = useState('')

  // Seçim state: arac_id -> istasyon_id
  const [secimMap, setSecimMap] = useState<Map<string, string>>(new Map())
  const [tarihler, setTarihler] = useState<Set<string>>(new Set())
  const [ayBaslangic, setAyBaslangic] = useState(() => startOfMonth(new Date()))
  const [olusturLoading, setOlusturLoading] = useState(false)

  async function yukle() {
    setYukleniyor(true)
    try {
      const [aracRes, istRes] = await Promise.all([
        fetch(`/api/oto-yikama/araclar?firma_id=${firmaId}&aktif=true`, { cache: 'no-store' }),
        fetch(`/api/oto-yikama/istasyonlar?firma_id=${firmaId}&aktif=true`, { cache: 'no-store' }),
      ])
      const aracJ = await aracRes.json()
      const istJ = await istRes.json()
      if (!aracJ.ok) throw new Error(aracJ.error)
      if (!istJ.ok) throw new Error(istJ.error)
      setAraclar(aracJ.data)
      setIstasyonlar(istJ.data)
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

  const varsayilanIstasyon = istasyonlar[0]?.id ?? ''

  function toggleArac(a: Arac) {
    setSecimMap(prev => {
      const m = new Map(prev)
      if (m.has(a.id)) m.delete(a.id)
      else m.set(a.id, varsayilanIstasyon)
      return m
    })
  }

  function setIstasyon(aracId: string, istId: string) {
    setSecimMap(prev => {
      const m = new Map(prev)
      m.set(aracId, istId)
      return m
    })
  }

  function tumunuSec() {
    setSecimMap(prev => {
      const m = new Map(prev)
      for (const a of filtered) if (!m.has(a.id)) m.set(a.id, varsayilanIstasyon)
      return m
    })
  }
  function temizleSecim() { setSecimMap(new Map()) }

  function tumIstasyon(istId: string) {
    setSecimMap(prev => {
      const m = new Map<string, string>()
      for (const [k] of prev) m.set(k, istId)
      return m
    })
  }

  // Takvim
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

  // Takvim grid (mevcut ay)
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

  // Atama listesi (sadece seçili araçlar)
  const atamaListesi = useMemo(() => {
    const ids = [...secimMap.keys()]
    return araclar.filter(a => ids.includes(a.id))
  }, [araclar, secimMap])

  const beklenenGorev = atamaListesi.length * tarihler.size

  async function olustur() {
    if (atamaListesi.length === 0) { toast({ type: 'error', title: 'Hata', message: 'En az bir plaka seçin' }); return }
    if (tarihler.size === 0) { toast({ type: 'error', title: 'Hata', message: 'En az bir tarih seçin' }); return }
    const eksikIstasyon = atamaListesi.find(a => !secimMap.get(a.id))
    if (eksikIstasyon) { toast({ type: 'error', title: 'Hata', message: `${eksikIstasyon.plaka} için istasyon seçilmedi` }); return }

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
          atamalar: atamaListesi.map(a => ({ arac_id: a.id, istasyon_id: secimMap.get(a.id) })),
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
      // Başarılıysa seçimleri temizle
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

  if (yukleniyor) {
    return (
      <div style={{ padding: '60px 28px', textAlign: 'center', color: T.textSoft }}>
        <Loader2 size={28} style={{ animation: 'spin 0.9s linear infinite' }} />
        <div style={{ marginTop: 8 }}>Yükleniyor…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (istasyonlar.length === 0) {
    return (
      <div style={{ padding: '24px 28px' }}>
        <div className="verde-card" style={{ padding: 32, textAlign: 'center' }}>
          <MapPin size={32} color={T.amber} style={{ marginBottom: 8 }} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Önce İstasyon Tanımlayın</h3>
          <p style={{ marginTop: 8, color: T.textSoft, fontSize: 13 }}>
            Görev oluşturmak için en az bir aktif yıkama istasyonu gerekli.
          </p>
          <a href="/sa/dashboard/oto-yikama/istasyonlar"
            style={{ display: 'inline-block', marginTop: 14, padding: '8px 18px', borderRadius: 8, background: T.text, color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
            İstasyonlara Git
          </a>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 28px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 16, alignItems: 'start' }}>
      {/* SOL: Plaka seçim + atama */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Plaka filtre + tümünü seç */}
        <div className="verde-card" style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Search size={14} color={T.textSoft} />
          <input className="verde-input" placeholder="Plaka, kullanıcı, departman ara…"
            value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <select className="verde-select" value={filterDepartman} onChange={e => setFilterDepartman(e.target.value)} style={{ width: 160 }}>
            <option value="">Departman (Tümü)</option>
            {departmanlar.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <button onClick={tumunuSec}
            style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            Tümünü Seç ({filtered.length})
          </button>
          <button onClick={temizleSecim}
            style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            Temizle
          </button>
        </div>

        {/* Plaka tablosu */}
        <div className="verde-card" style={{ overflow: 'hidden' }}>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            <table className="verde-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>Plaka</th>
                  <th>Kullanıcı</th>
                  <th>Departman</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: T.textSoft }}>Sonuç yok</td></tr>
                ) : filtered.map(a => {
                  const selected = secimMap.has(a.id)
                  return (
                    <tr key={a.id}
                      onClick={() => toggleArac(a)}
                      style={{ cursor: 'pointer', background: selected ? T.blueLight : undefined }}>
                      <td><input type="checkbox" checked={selected} readOnly /></td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{a.plaka}</td>
                      <td style={{ color: T.textSoft }}>{a.kullanici_adi_soyadi ?? '—'}</td>
                      <td style={{ color: T.textSoft }}>{a.departman ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Atama tablosu (sadece seçili) */}
        {atamaListesi.length > 0 && (
          <div className="verde-card" style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: T.text }}>
                <Car size={14} /> Atamalar ({atamaListesi.length})
              </div>
              {istasyonlar.length > 1 && (
                <div style={{ display: 'flex', gap: 6 }}>
                  {istasyonlar.map(i => (
                    <button key={i.id} onClick={() => tumIstasyon(i.id)}
                      style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 11 }}>
                      Tümünü → {i.ad}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              <table className="verde-table">
                <thead>
                  <tr>
                    <th>Plaka</th>
                    <th>Kullanıcı</th>
                    <th style={{ width: 180 }}>İstasyon</th>
                    <th style={{ width: 32 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {atamaListesi.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{a.plaka}</td>
                      <td style={{ color: T.textSoft, fontSize: 12 }}>{a.kullanici_adi_soyadi ?? '—'}</td>
                      <td>
                        <select className="verde-select" value={secimMap.get(a.id) ?? ''}
                          onChange={e => setIstasyon(a.id, e.target.value)}
                          style={{ width: '100%', padding: '3px 6px', fontSize: 12 }}>
                          {istasyonlar.map(i => <option key={i.id} value={i.id}>{i.ad}</option>)}
                        </select>
                      </td>
                      <td>
                        <button onClick={() => toggleArac(a)} title="Kaldır"
                          style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: T.red }}>
                          <X size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* SAĞ: Takvim + özet + buton */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 16 }}>
        <div className="verde-card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 13, fontWeight: 700 }}>
            <Calendar size={14} /> Tarihler
            <span style={{ marginLeft: 'auto', color: T.textSoft, fontWeight: 500 }}>{tarihler.size} gün seçili</span>
          </div>

          {/* Hızlı seçim */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
            <button onClick={() => hizliSec(1, 'bugun')} style={hizliBtn}>Bugün</button>
            <button onClick={() => hizliSec(1, 'yarin')} style={hizliBtn}>Yarın</button>
            <button onClick={() => hizliSec(7)} style={hizliBtn}>7 gün</button>
            <button onClick={() => hizliSec(30)} style={hizliBtn}>30 gün</button>
            <button onClick={buAyHaftaIciSec} style={hizliBtn}>Hafta içi</button>
            <button onClick={() => setTarihler(new Set())} style={{ ...hizliBtn, color: T.red }}>Temizle</button>
          </div>

          {/* Ay nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button onClick={() => setAyBaslangic(new Date(ayBaslangic.getFullYear(), ayBaslangic.getMonth() - 1, 1))}
              style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: T.text }}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {AY_ADLARI[ayBaslangic.getMonth()]} {ayBaslangic.getFullYear()}
            </div>
            <button onClick={() => setAyBaslangic(new Date(ayBaslangic.getFullYear(), ayBaslangic.getMonth() + 1, 1))}
              style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: T.text }}>
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Takvim grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {GUN_ADLARI.map(g => (
              <div key={g} style={{ padding: 4, textAlign: 'center', fontSize: 11, fontWeight: 700, color: T.textSoft }}>{g}</div>
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
                    padding: '6px 0', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: selected ? T.blue : 'transparent',
                    color: selected ? '#fff' : (h.ayDisi ? '#cbd5e1' : haftasonu ? '#94a3b8' : T.text),
                    fontWeight: bugun ? 800 : 500,
                    fontSize: 12,
                    outline: bugun && !selected ? `2px solid ${T.blue}` : undefined,
                    outlineOffset: -2,
                  }}>
                  {h.date.getDate()}
                </button>
              )
            })}
          </div>

          {/* Seçili tarihler badge'leri */}
          {tarihler.size > 0 && (
            <div style={{ marginTop: 10, display: 'flex', gap: 4, flexWrap: 'wrap', maxHeight: 80, overflowY: 'auto' }}>
              {[...tarihler].sort().map(t => (
                <span key={t} style={{ padding: '2px 6px', borderRadius: 999, background: T.blueLight, color: T.blue, fontSize: 11, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  {t}
                  <X size={10} onClick={() => setTarihler(prev => { const s = new Set(prev); s.delete(t); return s })} style={{ cursor: 'pointer' }} />
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Özet + Oluştur */}
        <div className="verde-card" style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
            <div style={{ padding: 10, background: T.grayLight, borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: T.text }}>{atamaListesi.length}</div>
              <div style={{ fontSize: 10, color: T.textSoft, marginTop: 2 }}>Plaka</div>
            </div>
            <div style={{ padding: 10, background: T.grayLight, borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: T.text }}>{tarihler.size}</div>
              <div style={{ fontSize: 10, color: T.textSoft, marginTop: 2 }}>Tarih</div>
            </div>
            <div style={{ padding: 10, background: beklenenGorev > 0 ? T.blueLight : T.grayLight, borderRadius: 8, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: beklenenGorev > 0 ? T.blue : T.textSoft }}>{beklenenGorev}</div>
              <div style={{ fontSize: 10, color: T.textSoft, marginTop: 2 }}>Görev</div>
            </div>
          </div>
          <button onClick={olustur} disabled={beklenenGorev === 0 || olusturLoading}
            style={{
              width: '100%', padding: '12px', borderRadius: 8, border: 'none',
              background: beklenenGorev > 0 && !olusturLoading ? T.text : '#cbd5e1',
              color: '#fff', cursor: beklenenGorev > 0 && !olusturLoading ? 'pointer' : 'not-allowed',
              fontSize: 14, fontWeight: 800,
            }}>
            {olusturLoading ? 'Oluşturuluyor…' : `${beklenenGorev} Görev Oluştur`}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
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
