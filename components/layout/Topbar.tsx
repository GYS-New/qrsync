'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import UserPanel from '@/components/layout/UserPanel'
import DashboardScopeControls from '@/components/layout/DashboardScopeControls'
import BildirimBar from '@/components/dashboard/BildirimBar'
import { useFirma } from '@/components/layout/FirmaContext'

interface TopbarProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  breadcrumbs?: { label: string; href?: string }[]
  /** Optional: if provided, Topbar uses it; otherwise fetches unread count client-side */
  notifCount?: number
  base: string
  /** Firma + Proje seçicilerini gizle (örn. Oto Yıkama modülünde modül-bağımsız
   *  scope yok, kullanıcı kendi firmasında/lokasyonunda çalışır) */
  hideScopeControls?: boolean
  /** Topbar altındaki cron/aktivite bildirim çubuğunu gizle (modül-içi UI'lar için) */
  hideNotifBar?: boolean
  /** Üst sağdaki 🔔 bildirim zilini gizle — modül-içi sayfalarda (Oto Yıkama
   *  vs.) tıklama kullanıcıyı GYS'ye atmasın. Bildirim için modül değişimi
   *  gerek; kullanıcı bilinçli olarak GYS'ye geçsin. */
  hideNotifBell?: boolean
}

// Breadcrumb label → href mapping
const BREADCRUMB_HREF_MAP: Record<string, string> = {
  'Yönetim': '',
  'Sistem': '',
  'Gösterge Paneli': '/dashboard',
  'Kullanıcılar': '/dashboard/kullanicilar',
  'Lokasyonlar': '/dashboard/lokasyonlar',
  'Lokasyon Grupları': '/dashboard/lokasyon-gruplari',
  'Spesifik Görevler': '/dashboard/gorevler',
  'Frekansiyel Görevler': '/dashboard/canli-islemler',
  'Tüm Görevler': '/dashboard/canli-islemler/tum-gorevler',
  'Canlı Görev Akışı': '/dashboard/canli-islemler',
  'Checklist Şablonları': '/dashboard/checklist-sablonlari',
  'Personel Takibi': '/dashboard/personel-takibi',
  'Raporlar': '/dashboard/raporlar',
  'Arşiv': '/dashboard/arsiv',
  'Sistem Ayarları': '/dashboard/sistem-ayarlari',
  'Görev Kuralları': '/dashboard/sistem-ayarlari',
  'Bildirimler': '/dashboard/bildirimler',
  'Projeler': '/dashboard/projeler',
  'Firmalar': '/dashboard/firmalar',
  'Birim Fiyatlar': '/dashboard/birim-fiyatlar',
}

