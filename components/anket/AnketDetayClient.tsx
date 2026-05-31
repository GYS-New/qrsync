'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Topbar from '@/components/layout/Topbar'
import { useToast } from '@/components/ui/ToastProvider'
import { Download, Trash2, Lock, Unlock, ArrowLeft, RefreshCw } from 'lucide-react'

type Cevap = {
  id: string
  cevaplandi: string
  user_id: string
  isim: string
  firma_adi: string
  cevap: string
  aciklama: string | null
  cihaz_id: string
  cihaz_modeli: string
  network_type: string | null
}
type Detay = {
  anket: {
    id: string; baslik: string; soru: string; tip: string; secenekler: string[] | null
    hedef_user_ids: string[]; hedef_firma_ids: string[]
    son_gecerli: string | null; aciklama_iste: boolean; durum: 'aktif' | 'kapali' | 'taslak'
    olusturuldu: string
  }
  gonderen: { id: string; isim: string } | null
  hedef_firmalar: { id: string; firma_adi: string; personel_sayisi: number }[]
  hedef_kisiler: { id: string; isim: string; firma_adi: string }[]
  hedef_sayisi: number
  cevap_sayisi: number
  cevaplar: Cevap[]
  cevap_dagilim: Record<string, number>
  network_kirilimi: Record<string, Record<string, number>>
  eksik_users: { id: string; isim: string; firma_adi: string }[]
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  gray: '#475569', grayLight: '#f8fafc',
}

const DURUM_RENK: Record<string, { bg: string; fg: string; label: string }> = {
  aktif: { bg: T.greenLight, fg: T.green, label: 'Aktif' },
  kapali: { bg: T.redLight, fg: T.red, label: 'Kapalı' },
  taslak: { bg: T.amberLight, fg: T.amber, label: 'Taslak' },
}

function fmtTarih(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return '—' }
}

