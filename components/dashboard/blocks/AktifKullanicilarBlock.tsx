'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import type { DashboardBlockProps } from '../types'

type Row = {
  id: string
  isim_soyisim: string
  rol: string
  profil_foto?: string | null
  last_seen_at?: string | null
  firmalar?: { firma_adi?: string | null; ticari_unvan?: string | null } | null
}

export default function AktifKullanicilarBlock({
  firmaId,
  basePath,
  limit = 6,
  projeId,
}: DashboardBlockProps & { firmaId: string | null; projeId?: string | null; limit?: number }) {
  const [rows, setRows] = useState<Row[]>([])

  const padded = useMemo(() => {
    const arr = Array.from({ length: limit }).map((_, i) => rows[i] ?? null)
    return arr
  }, [rows, limit])

  useEffect(() => {
    let alive = true
    let t: any

    const load = async () => {
      try {
        const qp = new URLSearchParams({ limit: String(limit) })
        if (firmaId) qp.set('firma', firmaId)
        if (projeId) qp.set('projeId', projeId)
        const res = await fetch(`/api/online-users?${qp.toString()}`, { method: 'GET' })
        const json = await res.json()
        if (!alive) return
        if (json?.ok) setRows(json.users ?? [])
      } catch {
        // ignore
      }
    }

    load()
    t = setInterval(load, 15_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [limit, firmaId, projeId])

  return (
    <div className="verde-card h-[420px] flex flex-col">
      <div
        style={{
          padding: '16px 18px 12px',
          borderBottom: '1px solid #f3f4f6',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>ONLİNE KULLANICILAR</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 1 }}>Son 2 dk içinde aktif</div>
        </div>
        <Link
          href={basePath === '/sa' ? `${basePath}/dashboard/firma-kullanicilar` : `${basePath}/dashboard/kullanicilar`}
          className="text-[13px] text-[#374151] hover:underline mt-[2px]"
        >
          Tümünü Gör
        </Link>
      </div>

      {/* Header row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '44px 1fr 74px',
          gap: 10,
          padding: '10px 18px',
          borderBottom: '1px solid #f3f4f6',
          fontSize: 12,
          fontWeight: 800,
          color: '#9ca3af',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        <div>NO</div>
        <div>Kullanıcı</div>
        <div>Rol</div>
      </div>

      <div className="flex-1 overflow-auto">
        {padded.map((u: any, i: number) => {
          const isEmpty = !u
          const initials = isEmpty
            ? '—'
            : u.isim_soyisim?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()

          return (
            <div
              key={u?.id ?? `placeholder-${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '44px 1fr 74px',
                gap: 10,
                padding: '12px 18px',
                borderBottom: '1px solid #f3f4f6',
                alignItems: 'center',
              }}
            >
              <div style={{ color: '#374151', fontWeight: 900 }}>{i + 1}</div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg,#374151,#1f2937)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: 12,
                    fontWeight: 800,
                    flexShrink: 0,
                    opacity: isEmpty ? 0.35 : 1,
                  }}
                >
                  {initials}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isEmpty ? '—' : u.isim_soyisim}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {isEmpty ? '—' : (u.firmalar?.firma_adi || u.firmalar?.ticari_unvan || 'Sistem')}
                  </div>
                </div>
              </div>

              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: 3,
                  background: '#e5e7eb',
                  color: '#1f2937',
                  border: '1px solid #d1d5db',
                  justifySelf: 'start',
                  opacity: isEmpty ? 0.35 : 1,
                }}
              >
                {isEmpty ? '—' : u.rol === 'super_admin' ? 'SA' : u.rol === 'tenant_admin' ? 'Admin' : 'User'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