export default function Topbar({ title, subtitle, actions, breadcrumbs, notifCount, base, hideScopeControls, hideNotifBar, hideNotifBell }: TopbarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [navigating, setNavigating] = useState(false)

  // Sayfa değişince loading'i kapat
  useEffect(() => { setNavigating(false) }, [pathname])
  const supabase = useMemo(() => createClient(), [])
  const [count, setCount] = useState<number>(notifCount ?? 0)
  const { firmaId: saFirmaId, firmalar } = useFirma()
  const aktifFirma = firmalar?.find((f: any) => f.id === saFirmaId)

  // TA/U/M rolleri için kendi firma adını çek
  const [myFirmaAdi, setMyFirmaAdi] = useState<string | null>(null)
  useEffect(() => {
    if (aktifFirma) return // SA zaten FirmaContext'ten alıyor
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('users').select('firma_id').eq('id', user.id).single().then(({ data: me }) => {
        if (!me?.firma_id) return
        supabase.from('firmalar').select('firma_adi,ticari_unvan').eq('id', me.firma_id).single().then(({ data: f }) => {
          if (f) setMyFirmaAdi(f.firma_adi || f.ticari_unvan || null)
        })
      })
    })
  }, [])

  const firmaAdi = aktifFirma?.firma_adi || aktifFirma?.ticari_unvan || myFirmaAdi || 'QRSync'

  // Oto Yıkama modülü içindeyken GYS bildirim badge'i gizlenir — ATALIAN TA
  // talebi: GYS bildirimleri Oto Yıkama'da görünmesin. Oto Yıkama'ya özel
  // bildirim akışı ayrıştırıldığında bu guard kaldırılacak.
  const isOtoYikama = pathname?.startsWith('/oto-yikama') ?? false

  useEffect(() => {
    if (typeof notifCount === 'number') {
      setCount(notifCount)
      return
    }
    if (isOtoYikama) {
      setCount(0)
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
  }, [notifCount, supabase, isOtoYikama])

  const badgeText = count > 99 ? '99+' : String(count)

  // M rolü dışında bildirim barı göster
  const showBar = base !== '/m'

  return (
    <>
    <header style={{
      background:'#fff', borderBottom: showBar ? 'none' : '1px solid #e5e7eb',
      height:69, padding:'0 28px',
      display:'flex', alignItems:'center', gap:16,
      position:'sticky', top:0, zIndex:10,
    }}>
      {/* Breadcrumb + Loading */}
      <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:15 }}>
        <span
          style={{ color:'#6b7280', cursor:'pointer', transition:'color .15s' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#111827')}
          onMouseLeave={e => (e.currentTarget.style.color = '#6b7280')}
          onClick={() => { setNavigating(true); router.push(`${base}/dashboard`) }}
        >{firmaAdi}</span>
        {breadcrumbs?.map((b, i) => {
          const isLast = i === breadcrumbs.length - 1
          const href = b.href || (isLast ? '' : BREADCRUMB_HREF_MAP[b.label] ? `${base}${BREADCRUMB_HREF_MAP[b.label]}` : '')
          const clickable = !!href && !isLast
          return (
            <span key={i} style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ color:'#9ca3af', fontSize:15 }}>›</span>
              <span
                style={{
                  color: isLast ? '#374151' : '#6b7280',
                  fontWeight: isLast ? 600 : 400,
                  cursor: clickable ? 'pointer' : 'default',
                  transition: 'color .15s',
                }}
                onMouseEnter={e => { if (clickable) e.currentTarget.style.color = '#111827' }}
                onMouseLeave={e => { if (clickable) e.currentTarget.style.color = '#6b7280' }}
                onClick={() => { if (clickable) { setNavigating(true); router.push(href) } }}
              >{b.label}</span>
            </span>
          )
        })}
        {navigating && (
          <span style={{ marginLeft: 8, display: 'inline-flex', alignItems: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" style={{ animation: 'spin 0.8s linear infinite' }}>
              <circle cx="12" cy="12" r="10" stroke="#3b82f6" strokeWidth="3" fill="none" strokeDasharray="31.4 31.4" strokeLinecap="round" />
            </svg>
          </span>
        )}
      </div>

      {/* Right */}
      <div style={{ marginLeft:'auto', display:'flex',  alignItems:'center', gap:10 }}>
        {!hideScopeControls && <DashboardScopeControls base={base} />}
        {actions}

        {/* Notifications — modül-içi sayfalarda sarmal route'a git
            (Oto Yıkama sidebar/modül korunur). hideNotifBell hâlâ saygılı. */}
        {!hideNotifBell && (
          <div
            onClick={() => router.push(pathname?.startsWith('/oto-yikama') ? '/oto-yikama/bildirimler' : `${base}/dashboard/bildirimler`)}
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
        )}

        {/* Settings — modül-içi sayfalarda (Oto Yıkama vb.) sarmal route'a
            git, sidebar/modül değişmesin. */}
        <div
          onClick={() => router.push(pathname?.startsWith('/oto-yikama') ? '/oto-yikama/ayarlar' : `${base}/dashboard/ayarlar`)}
          style={{ width:34, height:34, border:'1px solid #e5e7eb', borderRadius:10, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', position:'relative', fontSize:20, color:'#4b5563' }}
          title="Ayarlar"
        >
          ⚙️
        </div>

        {/* User panel (standard for all roles) */}
        <UserPanel base={base} />
      </div>
    </header>
    {showBar && !hideNotifBar && <BildirimBar rol={base === '/sa' ? 'super_admin' : base === '/ta' ? 'tenant_admin' : 'tenant_user'} />}
    </>
  )
}
