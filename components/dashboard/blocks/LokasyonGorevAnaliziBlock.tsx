'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DashboardBlockProps } from '../types'
import { suankiVardiyaGunu, type VardiyaAyar } from '@/lib/gorev/vardiyaGunu'
import { getEffectiveVardiya } from '@/lib/vardiya/getEffective'

type Mode = 'gunluk' | 'haftalik' | 'aylik'

// Vardiya günü range hesabı — bugün VG'den N gün geri (DATE string)
function rangeStartDateFor(mode: Mode, bugunVG: string): string {
  const days = mode === 'gunluk' ? 1 : mode === 'haftalik' ? 7 : 30
  const d = new Date(bugunVG + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

type Row = { id: string; parentName?: string | null; name: string; value: number }

export default function LokasyonGorevAnaliziBlock({
  firmaId, projeId, basePath, yetkiliLokIds,
}: DashboardBlockProps & { firmaId: string | null; projeId?: string | null }) {
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>('gunluk')
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [vardiyaAyari, setVardiyaAyari] = useState<VardiyaAyar[]>([])
  const lastReq = useRef(0)
  const yetkiliLokIdsKey = useMemo(() => (yetkiliLokIds ?? []).slice().sort().join(','), [yetkiliLokIds])

  // Efektif vardiya ayarları — proje override > firma fallback (mig 094)
  useEffect(() => {
    if (!firmaId) { setVardiyaAyari([]); return }
    getEffectiveVardiya(supabase as any, firmaId, projeId ?? null).then(ev => {
      const sayisi = ev.vardiya_sayisi ?? 3
      const set = ((ev.tum_vardiya_ayarlari ?? {})[String(sayisi)] ?? []) as VardiyaAyar[]
      setVardiyaAyari(Array.isArray(set) ? set : [])
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId, projeId])

  async function fetchData() {
    const reqId = Date.now()
    lastReq.current = reqId
    setLoading(true)
    try {
      const bugunVG = suankiVardiyaGunu(vardiyaAyari)
      const rangeStartDate = rangeStartDateFor(mode, bugunVG)
      const sel = `lokasyon_id,vardiya_gunu,lokasyonlar(tanim,parent_id,parent:parent_id(tanim))`

      // Canlı — vardiya_gunu üzerinden (sarkan V1 dahil)
      let qC = supabase.from('canli_gorevler').select(sel).gte('vardiya_gunu', rangeStartDate)
      if (firmaId) qC = qC.eq('firma_id', firmaId)
      if (projeId) qC = (qC as any).eq('proje_id', projeId)
      if (yetkiliLokIds?.length) qC = (qC as any).in('lokasyon_id', yetkiliLokIds)

      // Arşiv
      let qA = supabase.from('canli_gorevler_arsiv').select(sel).gte('vardiya_gunu', rangeStartDate)
      if (firmaId) qA = qA.eq('firma_id', firmaId)
      if (projeId) qA = (qA as any).eq('proje_id', projeId)
      if (yetkiliLokIds?.length) qA = (qA as any).in('lokasyon_id', yetkiliLokIds)

      const [{ data: canli }, { data: arsiv }] = await Promise.all([
        qC.limit(5000),
        qA.limit(5000),
      ])
      if (lastReq.current !== reqId) return

      const agg: Record<string, Row> = {}
      ;[...(canli ?? []), ...(arsiv ?? [])].forEach((r: any) => {
        const locId = r.lokasyon_id as string
        const loc = r.lokasyonlar
        const name = (loc?.tanim as string) ?? '—'
        const parentName = (loc?.parent?.tanim as string) ?? null
        if (!agg[locId]) agg[locId] = { id: locId, name, parentName, value: 0 }
        agg[locId].value += 1
      })

      setRows(Object.values(agg).sort((a, b) => b.value - a.value).slice(0, 3))
    } catch {
      if (lastReq.current !== reqId) return
      setRows([])
    } finally {
      if (lastReq.current === reqId) setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const ch = supabase.channel('dashboard-lokasyon-gorev')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'canli_gorevler' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'canli_gorevler_arsiv' }, () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, firmaId, projeId, yetkiliLokIdsKey, vardiyaAyari])

  const maxVal = Math.max(1, ...rows.map((r) => r.value))

  return (
    <div className="verde-card dashboard-border-intro h-[420px] flex flex-col">
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>LOKASYON GÖREV ANALİZİ</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            En çok göreve sahip 3 lokasyon • canlı + arşiv
          </div>
        </div>
        <Link href={`${basePath}/dashboard/lokasyonlar`} className="text-[13px] text-[#374151] hover:underline mt-[2px]">Tümünü Gör</Link>
      </div>

      <div className="flex-1 flex flex-col" style={{ padding: '12px 18px 16px' }}>
        <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
          {[{ key: 'gunluk', label: 'GÜNLÜK' }, { key: 'haftalik', label: 'HAFTALIK' }, { key: 'aylik', label: 'AYLIK' }].map((m) => (
            <button key={m.key} onClick={() => setMode(m.key as Mode)}
              className={`text-[12px] px-2 py-1 rounded-[10px] transition-colors ${mode === m.key ? 'bg-[#374151] text-white' : 'border border-[#e5e7eb] text-[#374151]'}`}>
              {m.label}
            </button>
          ))}
          {loading && <div style={{ fontSize: 12, color: '#6b7280', marginLeft: 4 }}>Yükleniyor…</div>}
        </div>

        <div style={{ flex: 1, minHeight: 0, border: '1px solid #f3f4f6', borderRadius: 12, background: '#ffffff', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 54px', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 12, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            <div>No</div><div>Lokasyon</div><div style={{ textAlign: 'right' }}>Adet</div>
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
                    <div style={{ color: '#374151', fontWeight: 900 }}>{i + 1}</div>
                    <div style={{ minWidth: 0 }}>
                      {r?.parentName && <div style={{ fontSize: 11.5, fontWeight: 900, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: isEmpty ? 0.45 : 1 }}>{r.parentName}</div>}
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: isEmpty ? 0.45 : 1 }}>{isEmpty ? '—' : r.name}</div>
                      <div style={{ marginTop: 8, height: 10, borderRadius: 999, background: '#f3f4f6', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: `linear-gradient(90deg,${['#8b5cf6','#ec4899','#06b6d4','#f97316','#6366f1'][i % 5]},${['#7c3aed','#db2777','#0891b2','#ea580c','#4f46e5'][i % 5]})`, opacity: isEmpty ? 0 : 0.9 }} />
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 900, color: '#111827', opacity: isEmpty ? 0.45 : 1 }}>{val}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {rows.length === 0 && !loading && (
          <div style={{ textAlign: 'center', color: '#6b7280', paddingTop: 12, fontSize: 13.5 }}>Seçilen aralıkta frekansiyel görev bulunamadı</div>
        )}
      </div>
    </div>
  )
}
