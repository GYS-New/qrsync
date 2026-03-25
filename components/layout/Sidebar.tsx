'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import UserAvatar from './UserAvatar'
import type { User, UserRole } from '@/types'
import { useRouteLoading } from '@/components/ui/RouteLoadingProvider'
import ProataLogo, { ProataMark } from '@/components/brand/ProataLogo'
import { useProje } from '@/components/projeler/ProjeContext'
import { useFirma } from '@/components/layout/FirmaContext'

interface NavItem {
  label: string
  href: string
  icon: string
}
interface NavGroup {
  label: string
  items: NavItem[]
}

function getNav(base: string, rol: UserRole): NavGroup[] {
  const isSA = rol === 'super_admin' || rol === 'alt_super_admin'
  const isTA = rol === 'tenant_admin'
  const isMusteri = rol === 'musteri'

  const mgmt: NavItem[] = isSA
    ? [
        ...(rol === 'super_admin' ? [{ label: 'Süper Adminler', href: `${base}/dashboard/super-adminler`, icon: '🛡️' }] : []),
        { label: 'Firmalar', href: `${base}/dashboard/firmalar`, icon: '🏢' },
        { label: 'Firma Adminleri', href: `${base}/dashboard/firma-adminler`, icon: '👤' },
        { label: 'Firma Kullanıcıları', href: `${base}/dashboard/firma-kullanicilar`, icon: '👥' },
        { label: 'Projeler', href: `${base}/dashboard/projeler`, icon: '🗂️' },
        { label: 'Lokasyonlar', href: `${base}/dashboard/lokasyonlar`, icon: '📍' },
        { label: 'Lokasyon Grupları', href: `${base}/dashboard/lokasyon-gruplari`, icon: '🗺️' },
        { label: 'Spesifik Görevler', href: `${base}/dashboard/gorevler`, icon: '✓' },
        { label: 'Checklist Şablonları', href: `${base}/dashboard/checklist-sablonlari`, icon: '🧾' },
        { label: 'Frekansiyel Görevler', href: `${base}/dashboard/canli-islemler`, icon: '⚡' },
        { label: 'Arşiv', href: `${base}/dashboard/arsiv`, icon: '🗃️' },
        { label: 'Personel Takibi', href: `${base}/dashboard/personel-takibi`, icon: '🧭' },
        { label: 'Raporlar', href: `${base}/dashboard/raporlar`, icon: '📊' },
      ]
    : isTA
      ? [
          { label: 'Projeler', href: `${base}/dashboard/projeler`, icon: '🗂️' },
          { label: 'Kullanıcılar', href: `${base}/dashboard/kullanicilar`, icon: '👥' },
          { label: 'Lokasyonlar', href: `${base}/dashboard/lokasyonlar`, icon: '📍' },
          { label: 'Lokasyon Grupları', href: `${base}/dashboard/lokasyon-gruplari`, icon: '🗺️' },
          { label: 'Spesifik Görevler', href: `${base}/dashboard/gorevler`, icon: '✓' },
          { label: 'Checklist Şablonları', href: `${base}/dashboard/checklist-sablonlari`, icon: '🧾' },
          { label: 'Frekansiyel Görevler', href: `${base}/dashboard/canli-islemler`, icon: '⚡' },
          { label: 'Arşiv', href: `${base}/dashboard/arsiv`, icon: '🗃️' },
          { label: 'Personel Takibi', href: `${base}/dashboard/personel-takibi`, icon: '🧭' },
          { label: 'Raporlar', href: `${base}/dashboard/raporlar`, icon: '📊' },
        ]
      : isMusteri
      ? [
          // musteri: sınırlı görüntüleme
          { label: 'Kullanıcılar', href: `${base}/dashboard/kullanicilar`, icon: '👥' },
          { label: 'Lokasyonlar', href: `${base}/dashboard/lokasyonlar`, icon: '📍' },
          { label: 'Spesifik Görevler', href: `${base}/dashboard/gorevler`, icon: '✓' },
          { label: 'Frekansiyel Görevler', href: `${base}/dashboard/canli-islemler`, icon: '⚡' },
          { label: 'Personel Takibi', href: `${base}/dashboard/personel-takibi`, icon: '🧭' },
          { label: 'Raporlar', href: `${base}/dashboard/raporlar`, icon: '📊' },
        ]
      : [
          // tenant_user: görüntüleme yetkisi olan menüler
          { label: 'Kullanıcılar', href: `${base}/dashboard/kullanicilar`, icon: '👥' },
          { label: 'Lokasyonlar', href: `${base}/dashboard/lokasyonlar`, icon: '📍' },
          { label: 'Spesifik Görevler', href: `${base}/dashboard/gorevler`, icon: '✓' },
          { label: 'Frekansiyel Görevler', href: `${base}/dashboard/canli-islemler`, icon: '⚡' },
          { label: 'Personel Takibi', href: `${base}/dashboard/personel-takibi`, icon: '🧭' },
          { label: 'Raporlar', href: `${base}/dashboard/raporlar`, icon: '📊' },
        ]

  return [
    { label: 'Ana Menü', items: [{ label: 'Gösterge Paneli', href: `${base}/dashboard`, icon: '⊞' }] },
    { label: 'Yönetim', items: mgmt },
    {
      label: 'Sistem',
      items: [
        { label: 'Profil Ayarları', href: `${base}/dashboard/ayarlar`, icon: '⚙' },
        { label: 'Dashboard Ayarları', href: `${base}/dashboard/ayarlar/dashboard`, icon: '🧩' },
        ...(isSA ? [{ label: 'Kullanıcı Grubu Yetkileri', href: `${base}/dashboard/ayarlar/kullanici-grubu-yetkileri`, icon: '🔐' }] : []),
      ],
    },
  ]
}

