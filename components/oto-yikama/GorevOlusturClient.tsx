'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useToast } from '@/components/ui/ToastProvider'
import { Search, Loader2, Check, MapPin, Car, AlertTriangle } from 'lucide-react'

type Arac = {
  id: string
  plaka: string
  departman: string | null
  kullanici_adi_soyadi: string | null
  yikama_gunleri: number[] | null
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
  purple: '#7c3aed', purpleLight: '#f3e8ff',
}

const GUN_KISA = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

function bugunTRDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}

function fmtTRDate(s: string): string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return `${s.slice(8)}.${s.slice(5, 7)}.${s.slice(0, 4)}`
}

export default function GorevOlusturClient({ firmaId }: { firmaId: string }) {
  const router = useRouter()
  const { toast } = useToast()

  const [araclar, setAraclar] = useState<Arac[]>([])
  const [lokasyonlar, setLokasyonlar] = useState<Lokasyon[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [q, setQ] = useState('')
  const [filterDepartman, setFilterDepartman] = useState('')

  const [secilenArac, setSecilenArac] = useState<Arac | null>(null)
  const [secilenLokasyon, setSecilenLokasyon] = useState<string>('')
  const [olusturLoading, setOlusturLoading] = useState(false)

  const bugun = bugunTRDate()

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

  const altLokasyonlar = useMemo(() => lokasyonlar.filter(l => l.parent_id != null), [lokasyonlar])

  // Varsayılan istasyon — ilk alt
  useEffect(() => {
    if (!secilenLokasyon && altLokasyonlar.length > 0) {
      setSecilenLokasyon(altLokasyonlar[0].id)
    }
  }, [altLokasyonlar, secilenLokasyon])

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
        const hay = `${a.plaka} ${a.departman ?? ''} ${a.kullanici_adi_soyadi ?? ''}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [araclar, q, filterDepartman])

  async function olustur() {
    if (!secilenArac) {
      toast({ type: 'error', title: 'Hata', message: 'Plaka seçin' })
      return
    }
    if (!secilenLokasyon) {
      toast({ type: 'error', title: 'Hata', message: 'İstasyon seçin' })
      return
    }

    setOlusturLoading(true)
    try {
      const res = await fetch('/api/oto-yikama/gorevler/ekstra-olustur', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firma_id: firmaId,
          arac_id: secilenArac.id,
          lokasyon_id: secilenLokasyon,
        }),
      })
      const j = await res.json()
      if (!j.ok) {
        // Sunucu çakışma mesajını birebir gösterir
        toast({
          type: 'error',
          title: j.code === 'PLANLI_AKTIF_VAR' ? 'Ekstra görev oluşturulamadı' : 'Hata',
          message: j.error ?? 'Görev oluşturulamadı',
        })
        return
      }
      toast({
        type: 'success',
        title: 'Ekstra görev oluşturuldu',
        message: `${j.plaka} bugün için AÇIK durumda yıkamaya hazır.`,
      })
      setSecilenArac(null)
      router.refresh()
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

  if (altLokasyonlar.length === 0) {
    return (
      <div style={{ padding: '24px 28px' }}>
        <div className="verde-card" style={{ padding: 32, textAlign: 'center' }}>
          <MapPin size={32} color={T.amber} style={{ marginBottom: 8 }} />
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Önce Yıkama İstasyonları Oluşturun</h3>
          <p style={{ marginTop: 8, color: T.textSoft, fontSize: 13 }}>
            Görev oluşturmak için Yıkama İstasyonları sayfasından bir üst istasyon
            ve altına en az bir alt istasyon tanımlamış olmalısınız.
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
      {/* BİLGİ NOTU */}
      <div style={{
        padding: '10px 14px', borderRadius: 8,
        background: T.amberLight, border: `1px solid #fde68a`,
        display: 'flex', alignItems: 'flex-start', gap: 10,
      }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>ℹ️</span>
        <div style={{ flex: 1, fontSize: 12.5, color: '#78350f', lineHeight: 1.5 }}>
          <strong>Ekstra Görev Oluşturma</strong> — Planlı yıkamalar her gece otomatik üretilir.
          Bu sayfa <strong>kural dışı, anlık yıkama</strong> için: tek plaka, <strong>sadece bugün</strong> ({fmtTRDate(bugun)}), durum direkt AÇIK olarak oluşur ve canlı işlemlere düşer.
          Aynı plakaya bugün planlı/aktif görev varsa engellenir.
        </div>
      </div>

      {/* ÖZET BAR */}
      <div className="verde-card" style={{
        padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 11px', borderRadius: 8, background: T.purpleLight,
            color: T.purple, fontWeight: 800, fontSize: 13,
          }}>
            <Car size={14} /> EKSTRA
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.text }}>
            <span style={{ color: T.textSoft }}>Plaka:</span>
            <strong style={{ fontFamily: 'monospace', fontSize: 16 }}>
              {secilenArac?.plaka ?? '—'}
            </strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.text }}>
            <span style={{ color: T.textSoft }}>Tarih:</span>
            <strong>{fmtTRDate(bugun)} (bugün)</strong>
          </div>
        </div>
        <button onClick={olustur} disabled={!secilenArac || !secilenLokasyon || olusturLoading}
          style={{
            padding: '10px 22px', borderRadius: 8, border: 'none',
            background: secilenArac && secilenLokasyon && !olusturLoading
              ? 'linear-gradient(145deg, #16a34a, #15803d)'
              : '#cbd5e1',
            color: '#fff',
            cursor: secilenArac && secilenLokasyon && !olusturLoading ? 'pointer' : 'not-allowed',
            fontSize: 14, fontWeight: 800,
            boxShadow: secilenArac && secilenLokasyon ? '0 4px 12px rgba(22,163,74,0.25)' : 'none',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
          {olusturLoading
            ? <><Loader2 size={14} style={{ animation: 'spin 0.9s linear infinite' }} /> Oluşturuluyor…</>
            : <><Check size={14} /> Ekstra Görev Oluştur</>}
        </button>
      </div>

      {/* ANA İKİ KART: Plaka listesi (sol) + İstasyon (sağ) */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px',
        gap: 14, alignItems: 'start',
        minHeight: 'calc(100vh - 260px)',
      }}>
        {/* PLAKA LİSTESİ */}
        <div className="verde-card" style={{
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
          height: 'calc(100vh - 260px)',
        }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: T.blue + '14', color: T.blue, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13 }}>1</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Plaka Seç</div>
              <div style={{ marginLeft: 'auto', fontSize: 11, color: T.textSoft }}>{filtered.length} araç</div>
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
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 0 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: T.textSoft, fontSize: 13 }}>Sonuç yok.</div>
            ) : (
              <div>
                {filtered.map((a, idx) => {
                  const selected = secilenArac?.id === a.id
                  const gunler = Array.isArray(a.yikama_gunleri) ? a.yikama_gunleri : []
                  return (
                    <button key={a.id} type="button" onClick={() => setSecilenArac(selected ? null : a)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        border: 'none',
                        borderBottom: idx === filtered.length - 1 ? 'none' : `1px solid ${T.border}`,
                        borderLeft: `3px solid ${selected ? T.purple : 'transparent'}`,
                        background: selected ? T.purpleLight : '#fff',
                        cursor: 'pointer', textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: 12,
                      }}>
                      <span style={{
                        width: 18, height: 18, borderRadius: '50%',
                        border: `1.5px solid ${selected ? T.purple : '#cbd5e1'}`,
                        background: '#fff', position: 'relative', flexShrink: 0,
                      }}>
                        {selected && (
                          <span style={{
                            position: 'absolute', inset: 4, borderRadius: '50%', background: T.purple,
                          }} />
                        )}
                      </span>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 16, color: T.text, letterSpacing: '0.03em' }}>{a.plaka}</span>
                          {a.departman && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: T.blue, background: T.blueLight, padding: '1px 7px', borderRadius: 999 }}>
                              {a.departman}
                            </span>
                          )}
                        </div>
                        {a.kullanici_adi_soyadi && (
                          <div style={{ fontSize: 12, color: T.textSoft, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.kullanici_adi_soyadi}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center' }}>
                        {gunler.length === 0 ? (
                          <span style={{ fontSize: 11, color: T.textSoft, fontStyle: 'italic' }}>Plansız</span>
                        ) : (
                          [...gunler].sort((x, y) => x - y).map(g => (
                            <span key={g} style={{
                              fontSize: 11, fontWeight: 700,
                              padding: '2px 7px', borderRadius: 5,
                              background: T.amberLight, color: T.amber,
                            }}>
                              {GUN_KISA[g - 1] ?? g}
                            </span>
                          ))
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* İSTASYON SEÇ */}
        <div className="verde-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: T.amber + '14', color: T.amber, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 13 }}>2</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>İstasyon Seç</div>
            </div>
            <p style={{ margin: '6px 0 0', fontSize: 11.5, color: T.textSoft }}>
              Yıkamanın yapılacağı istasyon
            </p>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {altLokasyonlar.map(l => {
              const active = secilenLokasyon === l.id
              return (
                <button key={l.id} type="button" onClick={() => setSecilenLokasyon(l.id)}
                  style={{
                    padding: '10px 12px', borderRadius: 7,
                    border: `1.5px solid ${active ? T.amber : T.border}`,
                    background: active ? T.amberLight : '#fff',
                    cursor: 'pointer', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: '50%',
                    border: `2px solid ${active ? T.amber : '#cbd5e1'}`,
                    background: '#fff', position: 'relative', flexShrink: 0,
                  }}>
                    {active && (
                      <span style={{
                        position: 'absolute', inset: 3, borderRadius: '50%', background: T.amber,
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
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
