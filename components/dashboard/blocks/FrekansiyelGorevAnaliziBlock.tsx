"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import BlockWrapper from './BlockWrapper'
import type { DashboardBlockProps } from '../types'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { suankiVardiyaGunu, type VardiyaAyar } from '@/lib/gorev/vardiyaGunu'
import { getEffectiveVardiya } from '@/lib/vardiya/getEffective'

type Mode = 'gunluk' | 'haftalik' | 'aylik'

// Vardiya günü range başlangıcı:
//   gunluk   → bugün (tek gün)
//   haftalik → bu haftanın Pazartesi'si
//   aylik    → bu ayın 1'i
// bugunVG 'YYYY-MM-DD' formatında TR günü (sarkan vardiya destekli).
function getRangeStartDate(mode: Mode, bugunVG: string): string {
  if (mode === 'gunluk') return bugunVG
  const d = new Date(bugunVG + 'T00:00:00Z')
  if (mode === 'haftalik') {
    // Pazartesi başlangıç (TR konvansiyonu) — UTC getDay 0=Pazar
    const dow = d.getUTCDay()
    const offset = dow === 0 ? 6 : dow - 1
    d.setUTCDate(d.getUTCDate() - offset)
    return d.toISOString().slice(0, 10)
  }
  // aylik — ayın 1'i
  return `${bugunVG.slice(0, 7)}-01`
}

function pct(num: number, den: number) {
  if (!den || den <= 0) return 0
  return Math.round((num / den) * 100)
}

