'use client'

import { useEffect, useMemo, useState } from 'react'
import Topbar from '@/components/layout/Topbar'
import { useFirma } from '@/components/layout/FirmaContext'
import { RefreshCw, Star } from 'lucide-react'

interface Kayit {
  id: string
  lokasyon_id: string
  lokasyon_tanim: string
  kanal: 'QR' | 'NFC'
  yildiz: number
  yorum: string | null
  ad_soyad: string | null
  gorsel_url: string | null
  olusturma_tarihi: string
}

interface Props {
  base: string
  isSA: boolean
  initialFirmaId?: string | null
  projeId?: string | null
}

const YILDIZ_ETIKET = ['', 'Çok Kötü', 'Kötü', 'Orta', 'İyi', 'Mükemmel']

const YILDIZ_RENK: Record<number, { bg: string; text: string }> = {
  1: { bg: '#fee2e2', text: '#991b1b' },
  2: { bg: '#fef3c7', text: '#92400e' },
  3: { bg: '#f1f5f9', text: '#475569' },
  4: { bg: '#dcfce7', text: '#166534' },
  5: { bg: '#d1fae5', text: '#065f46' },
}

function YildizStar({ n, dolu }: { n: number; dolu: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" style={{ display: 'inline' }}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={dolu ? '#f59e0b' : '#e2e8f0'} stroke={dolu ? '#d97706' : '#cbd5e1'} strokeWidth="1" />
    </svg>
  )
}

function YildizRow({ yildiz }: { yildiz: number }) {
  const { bg, text } = YILDIZ_RENK[yildiz] ?? YILDIZ_RENK[3]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, background: bg }}>
      {[1,2,3,4,5].map(n => <YildizStar key={n} n={n} dolu={n <= yildiz} />)}
      <span style={{ fontSize: 11.5, fontWeight: 700, color: text, marginLeft: 2 }}>{YILDIZ_ETIKET[yildiz]}</span>
    </span>
  )
}

