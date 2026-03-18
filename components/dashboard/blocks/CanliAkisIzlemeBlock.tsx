'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime } from '@/lib/utils'
import { ClipboardList, MapPin } from 'lucide-react'
import type { DashboardBlockProps } from '../types'

type CanliGorevRow = {
  id: string
  tanim?: string | null
  durum?: string | null
  durum_degisim_tarihi?: string | null
  olusturma_tarihi?: string | null
  lokasyonlar?: { tanim?: string | null } | null
  users?: { isim_soyisim?: string | null } | null
}

const STATUS_TRY = ['TAMAMLANDI', 'IPTAL', 'KAPATILDI', 'SILINDI']

export default function CanliAkisIzlemeBlock({ firmaId, basePath, projeId }: DashboardBlockProps & { firmaId: string | null; projeId?: string | null }) {
  const supabase = createClient()
  const [rows, setRows] = useState<CanliGorevRow[]>([])
  const MAX_ROWS = 7
  const [limit, setLimit] = useState(MAX_ROWS)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const selectCols = useMemo(
    () =>
      'id,tanim,durum,durum_degisim_tarihi,olusturma_tarihi,lokasyonlar(tanim),users!atanan_kullanici_id(isim_soyisim)',
    []
  )

  // Fit-by-height: compute how many table rows can be displayed inside the card body.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height
      // Rough row height (px) + header padding.
      const header = 44
      const rowH = 44
      const computed = Math.max(3, Math.floor((h - header) / rowH))
      setLimit(Math.min(MAX_ROWS, computed))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  async function fetchLive() {
    // Try with extended statuses. If enum doesn't include some values, retry with only TAMAMLANDI.
    let q = supabase
      .from('canli_gorevler')
      .select(selectCols)
      .in('durum', STATUS_TRY)
      .order('durum_degisim_tarihi', { ascending: false })
      .limit(limit)
    if (firmaId) q = q.eq('firma_id', firmaId)
    if (projeId) q = (q as any).eq('proje_id', projeId)

    let { data, error } = await q
    if (error && String(error.message ?? '').toLowerCase().includes('enum')) {
      let q2 = supabase
        .from('canli_gorevler')
        .select(selectCols)
        .in('durum', ['TAMAMLANDI'])
        .order('durum_degisim_tarihi', { ascending: false })
        .limit(limit)
      if (firmaId) q2 = q2.eq('firma_id', firmaId)
      if (projeId) q2 = (q2 as any).eq('proje_id', projeId)
      const r2 = await q2
      data = (r2.data as any) ?? []
      error = r2.error as any
    }
    if (!error && data) setRows((data as any) ?? [])
  }

  useEffect(() => {
    fetchLive()
    const t = setInterval(fetchLive, 1000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId, projeId, limit])

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
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f1a0f' }}>FREKANSİYEL GÖREV AKIŞI</div>
          <div style={{ fontSize: 13, color: '#7a907a', marginTop: 1 }}>Son durum değişimleri</div>
        </div>
        <Link href={`${basePath}/dashboard/canli-islemler`} className="text-[13px] text-[#2e8b2e] hover:underline mt-[2px]">
          Tümünü Gör
        </Link>
      </div>

      {/* Height is controlled by layout; we calculate row limit based on this block's body height. */}
      <div ref={wrapRef} className="flex-1 overflow-auto" style={{ padding: 14, minHeight: 0 }}>
        <table className="verde-table" style={{ marginTop: 0 }}>
          <thead>
            <tr>
              <th style={{ width: 44 }}>NO</th>
              <th>Görev</th>
              <th>Lokasyon</th>
              <th>Atanan</th>
              <th>Durum</th>
              <th>Tarih</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: limit }).map((_, idx) => {
              const r = rows?.[idx]
              const isEmpty = !r
              return (
                <tr key={r?.id ?? `placeholder-${idx}`}>
                <td style={{ color: '#2e8b2e', fontWeight: 900, whiteSpace: 'nowrap' }}>{idx + 1}</td>
                <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                    <ClipboardList size={14} />
                    <span>{isEmpty ? '—' : (r?.tanim ?? '—')}</span>
                  </span>
                </td>
                <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#506050' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <MapPin size={14} />
                    <span>{isEmpty ? '—' : ((r as any).lokasyonlar?.tanim ?? '—')}</span>
                  </span>
                </td>
                <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#506050' }}>
                  <span>{isEmpty ? '—' : ((r as any).users?.isim_soyisim ?? '—')}</span>
                </td>
                <td>
                  <span className={`verde-badge ${!isEmpty && r?.durum === 'TAMAMLANDI' ? 'status-tamamlandi' : 'status-iptal'}`}>
                    {isEmpty ? '—' : (r?.durum ?? '—')}
                  </span>
                </td>
                <td style={{ color: '#7a907a', whiteSpace: 'nowrap' }}>
                  {isEmpty ? '—' : formatDateTime((r?.durum_degisim_tarihi as any) ?? (r?.olusturma_tarihi as any))}
                </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}