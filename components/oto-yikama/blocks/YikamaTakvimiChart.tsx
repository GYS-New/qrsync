'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts'

type Veri = {
  etiket: string
  etiketKisa: string
  tarih: string
  Tamamlanan: number
  Kalan: number
  Toplam: number
  isToday: boolean
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e5e7eb',
  blue: '#1d4ed8', blueLight: '#dbeafe',
  green: '#16a34a', greenLight: '#dcfce7',
}

export default function YikamaTakvimiChart({ data }: { data: Veri[] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 260 })

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0) setSize({ w: Math.floor(rect.width), h: 260 })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const toplamPlanli = data.reduce((s, d) => s + d.Toplam, 0)
  const toplamTamamlanan = data.reduce((s, d) => s + d.Tamamlanan, 0)
  const oran = toplamPlanli > 0 ? Math.round((toplamTamamlanan / toplamPlanli) * 100) : 0

  return (
    <div className="verde-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Yıkama Takvimi — Önümüzdeki 7 Gün
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, color: T.textSoft }}>
          <span>Toplam: <strong style={{ color: T.text }}>{toplamPlanli}</strong></span>
          <span>Tamamlanan: <strong style={{ color: T.green }}>{toplamTamamlanan}</strong></span>
          <span>Oran: <strong style={{ color: T.text }}>%{oran}</strong></span>
        </div>
      </div>

      <div ref={wrapRef} style={{ width: '100%', height: 260 }}>
        {size.w > 0 && (
          <BarChart width={size.w} height={size.h} data={data}
            margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="etiketKisa"
              tick={(props: any) => {
                const { x, y, payload, index } = props
                const d = data[index]
                const isBugun = d?.isToday
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text x={0} y={0} dy={14} textAnchor="middle"
                      fill={isBugun ? T.blue : '#374151'}
                      style={{ fontSize: 12, fontWeight: isBugun ? 800 : 600 }}>
                      {payload.value}
                    </text>
                    <text x={0} y={0} dy={30} textAnchor="middle"
                      fill={isBugun ? T.blue : T.textSoft}
                      style={{ fontSize: 10.5, fontWeight: isBugun ? 700 : 500 }}>
                      {d?.tarih}
                    </text>
                    {isBugun && (
                      <text x={0} y={0} dy={45} textAnchor="middle"
                        fill={T.blue} style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.4 }}>
                        BUGÜN
                      </text>
                    )}
                  </g>
                )
              }}
              height={52}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fontWeight: 600 }} />
            <Tooltip
              cursor={{ fill: 'rgba(15,23,42,0.04)' }}
              formatter={(value: any, name: any) => [`${value} araç`, name]}
              labelFormatter={(_lbl, payload: any) => {
                const item = payload?.[0]?.payload as Veri | undefined
                if (!item) return ''
                return `${item.etiketKisa} · ${item.tarih}${item.isToday ? ' (Bugün)' : ''}`
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
            <Bar dataKey="Tamamlanan" stackId="a" fill={T.green} radius={[0, 0, 4, 4]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.isToday ? T.green : '#4ade80'} />
              ))}
            </Bar>
            <Bar dataKey="Kalan" stackId="a" fill={T.blueLight} radius={[4, 4, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.isToday ? T.blue : T.blueLight}
                  stroke={d.isToday ? T.blue : '#bfdbfe'} strokeWidth={d.isToday ? 1.5 : 1} />
              ))}
            </Bar>
          </BarChart>
        )}
      </div>
    </div>
  )
}
