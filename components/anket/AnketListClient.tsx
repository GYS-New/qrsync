'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Topbar from '@/components/layout/Topbar'
import { Plus, RefreshCw, Users, MessageSquare, Calendar } from 'lucide-react'

type AnketRow = {
  id: string
  olusturuldu: string
  baslik: string
  soru: string
  tip: 'evet_hayir' | 'coktan_secmeli' | 'kisa_metin'
  secenekler: string[] | null
  hedef_user_ids: string[]
  hedef_firma_ids: string[]
  son_gecerli: string | null
  durum: 'aktif' | 'kapali' | 'taslak'
  hedef_sayisi: number
  cevap_sayisi: number
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706', amberLight: '#fef3c7',
  blue: '#1d4ed8', blueLight: '#eff6ff',
  gray: '#475569', grayLight: '#f8fafc',
}

const TIP_LABEL: Record<string, string> = {
  evet_hayir: 'Evet/Hayır',
  coktan_secmeli: 'Çoktan seçmeli',
  kisa_metin: 'Kısa metin',
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

export default function AnketListClient({ base }: { base: string }) {
  const [rows, setRows] = useState<AnketRow[]>([])
  const [loading, setLoading] = useState(true)

  async function yukle() {
    setLoading(true)
    try {
      const r = await fetch('/api/sa/anketler', { cache: 'no-store' })
      const j = await r.json()
      if (j.ok) setRows(j.items ?? [])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { yukle() }, [])

  return (
    <div>
      <Topbar title="Mobil Anketler" base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Mobil Anketler' }]} />

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href={`${base}/dashboard/anketler/yeni`}
            style={{ textDecoration: 'none' }}>
            <button style={{ height: 38, padding: '0 14px', borderRadius: 8, border: 'none', background: T.blue, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Plus size={14} /> Yeni Anket
            </button>
          </Link>
          <button onClick={yukle} disabled={loading}
            style={{ height: 38, padding: '0 14px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', color: T.text, fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} style={loading ? { animation: 'spin .9s linear infinite' } : undefined} /> Yenile
          </button>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: T.textSoft }}>
            {rows.length} anket
          </span>
        </div>

        {loading && rows.length === 0 ? (
          <div className="verde-card" style={{ padding: 60, textAlign: 'center', color: T.textSoft }}>Yükleniyor…</div>
        ) : rows.length === 0 ? (
          <div className="verde-card" style={{ padding: 60, textAlign: 'center', color: T.textSoft }}>
            Henüz anket yok. <Link href={`${base}/dashboard/anketler/yeni`} style={{ color: T.blue, fontWeight: 700 }}>İlk anketi oluştur</Link>
          </div>
        ) : (
          <div className="verde-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ background: T.grayLight }}>
                <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                  <th style={th}>Başlık</th>
                  <th style={th}>Tip</th>
                  <th style={{ ...th, textAlign: 'center' }}>Hedef</th>
                  <th style={{ ...th, textAlign: 'center' }}>Cevap</th>
                  <th style={{ ...th, textAlign: 'center' }}>Oran</th>
                  <th style={th}>Son Geçerlilik</th>
                  <th style={th}>Oluşturuldu</th>
                  <th style={th}>Durum</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const oran = r.hedef_sayisi > 0 ? Math.round((r.cevap_sayisi / r.hedef_sayisi) * 100) : 0
                  return (
                    <tr key={r.id}
                      style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                      <td style={td}>
                        <Link href={`${base}/dashboard/anketler/${r.id}`}
                          style={{ color: T.blue, fontWeight: 700, textDecoration: 'none' }}>
                          {r.baslik}
                        </Link>
                        <div style={{ fontSize: 11.5, color: T.textSoft, marginTop: 2, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.soru}>
                          {r.soru}
                        </div>
                      </td>
                      <td style={td}>
                        <Badge text={TIP_LABEL[r.tip] ?? r.tip} bg={T.blueLight} fg={T.blue} />
                      </td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Users size={12} color={T.textSoft} /> {r.hedef_sayisi}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: T.green }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <MessageSquare size={12} /> {r.cevap_sayisi}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'center', fontWeight: 800, color: oran >= 50 ? T.green : oran >= 25 ? T.amber : T.red }}>
                        %{oran}
                      </td>
                      <td style={{ ...td, fontSize: 12 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: T.textSoft }}>
                          <Calendar size={11} /> {r.son_gecerli ? fmtTarih(r.son_gecerli) : 'Sınırsız'}
                        </span>
                      </td>
                      <td style={{ ...td, fontSize: 12, color: T.textSoft }}>{fmtTarih(r.olusturuldu)}</td>
                      <td style={td}>
                        <Badge text={DURUM_RENK[r.durum].label} bg={DURUM_RENK[r.durum].bg} fg={DURUM_RENK[r.durum].fg} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

const th: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: 11.5, fontWeight: 800,
  color: T.gray, textTransform: 'uppercase', letterSpacing: '0.04em',
}
const td: React.CSSProperties = { padding: '10px 14px', color: T.text, verticalAlign: 'middle' }

function Badge({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 999, background: bg, color: fg, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
      {text}
    </span>
  )
}
