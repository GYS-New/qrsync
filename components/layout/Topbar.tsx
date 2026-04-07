'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import UserPanel from '@/components/layout/UserPanel'
import DashboardScopeControls from '@/components/layout/DashboardScopeControls'

interface TopbarProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  breadcrumbs?: { label: string; href?: string }[]
  /** Optional: if provided, Topbar uses it; otherwise fetches unread count client-side */
  notifCount?: number
  base: string
}

export default function Topbar({ title, subtitle, actions, breadcrumbs, notifCount, base }: TopbarProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [count, setCount] = useState<number>(notifCount ?? 0)

  useEffect(() => {
    if (typeof notifCount === 'number') {
      setCount(notifCount)
      return
    }
    let active = true
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { count } = await supabase
        .from('bildirimler')
        .select('id', { count: 'exact', head: true })
        .eq('alici_id', user.id)
        .eq('okundu', false)
      if (active) setCount(count ?? 0)
    })()

    const channel = supabase
      .channel('topbar_unread_count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bildirimler' }, async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { count } = await supabase
          .from('bildirimler')
          .select('id', { count: 'exact', head: true })
          .eq('alici_id', user.id)
          .eq('okundu', false)
        if (active) setCount(count ?? 0)
      })
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [notifCount, supabase])

  const badgeText = count > 99 ? '99+' : String(count)

  return (
    <header style={{
      background:'#fff', borderBottom:'1px solid #e5e7eb',
      height:69, padding:'0 28px',
      display:'flex', alignItems:'center', gap:16,
      position:'sticky', top:0, zIndex:10,
    }}>
      {/* Breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:15 }}>
        <span style={{ color:'#6b7280' }}>QRSync</span>
        {breadcrumbs?.map((b, i) => (
          <span key={i} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ color:'#9ca3af', fontSize:15 }}>›</span>
            <span
              style={{ color: i === (breadcrumbs.length - 1) ? '#374151' : '#6b7280', fontWeight: i === (breadcrumbs.length - 1) ? 600 : 400, cursor: b.href ? 'pointer' : 'default' }}
              onClick={() => b.href && router.push(b.href)}
            >{b.label}</span>
          </span>
        ))}
      </div>

      {/* Right */}
      <div style={{ marginLeft:'auto', display:'flex',  alignItems:'center', gap:10 }}>
        <DashboardScopeControls base={base} />
        {actions}

        {/* Notifications (moved from sidebar) */}
        <div
          onClick={() => router.push(`${base}/dashboard/bildirimler`)}
          style={{ width:34, height:34, border:'1px solid #e5e7eb', borderRadius:10, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', position:'relative', fontSize:20, color:'#4b5563' }}
          title="Bildirimler"
        >
          🔔
          {count > 0 && (
            <span style={{
              position:'absolute', top:-6, right:-6,
              minWidth:18, height:18, padding:'0 5px',
              background:'#b91c1c', color:'#fff', borderRadius:999,
              border:'2px solid #fff',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:12, fontWeight:700, lineHeight:'18px'
            }}>
              {badgeText}
            </span>
          )}
        </div>

        {/* Settings */}
        <div
          onClick={() => router.push(`${base}/dashboard/ayarlar`)}
          style={{ width:34, height:34, border:'1px solid #e5e7eb', borderRadius:10, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', position:'relative', fontSize:20, color:'#4b5563' }}
          title="Ayarlar"
        >
          ⚙️
        </div>

        {/* User panel (standard for all roles) */}
        <UserPanel base={base} />
      </div>
    </header>
  )
}
