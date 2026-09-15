'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, LabelList,
} from 'recharts'

type Veri = {
  etiketKisa: string
  tarih: string
  Hedef: number
  Toplam: number
  Planli: number
  Plansiz: number
  Kayitsiz: number
  isToday: boolean
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e5e7eb',
  blue: '#1d4ed8', blueLight: '#dbeafe',
  green: '#16a34a', greenLight: '#dcfce7',
  amber: '#d97706',
  slate: '#334155',
  cyan: '#0891b2',
}

// 5 bar renk paleti — bugun icin biraz daha koyu tonlar
const BAR_RENK = {
  Hedef:    { normal: '#93c5fd', bugun: T.blue },     // acik mavi → mavi
  Toplam:   { normal: '#94a3b8', bugun: T.slate },    // gri → koyu gri
  Planli:   { normal: '#4ade80', bugun: T.green },    // acik yesil → yesil
  Plansiz:  { normal: '#fcd34d', bugun: T.amber },    // acik sari → amber
  Kayitsiz: { normal: '#67e8f9', bugun: T.cyan },     // acik turkuaz → cyan
}
type BarKey = keyof typeof BAR_RENK

export default function YikamaTakvimiChart({ data }: { data: Veri[] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 300 })

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0) setSize({ w: Math.floor(rect.width), h: 300 })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const toplamHedef = data.reduce((s, d) => s + d.Hedef, 0)
  const toplamGercek = data.reduce((s, d) => s + d.Toplam, 0)
  const toplamPlanli = data.reduce((s, d) => s + d.Planli, 0)
  const toplamPlansiz = data.reduce((s, d) => s + d.Plansiz, 0)
  const toplamKayitsiz = data.reduce((s, d) => s + d.Kayitsiz, 0)
  const oran = toplamHedef > 0 ? Math.round((toplamPlanli / toplamHedef) * 100) : 0

  return (
    <div className="verde-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Yıkama Takvimi — Bu Hafta (Pzt-Pz) · Hedef / Toplam / Planlı / Plansız / Kayıtsız
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: T.textSoft, flexWrap: 'wrap' }}>
          <span>Hedef: <strong style={{ color: T.blue }}>{toplamHedef}</strong></span>
          <span>Toplam: <strong style={{ color: T.slate }}>{toplamGercek}</strong></span>
          <span>Planlı: <strong style={{ color: T.green }}>{toplamPlanli}</strong></span>
          <span>Plansız: <strong style={{ color: T.amber }}>{toplamPlansiz}</strong></span>
          <span>Kayıtsız: <strong style={{ color: T.cyan }}>{toplamKayitsiz}</strong></span>
          <span>Oran: <strong style={{ color: T.text }}>%{oran}</strong></span>
        </div>
      </div>

      <div ref={wrapRef} style={{ width: '100%', height: 300 }}>
        {size.w > 0 && (
          <BarChart width={size.w} height={size.h} data={data}
            margin={{ top: 16, right: 16, left: 0, bottom: 4 }}
            barCategoryGap="12%" barGap={1}>
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
              formatter={(value: any, name: any) => [`${value}`, name]}
              labelFormatter={(_lbl, payload: any) => {
                const item = payload?.[0]?.payload as Veri | undefined
                if (!item) return ''
                return `${item.etiketKisa} · ${item.tarih}${item.isToday ? ' (Bugün)' : ''}`
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} iconType="square" />
            {(['Hedef', 'Toplam', 'Planli', 'Plansiz', 'Kayitsiz'] as BarKey[]).map(k => (
              <Bar key={k} dataKey={k} name={k === 'Planli' ? 'Planlı' : k === 'Plansiz' ? 'Plansız' : k === 'Kayitsiz' ? 'Kayıtsız' : k}
                fill={BAR_RENK[k].normal} radius={[4, 4, 0, 0]} maxBarSize={22}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.isToday ? BAR_RENK[k].bugun : BAR_RENK[k].normal} />
                ))}
                <LabelList dataKey={k} position="top"
                  style={{ fontSize: 9.5, fontWeight: 700, fill: BAR_RENK[k].bugun }}
                  formatter={(v: any) => v > 0 ? v : ''} />
              </Bar>
            ))}
          </BarChart>
        )}
      </div>
    </div>
  )
}
