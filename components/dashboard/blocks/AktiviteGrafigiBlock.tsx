"use client"

import BlockWrapper from "./BlockWrapper"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts"
import type { DashboardBlockProps } from '../types'

/** Client-side pagination helper — PostgREST max_rows=1000 limitini aşmak için */
async function fetchAllPages<T = any>(buildQuery: () => any): Promise<T[]> {
  const PAGE = 1000
  const all: T[] = []
  let from = 0
  while (true) {
    const { data } = await buildQuery().range(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

type Mode = "gunluk" | "haftalik" | "aylik"

function startOfHourTR(d: Date) {
  const x = new Date(d); x.setMinutes(0, 0, 0); return x
}

function startOfDayTR(d: Date): Date {
  const trOffset = 3 * 60 * 60 * 1000
  const trTime = new Date(d.getTime() + trOffset)
  trTime.setUTCHours(0, 0, 0, 0)
  return new Date(trTime.getTime() - trOffset)
}

export default function AktiviteGrafigiBlock({
  firmaId, projeId, basePath, yetkiliLokIds,
}: DashboardBlockProps & { firmaId: string | null; projeId?: string | null }) {
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>("gunluk")
  const [data, setData] = useState<Array<{ label: string; value: number }>>([])
  const yetkiliLokIdsKey = useMemo(() => (yetkiliLokIds ?? []).slice().sort().join(','), [yetkiliLokIds])

  const chartWrapRef = useRef<HTMLDivElement | null>(null)
  const [chartSize, setChartSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = chartWrapRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      const w = Math.floor(rect.width), h = Math.floor(rect.height)
      if (w > 0 && h > 0) setChartSize({ w, h })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rangeStart = useMemo(() => {
    const now = new Date()
    if (mode === "gunluk")   return new Date(now.getTime() - 24 * 60 * 60 * 1000)
    if (mode === "haftalik") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }, [mode])

  async function fetchData() {
    // VARDİYA TABANLI gruplama:
    // Tamamlanmış görevleri 'tamamlanma_tarihi' yerine 'aktif_olma_tarihi'nin
    // TR gününe yazıyoruz. Sebep: Pzt 16:00 3.vardiya görevi Sal 00:30'da
    // tamamlanırsa "Tamamlanan Görev" grafiğinde Pzt sütununa düşer (vardiya
    // sahibi gün). Aksi halde gece vardiyası tamamlamaları ertesi güne düşüp
    // "çalışmadığım gün" sezgisini bozuyordu.
    const rangeISO = rangeStart.toISOString()

    // Tamamlanan canlı görevler (frekansiyel)
    const buildCanli = () => {
      let q = supabase.from("canli_gorevler").select("aktif_olma_tarihi")
        .not("tamamlanma_tarihi", "is", null)
        .gte("aktif_olma_tarihi", rangeISO)
      if (firmaId) q = q.eq("firma_id", firmaId)
      if (projeId) q = (q as any).eq("proje_id", projeId)
      if (yetkiliLokIds?.length) q = (q as any).in("lokasyon_id", yetkiliLokIds)
      return q
    }

    // Tamamlanan arşiv görevler
    const buildArsiv = () => {
      let q = supabase.from("canli_gorevler_arsiv").select("aktif_olma_tarihi")
        .not("tamamlanma_tarihi", "is", null)
        .gte("aktif_olma_tarihi", rangeISO)
      if (firmaId) q = q.eq("firma_id", firmaId)
      if (projeId) q = (q as any).eq("proje_id", projeId)
      if (yetkiliLokIds?.length) q = (q as any).in("lokasyon_id", yetkiliLokIds)
      return q
    }

    // Tamamlanan spesifik görevler
    const buildSpesifik = () => {
      let q = supabase.from("gorevler").select("aktif_olma_tarihi")
        .eq("durum", "TAMAMLANDI")
        .not("tamamlanma_tarihi", "is", null)
        .gte("aktif_olma_tarihi", rangeISO)
      if (firmaId) q = q.eq("firma_id", firmaId)
      if (projeId) q = (q as any).eq("proje_id", projeId)
      if (yetkiliLokIds?.length) q = (q as any).in("lokasyon_id", yetkiliLokIds)
      return q
    }

    const [canliRows, arsivRows, spesifikRows] = await Promise.all([
      fetchAllPages(buildCanli), fetchAllPages(buildArsiv), fetchAllPages(buildSpesifik)
    ])
    const rows = [...canliRows, ...arsivRows, ...spesifikRows]

    const grouped: Record<string, number> = {}

    if (mode === "gunluk") {
      for (let i = 23; i >= 0; i--) {
        const d = new Date(Date.now() - i * 60 * 60 * 1000)
        const label = d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false })
        grouped[label] = 0
      }
      rows.forEach((r: any) => {
        const d = startOfHourTR(new Date(r.aktif_olma_tarihi))
        const label = d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false })
        if (label in grouped) grouped[label] = (grouped[label] || 0) + 1
      })
    } else if (mode === "haftalik") {
      const days: Date[] = []
      for (let i = 6; i >= 0; i--) days.push(startOfDayTR(new Date(Date.now() - i * 24 * 60 * 60 * 1000)))
      days.forEach((d) => {
        const key = d.toLocaleDateString("tr-TR", { weekday: "short", timeZone: "Europe/Istanbul" })
        grouped[key] = 0
      })
      rows.forEach((r: any) => {
        const d = startOfDayTR(new Date(r.aktif_olma_tarihi))
        const key = d.toLocaleDateString("tr-TR", { weekday: "short", timeZone: "Europe/Istanbul" })
        if (key in grouped) grouped[key] = (grouped[key] || 0) + 1
      })
    } else {
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const weeks = ["Hafta 1", "Hafta 2", "Hafta 3", "Hafta 4", "Hafta 5"]
      weeks.forEach((w) => (grouped[w] = 0))
      rows.forEach((r: any) => {
        const d = new Date(r.aktif_olma_tarihi)
        const diffDays = Math.floor((d.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
        const bucket = Math.min(4, Math.max(0, Math.floor(diffDays / 7)))
        grouped[weeks[bucket]] = (grouped[weeks[bucket]] || 0) + 1
      })
    }

    setData(Object.entries(grouped).map(([label, value]) => ({ label, value })))
  }

  useEffect(() => {
    fetchData()
    const channel = supabase
      .channel("dashboard-aktivite")
      .on("postgres_changes", { event: "*", schema: "public", table: "canli_gorevler" }, () => fetchData())
      .on("postgres_changes", { event: "*", schema: "public", table: "canli_gorevler_arsiv" }, () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, firmaId, projeId, yetkiliLokIdsKey])

  return (
    <BlockWrapper title="AKTİVİTE GRAFİĞİ" size="big" href={`${basePath}/dashboard/canli-islemler`}>
      <div className="flex gap-2 mb-2">
        {[
          { key: "gunluk", label: "GÜNLÜK" },
          { key: "haftalik", label: "HAFTALIK" },
          { key: "aylik", label: "AYLIK" },
        ].map((m) => (
          <button key={m.key} onClick={() => setMode(m.key as Mode)}
            className={`text-xs px-2 py-1 rounded ${mode === m.key ? "bg-[#374151] text-white" : "border border-[#e5e7eb] text-[#374151]"}`}>
            {m.label}
          </button>
        ))}
      </div>
      <div ref={chartWrapRef} style={{ height: 300, minHeight: 300, width: "100%", minWidth: 0 }}>
        {chartSize.w > 0 && chartSize.h > 0 ? (
          <AreaChart width={chartSize.w} height={chartSize.h} data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Area type="monotone" dataKey="value" stroke="#22c55e" fill="#dcfce7" name="Tamamlanan Görev" />
          </AreaChart>
        ) : null}
      </div>
    </BlockWrapper>
  )
}