interface SidebarProps {
  user: User
  firma?: { ticari_unvan: string; firma_adi?: string; logo_url?: string } | null
  projeAdi?: string | null
}

type SidebarCounts = {
  users_total: number
  users_admin_total: number | null
  users_employee_total: number | null
  tasks_total: number
  locations_total: number
  live_total: number
  firms_total: number
  projects_total: number
  location_groups_total: number
  checklist_templates_total: number
  personnel_tracking_total: number
  reports_total: number
  arsiv_total: number
}

function CountBadge({ value, tone }: { value: number; tone: 'green' | 'yellow' | 'blue' | 'orange' }) {
  const palette = {
    green: { bg: '#dcf0dc', border: '#b8e0b8', text: '#1f6b1f' },
    yellow: { bg: '#fff2cc', border: '#ffe08a', text: '#7a5a00' },
    blue: { bg: '#e3f2ff', border: '#b7dcff', text: '#185a9b' },
    orange: { bg: '#ffe7d6', border: '#ffd0b0', text: '#8a3b00' },
  } as const

  const p = palette[tone]
  return (
    <span
      style={{
        marginLeft: 'auto',
        minWidth: 22,
        height: 22,
        padding: '0 7px',
        borderRadius: 999,
        border: `1px solid ${p.border}`,
        background: p.bg,
        color: p.text,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontWeight: 800,
        lineHeight: 1,
      }}
      aria-label={`count-${value}`}
    >
      {value}
    </span>
  )
}

