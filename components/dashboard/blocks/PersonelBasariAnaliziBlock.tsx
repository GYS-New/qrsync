'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DashboardBlockProps } from '../types'

type Mode = 'gunluk' | 'haftalik' | 'aylik'

function rangeStartFor(mode: Mode) {
  const now = new Date()
  if (mode === 'gunluk')   return new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (mode === 'haftalik') return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
}

export default function PersonelBasariAnaliziBlock({
  firmaId, projeId, basePath, yetkiliLokIds,
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
      const rangeISO = rangeStart.toISOString()
      const sel = 'islemi_yapan_id,tamamlayan_kullanici_id,atanan_kullanici_id,olusturma_tarihi,durum,tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim)'

      // Canlı tamamlananlar
      let qC = supabase.from('canli_gorevler').select(sel)
        .gte('olusturma_tarihi', rangeISO).in('durum', ['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN'])
      if (firmaId) qC = qC.eq('firma_id', firmaId)
      if (projeId) qC = (qC as any).eq('proje_id', projeId)
      if (yetkiliLokIds?.length) qC = (qC as any).in('lokasyon_id', yetkiliLokIds)

      // Arşiv tamamlananlar
      let qA = supabase.from('canli_gorevler_arsiv').select(sel)
        .gte('olusturma_tarihi', rangeISO).in('durum', ['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN'])
      if (firmaId) qA = qA.eq('firma_id', firmaId)
      if (projeId) qA = (qA as any).eq('proje_id', projeId)
      if (yetkiliLokIds?.length) qA = (qA as any).in('lokasyon_id', yetkiliLokIds)

      const [{ data: canli }, { data: arsiv }] = await Promise.all([
        qC.limit(5000),
        qA.limit(5000),
      ])
      if (lastReq.current !== reqId) return

      const agg: Record<string, { id: string; name: string; value: number }> = {}
      ;[...(canli ?? []), ...(arsiv ?? [])].forEach((r: any) => {
        // İşlemi yapan > tamamlayan > atanan sırasıyla personel belirle
        const id = r.islemi_yapan_id ?? r.tamamlayan_kullanici_id ?? r.atanan_kullanici_id ?? 'unknown'
        const name = r?.islemi_yapan?.isim_soyisim ?? r?.tamamlayan?.isim_soyisim ?? '—'
        if (!agg[id]) agg[id] = { id, name, value: 0 }
        agg[id].value += 1
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
    const ch = supabase.channel('dashboard-personel-basari')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'canli_gorevler' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'canli_gorevler_arsiv' }, () => fetchData())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, firmaId, projeId])

  const maxVal = Math.max(1, ...rows.map((r) => r.value))

  return (
    <div className="verde-card h-[420px] flex flex-col">
      <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>PERSONEL BAŞARI ANALİZİ</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            En çok tamamlayan 3 personel • canlı + arşiv
          </div>
        </div>
        <Link href={`${basePath}/dashboard/canli-islemler`} className="text-[13px] text-[#374151] hover:underline mt-[2px]">Tümünü Gör</Link>
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

        <div style={{ flex: 1, minHeight: 0, border: '1px solid #f3f4f6', borderRadius: 12, background: 'linear-gradient(180deg, rgba(240,249,240,.85), rgba(255,255,255,.92))', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 54px', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f3f4f6', fontSize: 12, fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            <div>No</div><div>Personel</div><div style={{ textAlign: 'right' }}>Adet</div>
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
                      <div style={{ fontSize: 13.5, fontWeight: 800, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: isEmpty ? 0.45 : 1 }}>
                        {isEmpty ? '—' : r.name}
                      </div>
                      <div style={{ marginTop: 8, height: 10, borderRadius: 999, background: '#f3f4f6', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: `linear-gradient(90deg,${['#3b82f6','#10b981','#f59e0b'][i % 3]},${['#2563eb','#059669','#d97706'][i % 3]})`, opacity: isEmpty ? 0 : 0.9 }} />
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
          <div style={{ textAlign: 'center', color: '#6b7280', paddingTop: 12, fontSize: 13.5 }}>Seçilen aralıkta tamamlanan görev bulunamadı</div>
        )}
      </div>
    </div>
  )
}
