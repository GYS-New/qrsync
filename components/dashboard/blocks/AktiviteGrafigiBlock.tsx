"use client"

import BlockWrapper from "./BlockWrapper"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts"
import type { DashboardBlockProps } from '../types'

type Mode = "gunluk" | "haftalik" | "aylik"

function startOfHour(d: Date) {
  const x = new Date(d)
  x.setMinutes(0, 0, 0)
  return x
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export default function AktiviteGrafigiBlock({ firmaId, projeId, basePath  }: DashboardBlockProps & { firmaId: string | null; projeId?: string | null }) {
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>("gunluk")
  const [data, setData] = useState<Array<{ label: string; value: number }>>([])

  // Recharts can warn: "The width(-1) and height(-1) of chart should be greater than 0"
  // when it measures a flex/overflow container while it's temporarily 0px.
  // We measure the container explicitly and only render the chart when size is positive.
  const chartWrapRef = useRef<HTMLDivElement | null>(null)
  const [chartSize, setChartSize] = useState({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = chartWrapRef.current
    if (!el) return

    const measure = () => {
      const rect = el.getBoundingClientRect()
      const w = Math.floor(rect.width)
      const h = Math.floor(rect.height)
      if (w > 0 && h > 0) setChartSize({ w, h })
    }

    measure()

    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const rangeStart = useMemo(() => {
    const now = new Date()
    if (mode === "gunluk") {
      return new Date(now.getTime() - 24 * 60 * 60 * 1000)
    }
    if (mode === "haftalik") {
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    }
    return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  }, [mode])

  async function fetchData() {
    // NOTE: Supabase Postgres' timestamp columns are expected in ISO format.
    let q = supabase
      .from("canli_gorevler")
      .select("olusturma_tarihi,firma_id")
      .gte("olusturma_tarihi", rangeStart.toISOString())

    if (firmaId) q = q.eq("firma_id", firmaId)
    if (projeId) q = (q as any).eq("proje_id", projeId)

    const { data: rows } = await q

    const grouped: Record<string, number> = {}

    if (mode === "gunluk") {
      // 24h by hour
      for (let i = 23; i >= 0; i--) {
        const d = new Date(Date.now() - i * 60 * 60 * 1000)
        grouped[String(d.getHours()).padStart(2, "0")] = 0
      }
      rows?.forEach((r: any) => {
        const d = startOfHour(new Date(r.olusturma_tarihi))
        const key = String(d.getHours()).padStart(2, "0")
        grouped[key] = (grouped[key] || 0) + 1
      })
    } else if (mode === "haftalik") {
      // 7 days by weekday short
      const days: Date[] = []
      for (let i = 6; i >= 0; i--) days.push(startOfDay(new Date(Date.now() - i * 24 * 60 * 60 * 1000)))
      days.forEach((d) => {
        const key = d.toLocaleDateString("tr-TR", { weekday: "short" })
        grouped[key] = 0
      })
      rows?.forEach((r: any) => {
        const d = startOfDay(new Date(r.olusturma_tarihi))
        const key = d.toLocaleDateString("tr-TR", { weekday: "short" })
        grouped[key] = (grouped[key] || 0) + 1
      })
    } else {
      // 30 days by week bucket (1..5)
      const now = new Date()
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const weeks = ["Hafta 1", "Hafta 2", "Hafta 3", "Hafta 4", "Hafta 5"]
      weeks.forEach((w) => (grouped[w] = 0))

      rows?.forEach((r: any) => {
        const d = new Date(r.olusturma_tarihi)
        const diffDays = Math.floor((d.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
        const bucket = Math.min(4, Math.max(0, Math.floor(diffDays / 7)))
        const key = weeks[bucket]
        grouped[key] = (grouped[key] || 0) + 1
      })
    }

    setData(Object.entries(grouped).map(([label, value]) => ({ label, value })))
  }

  useEffect(() => {
    fetchData()

    // Realtime: when live tasks are inserted/updated, refresh.
    const channel = supabase
      .channel("dashboard-aktivite")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "canli_gorevler" },
        () => fetchData()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, firmaId, projeId])

  return (
    <BlockWrapper title="AKTİVİTE GRAFİĞİ" size="big" href={`${basePath}/dashboard/canli-islemler`}>
      <div className="flex gap-2 mb-2">
        {[
          { key: "gunluk", label: "GÜNLÜK" },
          { key: "haftalik", label: "HAFTALIK" },
          { key: "aylik", label: "AYLIK" },
        ].map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key as Mode)}
            className={`text-xs px-2 py-1 rounded ${
              mode === m.key ? "bg-[#2e8b2e] text-white" : "border border-[#d6e4d6] text-[#2d3f2d]"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div ref={chartWrapRef} style={{ height: 300, minHeight: 300, width: "100%", minWidth: 0 }}>
        {chartSize.w > 0 && chartSize.h > 0 ? (
          <AreaChart
            width={chartSize.w}
            height={chartSize.h}
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <XAxis dataKey="label" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Area type="monotone" dataKey="value" stroke="#16a34a" fill="#bbf7d0" />
          </AreaChart>
        ) : null}
      </div>
    </BlockWrapper>
  )
}