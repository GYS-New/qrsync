'use client'

import React, { useEffect, useState } from 'react'
import { RefreshCw, CheckCircle2, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react'

type Durum = 'OK' | 'SORUN' | 'BILGI'
type SistemRaporu = {
  ad: string
  durum: Durum
  mesaj: string
  metrikler?: Record<string, any>
}
type Rapor = {
  calisma_zamani: string
  toplam_sistem: number
  toplam_ok: number
  toplam_sorun: number
  toplam_bilgi: number
  sistemler: SistemRaporu[]
}

const DURUM_STIL: Record<Durum, { bg: string; color: string; border: string; label: string }> = {
  OK:    { bg: '#dcfce7', color: '#166534', border: '#86efac', label: 'UYGUN' },
  SORUN: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5', label: 'SORUN' },
  BILGI: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1', label: 'BİLGİ' },
}

function tarihFormat(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export default function SistemSaglikWidget() {
  const [rapor, setRapor] = useState<Rapor | null>(null)
  const [sonKontrol, setSonKontrol] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  async function yukle() {
    setLoading(true)
    try {
      const res = await fetch('/api/sistem-kontrol/son', { cache: 'no-store' })
      const j = await res.json()
      setRapor(j.rapor ?? null)
      setSonKontrol(j.son_kontrol ?? null)
    } catch (e) {
      console.error('[SistemSaglikWidget]', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    yukle()
    // 60 sn'de bir otomatik tazele
    const interval = setInterval(yukle, 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  if (loading && !rapor) {
    return (
      <div style={{ padding: '10px 14px', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', fontSize: 13, color: '#64748b' }}>
        Sistem sağlık kontrolü yükleniyor…
      </div>
    )
  }

  if (!rapor) {
    return (
      <div style={{ padding: '10px 14px', background: '#fef9c3', borderBottom: '1px solid #fde68a', fontSize: 13, color: '#854d0e' }}>
        Henüz sistem kontrol kaydı yok. Cron her saat başı çalıştığında görünür olacak.
      </div>
    )
  }

  const { toplam_sistem, toplam_ok, toplam_sorun, sistemler } = rapor
  const sorunVar = toplam_sorun > 0
  const ozetBg = sorunVar ? '#fee2e2' : '#dcfce7'
  const ozetColor = sorunVar ? '#991b1b' : '#166534'
  const ozetBorder = sorunVar ? '#fca5a5' : '#86efac'
  const ozetIcon = sorunVar ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />

  return (
    <div style={{ borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
      {/* Özet bar */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: '10px 14px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: ozetBg,
          borderBottom: expanded ? `1px solid ${ozetBorder}` : 'none',
        }}
      >
        <span style={{ color: ozetColor, display: 'inline-flex' }}>{ozetIcon}</span>
        <span style={{ fontWeight: 700, fontSize: 13.5, color: ozetColor }}>
          {sorunVar
            ? `${toplam_sorun}/${toplam_sistem} sistemde sorun var`
            : `${toplam_ok}/${toplam_sistem} sistem doğal çalışıyor`}
        </span>
        <span style={{ fontSize: 12, color: ozetColor, opacity: 0.75 }}>
          • Son kontrol: {tarihFormat(sonKontrol)}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={e => { e.stopPropagation(); yukle() }}
            disabled={loading}
            title="Yenile"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: loading ? 'default' : 'pointer',
              color: ozetColor,
              display: 'inline-flex',
              padding: 4,
              opacity: loading ? 0.5 : 1,
            }}
          >
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
          {expanded ? <ChevronUp size={16} color={ozetColor} /> : <ChevronDown size={16} color={ozetColor} />}
        </span>
      </div>

      {/* Detay kartları */}
      {expanded && (
        <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10, background: '#f8fafc' }}>
          {sistemler.map((s, i) => {
            const stil = DURUM_STIL[s.durum]
            const ikon = s.durum === 'OK' ? <CheckCircle2 size={14} /> : s.durum === 'SORUN' ? <AlertTriangle size={14} /> : <Info size={14} />
            return (
              <div key={i} style={{
                background: '#fff',
                border: `1px solid ${stil.border}`,
                borderLeft: `4px solid ${stil.color}`,
                borderRadius: 8,
                padding: 10,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{s.ad}</span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 12,
                    background: stil.bg, color: stil.color,
                    fontSize: 10.5, fontWeight: 700, marginLeft: 'auto',
                  }}>
                    {ikon} {stil.label}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.4 }}>
                  {s.mesaj}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