export default function MusteriDegerlendirmeRaporClient({ base, isSA, initialFirmaId, projeId }: Props) {
  const { firmaId: saFirmaId } = useFirma()
  const firmaId = isSA ? saFirmaId : (initialFirmaId ?? null)

  const [kayitlar, setKayitlar]     = useState<Kayit[]>([])
  const [loading, setLoading]       = useState(false)
  const [baslangic, setBaslangic]   = useState('')
  const [bitis, setBitis]           = useState('')
  const [filtreYildiz, setFiltreYildiz] = useState(0)
  const [filtreKanal, setFiltreKanal]   = useState<'TUMU' | 'QR' | 'NFC'>('TUMU')
  const [gorselModal, setGorselModal]   = useState<string | null>(null)

  const spinning = { animation: 'spin 0.9s linear infinite' }

  async function yukle() {
    if (!firmaId) return
    setLoading(true)
    try {
      const p = new URLSearchParams({ firma_id: firmaId })
      if (projeId) p.set('proje_id', projeId)
      if (baslangic) p.set('baslangic', baslangic)
      if (bitis) p.set('bitis', bitis)
      const res = await fetch(`/api/raporlar/musteri-degerlendirme?${p}`, { cache: 'no-store' })
      const json = await res.json()
      if (json.ok) setKayitlar(json.data)
    } finally { setLoading(false) }
  }

  useEffect(() => { yukle() }, [firmaId, projeId])

  const filtreliKayitlar = useMemo(() => {
    return kayitlar.filter(k => {
      if (filtreYildiz && k.yildiz !== filtreYildiz) return false
      if (filtreKanal !== 'TUMU' && k.kanal !== filtreKanal) return false
      return true
    })
  }, [kayitlar, filtreYildiz, filtreKanal])

  // Özet istatistikler
  const ozet = useMemo(() => {
    if (!filtreliKayitlar.length) return null
    const toplam    = filtreliKayitlar.length
    const ortYildiz = filtreliKayitlar.reduce((s, k) => s + k.yildiz, 0) / toplam
    const dagilim   = [1,2,3,4,5].map(n => ({ yildiz: n, sayi: filtreliKayitlar.filter(k => k.yildiz === n).length }))
    const yorumlu   = filtreliKayitlar.filter(k => k.yorum).length
    const gorsellli = filtreliKayitlar.filter(k => k.gorsel_url).length
    return { toplam, ortYildiz, dagilim, yorumlu, gorsellli }
  }, [filtreliKayitlar])

  const td = (extra?: React.CSSProperties): React.CSSProperties => ({
    padding: '10px 14px', borderBottom: '1px solid #e8f0e8',
    fontSize: 13, verticalAlign: 'top', ...extra,
  })

  return (
    <div>
      <Topbar title="Müşteri Değerlendirmeleri" base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi', href: `${base}/dashboard/raporlar` }, { label: 'Müşteri Değerlendirmeleri' }]} />

      <div style={{ padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Filtreler */}
        <div className="verde-card" style={{ padding: '14px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <h2 style={{ fontSize: 15, fontWeight: 900, color: '#0f1a0f', margin: 0 }}>Müşteri Değerlendirmeleri</h2>
            <button onClick={yukle} disabled={loading || !firmaId}
              style={{ height: 34, padding: '0 14px', borderRadius: 8, border: '1px solid #d6e4d6', background: '#f0f9f0', color: '#1f6b1f', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12.5 }}>
              <RefreshCw size={13} style={loading ? spinning : {}} />
              {loading ? 'Yükleniyor…' : 'Yenile'}
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {[
              { label: 'Başlangıç', node: <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, width: '100%' }} /> },
              { label: 'Bitiş', node: <input type="date" value={bitis} onChange={e => setBitis(e.target.value)} style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, width: '100%' }} /> },
              { label: 'Yıldız', node: (
                <select value={filtreYildiz} onChange={e => setFiltreYildiz(Number(e.target.value))}
                  style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, width: '100%', background: '#fff' }}>
                  <option value={0}>Tümü</option>
                  {[5,4,3,2,1].map(n => <option key={n} value={n}>{'★'.repeat(n)} — {YILDIZ_ETIKET[n]}</option>)}
                </select>
              )},
              { label: 'Kanal', node: (
                <select value={filtreKanal} onChange={e => setFiltreKanal(e.target.value as any)}
                  style={{ height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, width: '100%', background: '#fff' }}>
                  <option value="TUMU">Tümü</option>
                  <option value="QR">QR</option>
                  <option value="NFC">NFC</option>
                </select>
              )},
            ].map(({ label, node }) => (
              <label key={label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                {node}
              </label>
            ))}
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button onClick={yukle} disabled={loading || !firmaId}
                style={{ height: 34, padding: '0 16px', borderRadius: 8, border: 'none', background: '#1f6b1f', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, width: '100%' }}>
                Uygula
              </button>
            </div>
          </div>
        </div>

        {/* Özet kartları */}
        {ozet && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10 }}>
            {[
              { label: 'Toplam', val: ozet.toplam, color: '#0f1a0f' },
              { label: 'Ort. Puan', val: ozet.ortYildiz.toFixed(1) + ' ★', color: '#d97706' },
              { label: 'Yorumlu', val: ozet.yorumlu, color: '#1f6b1f' },
              { label: 'Fotoğraflı', val: ozet.gorsellli, color: '#5a46d1' },
            ].map(({ label, val, color }) => (
              <div key={label} className="verde-card" style={{ padding: '14px 16px' }}>
                <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>{label}</div>
              </div>
            ))}
            {/* Dağılım */}
            <div className="verde-card" style={{ padding: '12px 16px', gridColumn: 'span 2' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Puan Dağılımı</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[5,4,3,2,1].map(n => {
                  const sayi  = ozet.dagilim.find(d => d.yildiz === n)?.sayi ?? 0
                  const oran  = ozet.toplam > 0 ? (sayi / ozet.toplam) * 100 : 0
                  const { bg } = YILDIZ_RENK[n]
                  return (
                    <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11.5, color: '#64748b', width: 12, flexShrink: 0 }}>{n}</span>
                      <Star size={11} color="#f59e0b" fill="#f59e0b" />
                      <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${oran}%`, background: bg === '#d1fae5' ? '#10b981' : bg === '#dcfce7' ? '#34d399' : bg === '#fee2e2' ? '#ef4444' : bg === '#fef3c7' ? '#f59e0b' : '#94a3b8', borderRadius: 4, transition: 'width .4s ease' }} />
                      </div>
                      <span style={{ fontSize: 11.5, color: '#64748b', width: 20, textAlign: 'right' as const }}>{sayi}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tablo */}
        <div className="verde-card" style={{ overflow: 'hidden' }}>
          {!firmaId ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>Firma seçin</div>
          ) : loading ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
              <RefreshCw size={24} style={{ ...spinning, margin: '0 auto 12px', display: 'block', color: '#2e8b2e' }} />
              Yükleniyor…
            </div>
          ) : filtreliKayitlar.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⭐</div>
              Henüz değerlendirme yok
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#1f6b1f' }}>
                    {['Tarih', 'Lokasyon', 'Kanal', 'Puan', 'Yorum', 'Ad Soyad', 'Fotoğraf'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', color: '#fff', fontWeight: 700, fontSize: 12, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtreliKayitlar.map((k, i) => (
                    <tr key={k.id} style={{ background: i % 2 === 0 ? '#f8fafc' : '#fff' }}>
                      <td style={td({ whiteSpace: 'nowrap', color: '#64748b' })}>
                        {new Date(k.olusturma_tarihi).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={td({ fontWeight: 600, color: '#0f1a0f' })}>{k.lokasyon_tanim}</td>
                      <td style={td()}>
                        <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: 11.5, fontWeight: 700, background: k.kanal === 'QR' ? '#e0f2fe' : '#f0fdf4', color: k.kanal === 'QR' ? '#0369a1' : '#166534' }}>
                          {k.kanal}
                        </span>
                      </td>
                      <td style={td()}><YildizRow yildiz={k.yildiz} /></td>
                      <td style={td({ maxWidth: 280, color: '#334155' })}>
                        {k.yorum ? (
                          <span title={k.yorum} style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>
                            {k.yorum}
                          </span>
                        ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                      <td style={td({ color: k.ad_soyad ? '#0f1a0f' : '#cbd5e1' })}>
                        {k.ad_soyad || '—'}
                      </td>
                      <td style={td()}>
                        {k.gorsel_url ? (
                          <button onClick={() => setGorselModal(k.gorsel_url!)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                            <img src={k.gorsel_url} alt="Görsel" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid #e2e8f0' }} />
                          </button>
                        ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Görsel modal */}
      {gorselModal && (
        <div onClick={() => setGorselModal(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <img src={gorselModal} alt="Büyük görsel"
            style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 8px 40px rgba(0,0,0,0.4)' }} />
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
