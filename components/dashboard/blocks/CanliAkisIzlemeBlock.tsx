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

const DURUM_CSS: Record<string, string> = {
  TAMAMLANDI:            'status-tamamlandi',
  ZAMANINDA_YAPILAMAYAN: 'status-zamaninda',
  ZAMANI_GECMIS:         'status-zamaninda',
  IPTAL:                 'status-iptal',
  SILINDI:               'status-iptal',
  KAPATILDI:             'status-iptal',
  BEKLEMEDE:             'status-beklemede',
  HAZIR:                 'status-hazir',
}

const DURUM_LABEL: Record<string, string> = {
  TAMAMLANDI:            'Tamamlandı',
  ZAMANINDA_YAPILAMAYAN: 'Gec. Tamam',
  ZAMANI_GECMIS:         'Zamanı Geçti',
  IPTAL:                 'İptal',
  SILINDI:               'Silindi',
  KAPATILDI:             'Kapatıldı',
  BEKLEMEDE:             'Beklemede',
  HAZIR:                 'Hazır',
  ACIK:                  'Açık',
  ISLEMDE:               'İşlemde',
}

export default function CanliAkisIzlemeBlock({
  firmaId, basePath, projeId, yetkiliLokIds,
}: DashboardBlockProps & { firmaId: string | null; projeId?: string | null }) {
  const supabase = createClient()
  const [rows, setRows] = useState<CanliGorevRow[]>([])
  const MAX_ROWS = 7
  const [limit, setLimit] = useState(MAX_ROWS)
  const yetkiliLokIdsKey = useMemo(() => (yetkiliLokIds ?? []).slice().sort().join(','), [yetkiliLokIds])
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const selectCols = useMemo(
    () => 'id,tanim,durum,durum_degisim_tarihi,olusturma_tarihi,lokasyonlar(tanim),users!islemi_yapan_id(isim_soyisim)',
    []
  )

  // Yüksekliğe göre satır sayısını hesapla
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height
      const computed = Math.max(3, Math.floor((h - 44) / 44))
      setLimit(Math.min(MAX_ROWS, computed))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  async function fetchLive() {
    // Chunk-aware sorgu: yetkiliLokIds buyukse (>100 UUID) 100'luk parcalara bol,
    // her chunk'tan limit kadar cek, client-side merge+sort+slice yap. URL
    // Cloudflare 8KB limitini asmaz.
    const buildBase = (slice: string[] | null) => {
      let q = supabase.from('canli_gorevler').select(selectCols)
        .not('durum', 'in', '("HAZIR")')
        .order('durum_degisim_tarihi', { ascending: false, nullsFirst: false })
        .limit(limit)
      if (firmaId) q = q.eq('firma_id', firmaId)
      if (projeId) q = (q as any).eq('proje_id', projeId)
      if (slice) q = (q as any).in('lokasyon_id', slice)
      return q
    }

    const runWithLok = async (): Promise<any[] | null> => {
      if (!yetkiliLokIds || yetkiliLokIds.length === 0) {
        const { data, error } = await buildBase(null)
        if (error) return null
        return data ?? []
      }
      if (yetkiliLokIds.length <= 100) {
        const { data, error } = await buildBase(yetkiliLokIds)
        if (error) return null
        return data ?? []
      }
      const out: any[] = []
      for (let i = 0; i < yetkiliLokIds.length; i += 100) {
        const { data } = await buildBase(yetkiliLokIds.slice(i, i + 100))
        if (data) out.push(...data)
      }
      return out
    }

    const data = await runWithLok()
    if (data) {
      // Client-side sort + limit (chunk'lardan gelen birlesik liste)
      const sorted = [...data].sort((a: any, b: any) =>
        (b.durum_degisim_tarihi ?? '').localeCompare(a.durum_degisim_tarihi ?? ''))
      setRows(sorted.slice(0, limit))
      return
    }

    // Fallback: olusturma_tarihi (sadece orijinal sorgu hata verdiginde)
    const buildBase2 = (slice: string[] | null) => {
      let q2 = supabase.from('canli_gorevler').select(selectCols)
        .order('olusturma_tarihi', { ascending: false })
        .limit(limit)
      if (firmaId) q2 = q2.eq('firma_id', firmaId)
      if (projeId) q2 = (q2 as any).eq('proje_id', projeId)
      if (slice) q2 = (q2 as any).in('lokasyon_id', slice)
      return q2
    }
    const out2: any[] = []
    if (!yetkiliLokIds || yetkiliLokIds.length === 0) {
      const { data: d2 } = await buildBase2(null)
      if (d2) out2.push(...d2)
    } else {
      for (let i = 0; i < yetkiliLokIds.length; i += 100) {
        const { data: d2 } = await buildBase2(yetkiliLokIds.slice(i, i + 100))
        if (d2) out2.push(...d2)
      }
    }
    const sorted2 = out2.sort((a: any, b: any) =>
      (b.olusturma_tarihi ?? '').localeCompare(a.olusturma_tarihi ?? ''))
    setRows(sorted2.slice(0, limit) as any)
  }

  useEffect(() => {
    fetchLive()
    const t = setInterval(fetchLive, 5000)   // 5 saniyede bir — 1s çok agresif
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId, projeId, limit, yetkiliLokIdsKey])

  return (
    <div className="verde-card dashboard-border-intro h-[420px] flex flex-col">
      <div style={{
        padding: '16px 18px 12px', borderBottom: '1px solid #f3f4f6',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>FREKANSİYEL GÖREV AKIŞI</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 1 }}>Son durum değişimleri</div>
        </div>
        <Link href={`${basePath}/dashboard/canli-islemler`} className="text-[13px] text-[#374151] hover:underline mt-[2px]">
          Tümünü Gör
        </Link>
      </div>

      <div ref={wrapRef} className="flex-1 overflow-auto" style={{ padding: 14, minHeight: 0 }}>
        <table className="verde-table" style={{ marginTop: 0 }}>
          <thead>
            <tr>
              <th style={{ width: 36 }}>NO</th>
              <th>Görev</th>
              <th>Lokasyon</th>
              <th>İşlemi Yapan</th>
              <th>Durum</th>
              <th>Tarih</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: limit }).map((_, idx) => {
              const r = rows?.[idx]
              const isEmpty = !r
              const durum = r?.durum ?? ''
              const css = DURUM_CSS[durum] ?? 'status-islemde'
              return (
                <tr key={r?.id ?? `ph-${idx}`}>
                  <td style={{ color: '#374151', fontWeight: 900 }}>{idx + 1}</td>
                  <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                      <ClipboardList size={13} />
                      {isEmpty ? '—' : (r?.tanim ?? '—')}
                    </span>
                  </td>
                  <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#4b5563' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <MapPin size={13} />
                      {isEmpty ? '—' : ((r as any).lokasyonlar?.tanim ?? '—')}
                    </span>
                  </td>
                  <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#4b5563' }}>
                    {isEmpty ? '—' : ((r as any).users?.isim_soyisim ?? '—')}
                  </td>
                  <td>
                    {isEmpty
                      ? <span className="verde-badge">—</span>
                      : <span className={`verde-badge ${css}`}>{DURUM_LABEL[durum] ?? durum}</span>
                    }
                  </td>
                  <td style={{ color: '#6b7280', whiteSpace: 'nowrap', fontSize: 12 }}>
                    {isEmpty ? '—' : formatDateTime((r?.durum_degisim_tarihi ?? r?.olusturma_tarihi) as string)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, paddingTop: 32 }}>
            Henüz işlem kaydı yok
          </div>
        )}
      </div>
    </div>
  )
}