export default function FrekansiyelGorevAnaliziBlock({
  firmaId, projeId, basePath, yetkiliLokIds,
}: DashboardBlockProps & { firmaId: string | null; projeId?: string | null }) {
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>('gunluk')
  const [loading, setLoading] = useState(false)
  const [counts, setCounts] = useState({ total: 0, completed: 0, late: 0, pending: 0 })
  const [vardiyaAyari, setVardiyaAyari] = useState<VardiyaAyar[]>([])

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [w, setW] = useState(0)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => { const ww = Math.floor(el.getBoundingClientRect().width); if (ww > 0) setW(ww) }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

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

  async function fetchCounts() {
    setLoading(true)
    const ff = (q: any) => {
      let r = firmaId ? q.eq('firma_id', firmaId) : q
      if (projeId) r = r.eq('proje_id', projeId)
      if (yetkiliLokIds?.length) r = r.in('lokasyon_id', yetkiliLokIds)
      return r
    }
    const bugunVG = suankiVardiyaGunu(vardiyaAyari)
    const rangeStartDate = getRangeStartDate(mode, bugunVG)
    const base = (tablo: string, q?: any) =>
      ff((q ?? supabase.from(tablo).select('*', { count: 'exact', head: true })).gte('vardiya_gunu', rangeStartDate))

    // Canlı + Arşiv sorguları paralel çek
    const results = await Promise.allSettled([
      // Canlı
      base('canli_gorevler', supabase.from('canli_gorevler').select('*', { count: 'exact', head: true }).neq('durum', 'IPTAL')),
      base('canli_gorevler', supabase.from('canli_gorevler').select('*', { count: 'exact', head: true }).eq('durum', 'TAMAMLANDI')),
      base('canli_gorevler', supabase.from('canli_gorevler').select('*', { count: 'exact', head: true }).eq('durum', 'ZAMANINDA_YAPILAMAYAN')),
      base('canli_gorevler', supabase.from('canli_gorevler').select('*', { count: 'exact', head: true }).eq('durum', 'BEKLEMEDE')),
      // Arşiv
      base('canli_gorevler_arsiv', supabase.from('canli_gorevler_arsiv').select('*', { count: 'exact', head: true }).neq('durum', 'IPTAL')),
      base('canli_gorevler_arsiv', supabase.from('canli_gorevler_arsiv').select('*', { count: 'exact', head: true }).eq('durum', 'TAMAMLANDI')),
      base('canli_gorevler_arsiv', supabase.from('canli_gorevler_arsiv').select('*', { count: 'exact', head: true }).eq('durum', 'ZAMANINDA_YAPILAMAYAN')),
      base('canli_gorevler_arsiv', supabase.from('canli_gorevler_arsiv').select('*', { count: 'exact', head: true }).eq('durum', 'BEKLEMEDE')),
    ])

    const n = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? (r.value?.count ?? 0) : 0

    setCounts({
      total:     n(results[0]) + n(results[4]),
      completed: n(results[1]) + n(results[5]),
      late:      n(results[2]) + n(results[6]),
      pending:   n(results[3]) + n(results[7]),
    })
    setLoading(false)
  }

  // yetkiliLokIds array referansı her render değişir; stable key yarat
  const yetkiliLokIdsKey = useMemo(() => (yetkiliLokIds ?? []).slice().sort().join(','), [yetkiliLokIds])

  useEffect(() => {
    fetchCounts()
    const ch = supabase.channel('dashboard-frekansiyel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'canli_gorevler' }, () => fetchCounts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'canli_gorevler_arsiv' }, () => fetchCounts())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, firmaId, projeId, yetkiliLokIdsKey, vardiyaAyari])

  const other   = Math.max(0, counts.total - counts.completed)
  const success = pct(counts.completed, counts.total)
  const remain  = Math.max(0, counts.total - counts.completed)

  // Bar başına özel renkler — Cell ile uygulanır
  // Graf-1: Mavi (Toplam), Yeşil (Tamamlanan), Sarı (Diğer)
  // Graf-2: Mavi (Toplam), Sarı (Zamanında Yapılamayan), Kırmızı (Beklemede)
  const G1_COLORS = ['#3b82f6', '#16a34a', '#eab308']
  const G2_COLORS = ['#3b82f6', '#eab308', '#dc2626']

  const g1 = useMemo(() => [
    { name: 'Toplam', value: counts.total },
    { name: 'Tamamlanan', value: counts.completed },
    { name: 'Diğer', value: other },
  ], [counts.total, counts.completed, other])

  const g2 = useMemo(() => [
    { name: 'Toplam', value: counts.total },
    { name: 'Zamanında Yapılamayan', value: counts.late },
    { name: 'Beklemede', value: counts.pending },
  ], [counts.total, counts.late, counts.pending])

  const pie = useMemo(() => [
    { name: 'Tamamlanan', value: counts.completed },
    { name: 'Kalan', value: remain },
  ], [counts.completed, remain])

  const COLORS = ['#3b82f6', '#e5e7eb']

  return (
    <BlockWrapper title="FREKANSİYEL GÖREV ANALİZİ" size="big" href={`${basePath}/dashboard/canli-islemler`}>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div style={{ fontSize: 13, color: '#6b7280' }}>
          {mode === 'gunluk' ? 'Bugün' : mode === 'haftalik' ? 'Bu hafta' : 'Bu ay'} • canlı + arşiv
        </div>
        <div className="flex gap-2">
          {[{ key: 'gunluk', label: 'GÜNLÜK' }, { key: 'haftalik', label: 'HAFTALIK' }, { key: 'aylik', label: 'AYLIK' }].map((m) => (
            <button key={m.key} onClick={() => setMode(m.key as Mode)}
              className={`text-xs px-2 py-1 rounded ${mode === m.key ? 'bg-[#374151] text-white' : 'border border-[#e5e7eb] text-[#374151]'}`}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={wrapRef} style={{ width: '100%', minWidth: 0 }}>
        {loading && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 10 }}>Yükleniyor...</div>}

        <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
          {/* Graf-1 */}
          <div className="verde-card overflow-hidden" style={{ padding: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#111827', marginBottom: 8 }}>Graf-1</div>
            <div className="h-[260px] lg:h-[300px]" style={{ width: '100%', minWidth: 0 }}>
              {w > 0 && <ResponsiveContainer width="100%" height="100%">
                <BarChart data={g1} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 13 }} interval={0} height={44}
                    tickFormatter={(v) => typeof v === 'string' && v.length > 12 ? `${v.slice(0, 12)}…` : v} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 13 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {g1.map((_, idx) => <Cell key={idx} fill={G1_COLORS[idx % G1_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>}
            </div>
          </div>

          {/* Graf-2 */}
          <div className="verde-card overflow-hidden" style={{ padding: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: '#111827', marginBottom: 8 }}>Graf-2</div>
            <div className="h-[260px] lg:h-[300px]" style={{ width: '100%', minWidth: 0 }}>
              {w > 0 && <ResponsiveContainer width="100%" height="100%">
                <BarChart data={g2} margin={{ top: 6, right: 6, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 13 }} interval={0} height={44}
                    tickFormatter={(v) => typeof v === 'string' && v.length > 12 ? `${v.slice(0, 12)}…` : v} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {g2.map((_, idx) => <Cell key={idx} fill={G2_COLORS[idx % G2_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>}
            </div>
          </div>

          {/* Graf-3 */}
          <div className="verde-card overflow-hidden" style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: '#111827' }}>Graf-3</div>
              <div style={{ fontSize: 13, color: '#374151', fontWeight: 800 }}>%{success} başarı</div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ minWidth: 90 }}>
                <div style={{ fontSize: 14, color: '#6b7280' }}>Toplam</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#111827' }}>{counts.total}</div>
                <div style={{ fontSize: 14, color: '#6b7280', marginTop: 6 }}>Tamamlanan</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#111827' }}>{counts.completed}</div>
              </div>
              {w > 0 && (
                <PieChart width={Math.max(170, Math.floor(w / 3) - 160)} height={190}>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 13 }} />
                  <Pie data={pie} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {pie.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                  </Pie>
                </PieChart>
              )}
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ height: 10, background: '#e7f2e7', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${success}%`, height: 10, background: '#16a34a' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 13, color: '#6b7280' }}>
                <span>Tamamlanan: {counts.completed}</span>
                <span>Kalan: {remain}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BlockWrapper>
  )
}
