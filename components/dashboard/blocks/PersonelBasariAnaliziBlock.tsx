'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DashboardBlockProps } from '../types'

type Mode = 'gunluk' | 'haftalik' | 'aylik'

function rangeStartFor(mode: Mode) {
  const now = new Date()
  if (mode === 'gunluk') return new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (mode === 'haftalik') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
}

export default function PersonelBasariAnaliziBlock({ firmaId, projeId,
  basePath,
}: DashboardBlockProps & { firmaId: string | null; projeId?: string | null }) {
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>('gunluk')
  const [rows, setRows] = useState<Array<{ id: string; name: string; value: number }>>([])
  const [loading, setLoading] = useState(false)
  const lastReq = useRef(0)

  const rangeStart = useMemo(() => rangeStartFor(mode), [mode])

  async function fetchData() {
    const reqId = Date.now()
    lastReq.current = reqId
    setLoading(true)

    try {
      let q = supabase
        .from('canli_gorevler')
        .select('atanan_kullanici_id,olusturma_tarihi,durum,users!atanan_kullanici_id(isim_soyisim)')
        .gte('olusturma_tarihi', rangeStart.toISOString())
        .eq('durum', 'TAMAMLANDI')

      if (firmaId) q = q.eq('firma_id', firmaId)
    if (projeId) q = (q as any).eq('proje_id', projeId)

      // NOTE: If your dataset is very large, consider adding an RPC with GROUP BY.
      // For dashboard usage, we keep a reasonable cap.
      const { data } = await q.limit(5000)

      if (lastReq.current !== reqId) return

      const agg: Record<string, { id: string; name: string; value: number }> = {}
      ;(data ?? []).forEach((r: any) => {
        const id = r.atanan_kullanici_id ?? 'unknown'
        const name = r?.users?.isim_soyisim ?? '—'
        if (!agg[id]) agg[id] = { id, name, value: 0 }
        agg[id].value += 1
      })

      const top3 = Object.values(agg)
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)

      setRows(top3)
    } catch {
      if (lastReq.current !== reqId) return
      setRows([])
    } finally {
      if (lastReq.current === reqId) setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()

    // Realtime refresh (best-effort)
    const channel = supabase
      .channel('dashboard-personel-basari')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'canli_gorevler' }, () => fetchData())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, firmaId, projeId])

  const maxVal = Math.max(1, ...rows.map((r) => r.value))

  return (
    <div className="verde-card h-[420px] flex flex-col">
      <div
        style={{
          padding: '16px 18px 12px',
          borderBottom: '1px solid #e8f0e8',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f1a0f' }}>PERSONEL BAŞARI ANALİZİ</div>
          <div style={{ fontSize: 13, color: '#7a907a', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            En çok frekansiyel görev tamamlayan 3 personel
          </div>
        </div>

        <Link href={`${basePath}/dashboard/canli-islemler`} className="text-[13px] text-[#2e8b2e] hover:underline mt-[2px]">
          Tümünü Gör
        </Link>
      </div>

      <div className="flex-1 flex flex-col" style={{ padding: '12px 18px 16px' }}>
        <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
          {[
            { key: 'gunluk', label: 'GÜNLÜK' },
            { key: 'haftalik', label: 'HAFTALIK' },
            { key: 'aylik', label: 'AYLIK' },
          ].map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key as Mode)}
              className={`text-[12px] px-2 py-1 rounded-[10px] transition-colors ${
                mode === m.key ? 'bg-[#2e8b2e] text-white' : 'border border-[#d6e4d6] text-[#2d3f2d]'
              }`}
            >
              {m.label}
            </button>
          ))}

          {loading && <div style={{ fontSize: 12, color: '#7a907a', marginLeft: 4 }}>Yükleniyor…</div>}
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            border: '1px solid #e8f0e8',
            borderRadius: 12,
            background: 'linear-gradient(180deg, rgba(240,249,240,.85), rgba(255,255,255,.92))',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '44px 1fr 54px',
              gap: 10,
              padding: '10px 14px',
              borderBottom: '1px solid #e2ece2',
              fontSize: 12,
              fontWeight: 800,
              color: '#a0b4a0',
              textTransform: 'uppercase',
              letterSpacing: 0.8,
            }}
          >
            <div>No</div>
            <div>Personel</div>
            <div style={{ textAlign: 'right' }}>Adet</div>
          </div>

          <div className="divide-y" style={{ height: '100%' }}>
            {Array.from({ length: 3 }).map((_, i) => {
              const r = rows[i]
              const isEmpty = !r
              const val = r?.value ?? 0
              const pct = Math.round((val / maxVal) * 100)

              return (
                <div key={i} style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 54px', gap: 10, alignItems: 'center' }}>
                    <div style={{ color: '#2e8b2e', fontWeight: 900 }}>{i + 1}</div>
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13.5,
                          fontWeight: 800,
                          color: '#0f1a0f',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          opacity: isEmpty ? 0.45 : 1,
                        }}
                      >
                        {isEmpty ? '—' : r.name}
                      </div>
                      <div style={{ marginTop: 8, height: 10, borderRadius: 999, background: '#e8f0e8', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${Math.max(0, Math.min(100, pct))}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg,#2e8b2e,#1f6b1f)',
                            opacity: isEmpty ? 0 : 0.9,
                          }}
                        />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 900, color: '#0f1a0f', opacity: isEmpty ? 0.45 : 1 }}>
                      {val}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {rows.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#7a907a', paddingTop: 12, fontSize: 13.5 }}>
            Seçilen aralıkta tamamlanan frekansiyel görev bulunamadı
          </div>
        )}
      </div>
    </div>
  )
}
