"use client"

import BlockWrapper from "./BlockWrapper"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts"
import type { DashboardBlockProps } from '../types'

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
  firmaId, projeId, basePath,
}: DashboardBlockProps & { firmaId: string | null; projeId?: string | null }) {
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>("gunluk")
  const [data, setData] = useState<Array<{ label: string; value: number }>>([])

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
    const rangeISO = rangeStart.toISOString()

    // Canlı görevler
    let qCanli = supabase.from("canli_gorevler").select("olusturma_tarihi").gte("olusturma_tarihi", rangeISO)
    if (firmaId) qCanli = qCanli.eq("firma_id", firmaId)
    if (projeId) qCanli = (qCanli as any).eq("proje_id", projeId)

    // Arşiv görevler — aynı dönemde oluşturulup arşivlenenler
    let qArsiv = supabase.from("canli_gorevler_arsiv").select("olusturma_tarihi").gte("olusturma_tarihi", rangeISO)
    if (firmaId) qArsiv = qArsiv.eq("firma_id", firmaId)
    if (projeId) qArsiv = (qArsiv as any).eq("proje_id", projeId)

    const [{ data: canliRows }, { data: arsivRows }] = await Promise.all([qCanli, qArsiv])
    const rows = [...(canliRows ?? []), ...(arsivRows ?? [])]

    const grouped: Record<string, number> = {}

    if (mode === "gunluk") {
      for (let i = 23; i >= 0; i--) {
        const d = new Date(Date.now() - i * 60 * 60 * 1000)
        const label = d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false })
        grouped[label] = 0
      }
      rows.forEach((r: any) => {
        const d = startOfHourTR(new Date(r.olusturma_tarihi))
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
        const d = startOfDayTR(new Date(r.olusturma_tarihi))
        const key = d.toLocaleDateString("tr-TR", { weekday: "short", timeZone: "Europe/Istanbul" })
        if (key in grouped) grouped[key] = (grouped[key] || 0) + 1
      })
    } else {
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const weeks = ["Hafta 1", "Hafta 2", "Hafta 3", "Hafta 4", "Hafta 5"]
      weeks.forEach((w) => (grouped[w] = 0))
      rows.forEach((r: any) => {
        const d = new Date(r.olusturma_tarihi)
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
  }, [mode, firmaId, projeId])

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
            <Area type="monotone" dataKey="value" stroke="#374151" fill="#e5e7eb" name="Görev Sayısı" />
          </AreaChart>
        ) : null}
      </div>
    </BlockWrapper>
  )
}