export default function AnketDetayClient({ base, anketId }: { base: string; anketId: string }) {
  const { toast } = useToast()
  const [data, setData] = useState<Detay | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtreNetwork, setFiltreNetwork] = useState<string>('')
  const [filtreCevap, setFiltreCevap] = useState<string>('')

  async function yukle() {
    setLoading(true)
    try {
      const r = await fetch(`/api/sa/anketler/${anketId}`, { cache: 'no-store' })
      const j = await r.json()
      if (j.ok) setData(j)
      else toast({ type: 'error', title: 'Hata', message: j.error ?? 'Yüklenemedi' })
    } finally { setLoading(false) }
  }
  useEffect(() => { yukle() }, [anketId])

  async function durumDegistir(yeni: 'aktif' | 'kapali' | 'taslak') {
    const r = await fetch(`/api/sa/anketler/${anketId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durum: yeni }),
    })
    const j = await r.json()
    if (j.ok) { toast({ type: 'success', title: 'Güncellendi', message: `Durum: ${yeni}` }); yukle() }
    else toast({ type: 'error', title: 'Hata', message: j.error })
  }

  async function sil() {
    if (!confirm('Bu anket ve tüm cevapları silinecek. Emin misin?')) return
    const r = await fetch(`/api/sa/anketler/${anketId}`, { method: 'DELETE' })
    const j = await r.json()
    if (j.ok) {
      toast({ type: 'success', title: 'Silindi', message: '' })
      window.location.href = `${base}/dashboard/anketler`
    } else toast({ type: 'error', title: 'Hata', message: j.error })
  }

  const cevaplarFiltrelenmis = useMemo(() => {
    if (!data) return []
    return data.cevaplar.filter(c => {
      if (filtreNetwork && (c.network_type ?? 'bilinmiyor') !== filtreNetwork) return false
      if (filtreCevap && c.cevap !== filtreCevap) return false
      return true
    })
  }, [data, filtreNetwork, filtreCevap])

  function exportCSV() {
    if (!data) return
    const header = ['Kişi', 'Firma', 'Cevap', 'Açıklama', 'Network', 'Cihaz', 'Cevap Tarihi']
    const lines = [header.join(';')]
    for (const c of cevaplarFiltrelenmis) {
      lines.push([
        `"${(c.isim ?? '').replace(/"/g, '""')}"`,
        `"${(c.firma_adi ?? '').replace(/"/g, '""')}"`,
        `"${(c.cevap ?? '').replace(/"/g, '""')}"`,
        `"${(c.aciklama ?? '').replace(/"/g, '""')}"`,
        c.network_type ?? '',
        `"${(c.cihaz_modeli ?? '').replace(/"/g, '""').slice(0, 80)}"`,
        fmtTarih(c.cevaplandi),
      ].join(';'))
    }
    const csv = '﻿' + lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `anket-cevaplari_${data.anket.id.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  if (loading && !data) return <div style={{ padding: 40, color: T.textSoft }}>Yükleniyor…</div>
  if (!data) return <div style={{ padding: 40, color: T.red }}>Anket bulunamadı</div>

  const a = data.anket
  const oran = data.hedef_sayisi > 0 ? Math.round((data.cevap_sayisi / data.hedef_sayisi) * 100) : 0
  const networkler = Object.keys(data.network_kirilimi).sort()
  const distinctCevaplar = Object.keys(data.cevap_dagilim).sort()

  return (
    <div>
      <Topbar title={a.baslik} base={base}
        breadcrumbs={[
          { label: 'Yönetim' },
          { label: 'Mobil Anketler', href: `${base}/dashboard/anketler` },
          { label: a.baslik },
        ]} />

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Üst aksiyon bandı */}
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href={`${base}/dashboard/anketler`} style={{ textDecoration: 'none' }}>
            <button style={btnSecondary}><ArrowLeft size={13} /> Geri</button>
          </Link>
          <button onClick={yukle} style={btnSecondary}><RefreshCw size={13} /> Yenile</button>
          {a.durum === 'aktif' ? (
            <button onClick={() => durumDegistir('kapali')} style={btnSecondary}><Lock size={13} /> Kapat</button>
          ) : (
            <button onClick={() => durumDegistir('aktif')} style={btnSecondary}><Unlock size={13} /> Aktif Et</button>
          )}
          <button onClick={exportCSV} disabled={cevaplarFiltrelenmis.length === 0}
            style={{ ...btnSecondary, opacity: cevaplarFiltrelenmis.length === 0 ? 0.5 : 1 }}>
            <Download size={13} /> CSV
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={sil} style={{ ...btnSecondary, color: T.red, borderColor: T.redLight }}>
            <Trash2 size={13} /> Sil
          </button>
        </div>

        {/* Başlık + özet */}
        <div className="verde-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 4 }}>{a.baslik}</div>
              <div style={{ fontSize: 14, color: T.textSoft, fontStyle: 'italic' }}>"{a.soru}"</div>
            </div>
            <Badge text={DURUM_RENK[a.durum].label} bg={DURUM_RENK[a.durum].bg} fg={DURUM_RENK[a.durum].fg} />
          </div>

          {/* Gönderen + alıcılar bilgi satırı */}
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            <div style={{ minWidth: 180 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Gönderen
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 26, height: 26, borderRadius: 999, background: T.blueLight, color: T.blue, display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 12 }}>
                  {(data.gonderen?.isim ?? '?').split(' ').slice(0,2).map(s => s[0]?.toUpperCase()).join('')}
                </span>
                {data.gonderen?.isim ?? '—'}
              </div>
              <div style={{ fontSize: 11, color: T.textSoft, marginTop: 2 }}>
                {fmtTarih(a.olusturuldu)}
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                Alıcılar
              </div>
              {data.hedef_firmalar.length === 0 && data.hedef_kisiler.length === 0 ? (
                <div style={{ fontSize: 13, color: T.textSoft, fontStyle: 'italic' }}>— hedef yok —</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.hedef_firmalar.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {data.hedef_firmalar.map(f => (
                        <span key={f.id} style={{ padding: '3px 10px', borderRadius: 999, background: T.blueLight, color: T.blue, fontSize: 12, fontWeight: 700 }}>
                          🏢 {f.firma_adi} <span style={{ opacity: 0.7, fontWeight: 400 }}>({f.personel_sayisi})</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {data.hedef_kisiler.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {data.hedef_kisiler.map(u => (
                        <span key={u.id} title={u.firma_adi}
                          style={{ padding: '3px 10px', borderRadius: 999, background: T.greenLight, color: T.green, fontSize: 12, fontWeight: 600 }}>
                          👤 {u.isim}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 14 }}>
            <KpiKart label="Hedef" value={String(data.hedef_sayisi)} color={T.gray} />
            <KpiKart label="Cevap" value={String(data.cevap_sayisi)} color={T.green} />
            <KpiKart label="Oran" value={`%${oran}`} color={oran >= 50 ? T.green : oran >= 25 ? T.amber : T.red} />
            <KpiKart label="Son Geçerlilik" value={a.son_gecerli ? fmtTarih(a.son_gecerli) : 'Sınırsız'} color={T.blue} small />
          </div>
        </div>

        {/* Cevap dağılımı */}
        {distinctCevaplar.length > 0 && (
          <div className="verde-card" style={{ padding: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: T.gray, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
              Cevap Dağılımı
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {distinctCevaplar.map(cv => {
                const sayi = data.cevap_dagilim[cv]
                const pct = data.cevap_sayisi > 0 ? Math.round((sayi / data.cevap_sayisi) * 100) : 0
                return (
                  <div key={cv} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 140, fontSize: 13, fontWeight: 600, color: T.text }}>{cv}</div>
                    <div style={{ flex: 1, height: 22, background: T.grayLight, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: T.green, transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ width: 80, textAlign: 'right', fontSize: 13, fontWeight: 700, color: T.text }}>
                      {sayi} (%{pct})
                    </div>
                  </div>
                )
              })}
              {data.eksik_users.length > 0 && (
                <div style={{ fontSize: 12, color: T.textSoft, marginTop: 4 }}>
                  Cevaplanmamış: <strong>{data.eksik_users.length}</strong> kişi
                </div>
              )}
            </div>
          </div>
        )}

        {/* Network kırılımı */}
        {networkler.length > 0 && (
          <div className="verde-card" style={{ padding: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: T.gray, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
              Network Type Kırılımı (5G analizi)
            </div>
            <div style={{ fontSize: 11, color: T.textSoft, marginBottom: 10 }}>
              Mobil tarafı cevap anındaki bağlantı türünü kaydeder.
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: T.grayLight, borderBottom: `1px solid ${T.border}` }}>
                  <th style={thSm}>Network</th>
                  {distinctCevaplar.map(cv => (
                    <th key={cv} style={{ ...thSm, textAlign: 'center' }}>{cv}</th>
                  ))}
                  <th style={{ ...thSm, textAlign: 'center' }}>Toplam</th>
                </tr>
              </thead>
              <tbody>
                {networkler.map(nt => {
                  const row = data.network_kirilimi[nt]
                  const top = Object.values(row).reduce((s, v) => s + v, 0)
                  return (
                    <tr key={nt} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={tdSm}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: T.blue }}>{nt}</span>
                      </td>
                      {distinctCevaplar.map(cv => (
                        <td key={cv} style={{ ...tdSm, textAlign: 'center', fontWeight: row[cv] ? 700 : 400, color: row[cv] ? T.text : T.textSoft }}>
                          {row[cv] ?? 0}
                        </td>
                      ))}
                      <td style={{ ...tdSm, textAlign: 'center', fontWeight: 800 }}>{top}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Kişi bazlı cevaplar */}
        <div className="verde-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: T.gray, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Kişi Bazlı Cevaplar ({cevaplarFiltrelenmis.length})
            </div>
            <div style={{ flex: 1 }} />
            {distinctCevaplar.length > 0 && (
              <select value={filtreCevap} onChange={e => setFiltreCevap(e.target.value)}
                style={{ height: 30, padding: '0 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12 }}>
                <option value="">Cevap (tümü)</option>
                {distinctCevaplar.map(cv => <option key={cv} value={cv}>{cv}</option>)}
              </select>
            )}
            {networkler.length > 0 && (
              <select value={filtreNetwork} onChange={e => setFiltreNetwork(e.target.value)}
                style={{ height: 30, padding: '0 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 12 }}>
                <option value="">Network (tümü)</option>
                {networkler.map(nt => <option key={nt} value={nt}>{nt}</option>)}
              </select>
            )}
          </div>

          {cevaplarFiltrelenmis.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: T.textSoft, fontSize: 13 }}>
              Henüz cevap yok.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cevaplarFiltrelenmis.map(c => (
                <div key={c.id} style={{ padding: 12, border: `1px solid ${T.border}`, borderRadius: 8, background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 700, color: T.text, fontSize: 13 }}>
                      {c.isim} <span style={{ color: T.textSoft, fontWeight: 500 }}>({c.firma_adi})</span>
                    </div>
                    <div style={{ fontSize: 11, color: T.textSoft }}>{fmtTarih(c.cevaplandi)}</div>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    <strong style={{ color: T.green }}>Cevap:</strong>{' '}
                    <span style={{ color: T.text, fontWeight: 600 }}>{c.cevap}</span>
                  </div>
                  {c.aciklama && (
                    <div style={{ marginTop: 4, fontSize: 12.5, color: T.text, fontStyle: 'italic' }}>
                      <strong style={{ color: T.textSoft, fontStyle: 'normal' }}>Açıklama:</strong> "{c.aciklama}"
                    </div>
                  )}
                  <div style={{ marginTop: 6, display: 'flex', gap: 12, fontSize: 11, color: T.textSoft }}>
                    {c.network_type && <span><strong>Network:</strong> {c.network_type}</span>}
                    {c.cihaz_modeli && (
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 400 }} title={c.cihaz_modeli}>
                        <strong>Cihaz:</strong> {c.cihaz_modeli}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cevaplamayanlar */}
        {data.eksik_users.length > 0 && (
          <div className="verde-card" style={{ padding: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: T.gray, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
              Cevaplanmamış ({data.eksik_users.length} kişi)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {data.eksik_users.map(u => (
                <span key={u.id}
                  style={{ padding: '4px 10px', background: T.grayLight, borderRadius: 999, fontSize: 12, color: T.text, border: `1px solid ${T.border}` }}>
                  {u.isim} <span style={{ color: T.textSoft }}>({u.firma_adi})</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const btnSecondary: React.CSSProperties = {
  height: 32, padding: '0 12px', borderRadius: 6, border: `1px solid ${T.border}`,
  background: '#fff', color: T.text, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
}

const thSm: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 11.5, fontWeight: 800, color: T.gray, textTransform: 'uppercase', letterSpacing: '0.03em' }
const tdSm: React.CSSProperties = { padding: '8px 10px', color: T.text }

function Badge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 999, background: bg, color: fg, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}

function KpiKart({ label, value, color, small }: { label: string; value: string; color: string; small?: boolean }) {
  return (
    <div style={{ padding: 12, background: T.grayLight, borderRadius: 8, border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: small ? 13 : 22, fontWeight: 900, color, lineHeight: 1.2, marginTop: 4 }}>{value}</div>
    </div>
  )
}