export default function Sidebar({ user, firma, projeAdi: projeAdiProp }: { user: User; firma: any; projeAdi?: string | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const routeLoading = useRouteLoading()
  
  const isSA = user.rol === 'super_admin' || user.rol === 'alt_super_admin'

  // SA ve TA her ikisi de ProjeContext + FirmaContext kullanır
  const { aktifProje } = useProje()
  const { firmaId: saFirmaId } = useFirma()

  const [counts, setCounts] = useState<SidebarCounts | null>(null)
  const [countsError, setCountsError] = useState(false)

  const base =
    user.rol === 'super_admin' || user.rol === 'alt_super_admin'
      ? '/sa'
      : user.rol === 'tenant_admin'
        ? '/ta'
        : '/u'  // musteri ve tenant_user her ikisi de /u kullanır

  const groups = getNav(base, user.rol)

  // Fetch sidebar badge counts
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        setCountsError(false)
        const params = new URLSearchParams()
        if (isSA && saFirmaId) params.append('firma_id', saFirmaId)
        if (aktifProje?.id) params.append('proje_id', aktifProje.id)

        const url = params.toString() ? `/api/sidebar-counts?${params.toString()}` : '/api/sidebar-counts'
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error('fetch_failed')
        const json = await res.json()
        if (!json?.ok) throw new Error('bad_payload')
        if (!cancelled) setCounts(json)
      } catch {
        if (!cancelled) setCountsError(true)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [pathname, isSA, saFirmaId, aktifProje?.id])

  // IMPORTANT: "Gösterge Paneli" item'ı sub-route'larda seçili kalmasın.
  const isActive = (href: string) => {
    const isDashboardRoot = href === `${base}/dashboard`
    if (isDashboardRoot) return pathname === href
    return pathname === href || pathname.startsWith(href + '/')
  }

  const firmaLabel = firma?.firma_adi || firma?.ticari_unvan || ''
  // Footer: SA → 'Sistem', diğerleri → aktif proje adı (yoksa firma adı)
  const projeLabel = aktifProje?.ad || projeAdiProp || null
  const footerSubLabel = isSA ? 'Sistem' : (projeLabel || firmaLabel)

  const go = (href: string) => {
    // If already on the target route, don't start the loader (otherwise it can get stuck).
    if (href === pathname) return

    // Show an immediate overlay while the next page (and its client fetch) loads.
    routeLoading.start()
    router.push(href)
  }

  const badgeByHref = useMemo(() => {
    if (!counts) return {}
    const isSA = user.rol === 'super_admin' || user.rol === 'alt_super_admin'
    const isTA = user.rol === 'tenant_admin'

    const map: Record<string, { value: number; tone: 'green' | 'yellow' | 'blue' | 'orange' }> = {}

    // Users
    if (isSA) {
      // Show split counts on SA menu for clarity.
      map[`${base}/dashboard/firma-adminler`] = { value: counts.users_admin_total ?? 0, tone: 'green' }
      map[`${base}/dashboard/firma-kullanicilar`] = { value: counts.users_employee_total ?? 0, tone: 'green' }
    } else {
      map[`${base}/dashboard/kullanicilar`] = { value: counts.users_total, tone: 'green' }
    }
    // Locations / Tasks / Live
    map[`${base}/dashboard/lokasyonlar`] = { value: counts.locations_total, tone: 'blue' }
    map[`${base}/dashboard/gorevler`] = { value: counts.tasks_total, tone: 'yellow' }
    map[`${base}/dashboard/canli-islemler`] = { value: counts.live_total, tone: 'orange' }
    map[`${base}/dashboard/arsiv`] = { value: counts.arsiv_total, tone: 'blue' }

    // Additional counts for all roles
    map[`${base}/dashboard/projeler`] = { value: counts.projects_total, tone: 'blue' }
    map[`${base}/dashboard/lokasyon-gruplari`] = { value: counts.location_groups_total, tone: 'yellow' }
    map[`${base}/dashboard/checklist-sablonlari`] = { value: counts.checklist_templates_total, tone: 'orange' }

    // SA specific counts
    if (isSA) {
      map[`${base}/dashboard/firmalar`] = { value: counts.firms_total, tone: 'green' }
      map[`${base}/dashboard/personel-takibi`] = { value: counts.personnel_tracking_total, tone: 'green' }
      map[`${base}/dashboard/raporlar`] = { value: counts.reports_total, tone: 'blue' }
    } else {
      // TA + musteri + tenant_user — hepsi personel-takibi badge'i alır
      map[`${base}/dashboard/personel-takibi`] = { value: counts.personnel_tracking_total, tone: 'green' }
      // TA ve musteri raporlar sayfasına sahip
      if (isTA || user.rol === 'musteri') {
        map[`${base}/dashboard/raporlar`] = { value: counts.reports_total, tone: 'blue' }
      }
    }

    return map
  }, [counts, user.rol, base])

  return (
    <aside
      style={{
        width: 282,
        minHeight: '100vh',
        background: '#fff',
        borderRight: '1px solid #d6e4d6',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 20,
      }}
    >
      {/* Logo */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid #e8f0e8' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
          onClick={() => go(`${base}/dashboard`)}
          title="Gösterge Paneli"
        >
          {isSA ? (
            <ProataMark size={46} rounded={8} gap={3} />
          ) : firma?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={firma.logo_url}
              alt="Firma Logo"
              style={{
                width: 46,
                height: 46,
                borderRadius: 6,
                objectFit: 'cover',
                border: '1px solid #d6e4d6',
                background: '#fff',
              }}
            />
          ) : (
            <div
              style={{
                width: 46,
                height: 46,
                background: '#2e8b2e',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: -1,
              }}
            >
              {(firmaLabel || 'QR').slice(0, 2).toUpperCase()}
            </div>
          )}

          {/* Company name + product */}
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.15 }}>
            <div
              style={{
                fontSize: 17.5,
                fontWeight: 800,
                color: '#0f1a0f',
                letterSpacing: '-0.4px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 170,
              }}
              title={isSA ? 'ProATA' : firmaLabel || 'Firma'}
            >
              {isSA ? 'ProATA' : firmaLabel || 'Firma'}
            </div>
            <div style={{ marginTop: 4, fontSize: 11.5, fontWeight: 700, letterSpacing: '1px', color: '#2d3f2d' }}>
              TASK MANAGEMENT
            </div>
          </div>

          <span
            style={{
              marginLeft: 'auto',
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              color: '#2e8b2e',
              background: '#dcf0dc',
              border: '1px solid #b8e0b8',
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            Pro
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
        {/* Brand label (visible to all user groups) */}
        <div
          style={{
            padding: '10px 14px',
            margin: '8px 2px 6px',
            borderRadius: 10,
            background: '#eaf6ea',
            border: '1px solid #d6e4d6',
            fontWeight: 700,
            fontSize: 14,
            color: '#1f7a3f',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <ProataMark size={28} rounded={6} gap={2} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>
            <span style={{ fontWeight: 300, color: '#506050' }}>Pro</span>
            <span style={{ fontWeight: 800, color: '#1f6b1f' }}>ATA</span>
          </span>
        </div>

        {groups.map((g) => (
          <div key={g.label} style={{ marginBottom: 4 }}>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: '#a0b4a0',
                padding: '10px 8px 4px',
              }}
            >
              {g.label}
            </div>

            {g.items.map((item) => (
              <div
                key={item.href}
                onClick={() => go(item.href)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 16,
                  fontWeight: isActive(item.href) ? 800 : 650,
                  color: isActive(item.href) ? '#1f6b1f' : '#506050',
                  background: isActive(item.href) ? '#dcf0dc' : 'transparent',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={(e) => {
                  if (!isActive(item.href)) e.currentTarget.style.background = '#f0f9f0'
                }}
                onMouseLeave={(e) => {
                  if (!isActive(item.href)) e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ width: 16, textAlign: 'center', fontSize: 17, opacity: 0.5 }}>›</span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}
                </span>
                {/* Right aligned count badges for management items */}
                {badgeByHref[item.href] && !countsError ? (
                  <CountBadge value={badgeByHref[item.href].value} tone={badgeByHref[item.href].tone} />
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: 12, borderTop: '1px solid #e8f0e8' }}>
        <div
          onClick={() => go(`${base}/dashboard/ayarlar`)}
          style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f9f0')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <UserAvatar name={user.isim_soyisim} photoUrl={user.profil_foto} size={40} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: '#0f1a0f',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user.isim_soyisim}
            </div>
            <div
              style={{
                fontSize: 13.5,
                color: '#7a907a',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {footerSubLabel}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
