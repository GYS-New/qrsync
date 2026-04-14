'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
        { label: 'Canlı Görev Akışı', href: `${base}/dashboard/canli-islemler`, icon: '📡' },
        { label: 'Firmalar', href: `${base}/dashboard/firmalar`, icon: '🏢' },
        { label: 'Firma Adminleri', href: `${base}/dashboard/firma-adminler`, icon: '👤' },
        { label: 'Firma Kullanıcıları', href: `${base}/dashboard/firma-kullanicilar`, icon: '👥' },
        { label: 'Projeler', href: `${base}/dashboard/projeler`, icon: '🗂️' },
        { label: 'Lokasyonlar', href: `${base}/dashboard/lokasyonlar`, icon: '📍' },
        { label: 'Lokasyon Grupları', href: `${base}/dashboard/lokasyon-gruplari`, icon: '🗺️' },
        { label: 'Spesifik Görevler', href: `${base}/dashboard/gorevler`, icon: '✓' },
        { label: 'Frekansiyel Görevler', href: `${base}/dashboard/canli-islemler/tum-gorevler`, icon: '⚡' },
        { label: 'Checklist Şablonları', href: `${base}/dashboard/checklist-sablonlari`, icon: '🧾' },
        { label: 'Personel Takibi', href: `${base}/dashboard/personel-takibi`, icon: '🧭' },
        { label: 'Birim Fiyatlar', href: `${base}/dashboard/birim-fiyatlar`, icon: '💰' },
        { label: 'Raporlar', href: `${base}/dashboard/raporlar`, icon: '📊' },
        { label: 'Arşiv', href: `${base}/dashboard/arsiv`, icon: '🗃️' },
      ]
    : isTA
      ? [
          { label: 'Canlı Görev Akışı', href: `${base}/dashboard/canli-islemler`, icon: '📡' },
          { label: 'Projeler', href: `${base}/dashboard/projeler`, icon: '🗂️' },
          { label: 'Kullanıcılar', href: `${base}/dashboard/kullanicilar`, icon: '👥' },
          { label: 'Lokasyonlar', href: `${base}/dashboard/lokasyonlar`, icon: '📍' },
          { label: 'Lokasyon Grupları', href: `${base}/dashboard/lokasyon-gruplari`, icon: '🗺️' },
          { label: 'Spesifik Görevler', href: `${base}/dashboard/gorevler`, icon: '✓' },
          { label: 'Frekansiyel Görevler', href: `${base}/dashboard/canli-islemler/tum-gorevler`, icon: '⚡' },
          { label: 'Checklist Şablonları', href: `${base}/dashboard/checklist-sablonlari`, icon: '🧾' },
          { label: 'Personel Takibi', href: `${base}/dashboard/personel-takibi`, icon: '🧭' },
          { label: 'Birim Fiyatlar', href: `${base}/dashboard/birim-fiyatlar`, icon: '💰' },
          { label: 'Raporlar', href: `${base}/dashboard/raporlar`, icon: '📊' },
          { label: 'Arşiv', href: `${base}/dashboard/arsiv`, icon: '🗃️' },
        ]
      : isMusteri
      ? [
          { label: 'Canlı Görev Akışı', href: `${base}/dashboard/canli-islemler`, icon: '📡' },
          { label: 'Kullanıcılar', href: `${base}/dashboard/kullanicilar`, icon: '👥' },
          { label: 'Lokasyonlar', href: `${base}/dashboard/lokasyonlar`, icon: '📍' },
          { label: 'Lokasyon Grupları', href: `${base}/dashboard/lokasyon-gruplari`, icon: '🗺️' },
          { label: 'Spesifik Görevler', href: `${base}/dashboard/gorevler`, icon: '✓' },
          { label: 'Frekansiyel Görevler', href: `${base}/dashboard/canli-islemler/tum-gorevler`, icon: '⚡' },
          { label: 'Checklist Şablonları', href: `${base}/dashboard/checklist-sablonlari`, icon: '🧾' },
          { label: 'Personel Takibi', href: `${base}/dashboard/personel-takibi`, icon: '🧭' },
          { label: 'Birim Fiyatlar', href: `${base}/dashboard/birim-fiyatlar`, icon: '💰' },
          { label: 'Raporlar', href: `${base}/dashboard/raporlar`, icon: '📊' },
          { label: 'Arşiv', href: `${base}/dashboard/arsiv`, icon: '🗃️' },
        ]
      : [
          { label: 'Canlı Görev Akışı', href: `${base}/dashboard/canli-islemler`, icon: '📡' },
          { label: 'Kullanıcılar', href: `${base}/dashboard/kullanicilar`, icon: '👥' },
          { label: 'Lokasyonlar', href: `${base}/dashboard/lokasyonlar`, icon: '📍' },
          { label: 'Lokasyon Grupları', href: `${base}/dashboard/lokasyon-gruplari`, icon: '🗺️' },
          { label: 'Spesifik Görevler', href: `${base}/dashboard/gorevler`, icon: '✓' },
          { label: 'Frekansiyel Görevler', href: `${base}/dashboard/canli-islemler/tum-gorevler`, icon: '⚡' },
          { label: 'Checklist Şablonları', href: `${base}/dashboard/checklist-sablonlari`, icon: '🧾' },
          { label: 'Görev Duraklatmaları', href: `${base}/dashboard/gorev-duraklatmalari`, icon: '⏸' },
          { label: 'Personel Takibi', href: `${base}/dashboard/personel-takibi`, icon: '🧭' },
          { label: 'Birim Fiyatlar', href: `${base}/dashboard/birim-fiyatlar`, icon: '💰' },
          { label: 'Raporlar', href: `${base}/dashboard/raporlar`, icon: '📊' },
          { label: 'Arşiv', href: `${base}/dashboard/arsiv`, icon: '🗃️' },
        ]

  return [
    { label: 'Ana Menü', items: [{ label: 'Gösterge Paneli', href: `${base}/dashboard`, icon: '⊞' }] },
    { label: 'Yönetim', items: mgmt },
    {
      label: 'Sistem',
      items: [
        { label: 'Profil Ayarları', href: `${base}/dashboard/ayarlar`, icon: '⚙' },
        ...(isSA || isTA
          ? [{ label: 'Sistem Ayarları', href: `${base}/dashboard/sistem-ayarlari`, icon: '🛠️' }]
          : [{ label: 'Dashboard Ayarları', href: `${base}/dashboard/ayarlar/dashboard`, icon: '🧩' }]
        ),
      ],
    },
  ]
}

interface SidebarProps {
  user: User
  firma?: { ticari_unvan: string; firma_adi?: string; logo_url?: string } | null
  projeAdi?: string | null
  projeLogo?: string | null
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

/** Sidebar logo — boyut logoya göre dinamik */
function SidebarLogo({ src, alt, bordered = false, imgWidth = '80%' }: { src: string; alt: string; bordered?: boolean; imgWidth?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '100%',
      ...(bordered ? { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 10 } : {}),
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{
          width: imgWidth, maxHeight: 70, objectFit: 'contain',
        }}
      />
    </div>
  )
}

function CountBadge({ value, tone }: { value: number; tone: 'green' | 'yellow' | 'blue' | 'orange' }) {
  const palette = {
    green: { bg: '#e5e7eb', border: '#d1d5db', text: '#1f2937' },
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

export default function Sidebar({ user, firma, projeAdi: projeAdiProp, projeLogo, sidebarLogo, sidebarAltyazi, birimFiyatAktifProp }: { user: User; firma: any; projeAdi?: string | null; projeLogo?: string | null; sidebarLogo?: string | null; sidebarAltyazi?: string | null; birimFiyatAktifProp?: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const routeLoading = useRouteLoading()
  
  const isSA = user.rol === 'super_admin' || user.rol === 'alt_super_admin'

  // SA ve TA her ikisi de ProjeContext + FirmaContext kullanır
  const { aktifProje } = useProje()
  const { firmaId: saFirmaId, firmalar } = useFirma()

  // Sidebar altyazı — prop veya API'den
  const [altyazi, setAltyazi] = useState(sidebarAltyazi ?? 'GÖREV YÖNETİM SİSTEMİ')
  useEffect(() => {
    if (sidebarAltyazi) { setAltyazi(sidebarAltyazi); return }
    fetch('/api/sistem-konfig?field=sidebar_altyazi').then(r => r.json()).then(j => {
      if (j?.value) setAltyazi(j.value)
    }).catch(() => {})
  }, [sidebarAltyazi])

  const [counts, setCounts] = useState<SidebarCounts | null>(null)
  const [countsError, setCountsError] = useState(false)
  // U ve M rolleri için sayfa yetkileri (dinamik nav filtresi)
  const isUOrM = user.rol === 'tenant_user' || user.rol === 'musteri'
  const [navYetkileri, setNavYetkileri] = useState<Record<string, { gorebilir: boolean }> | null>(null)

  const base =
    user.rol === 'super_admin' || user.rol === 'alt_super_admin'
      ? '/sa'
      : user.rol === 'tenant_admin'
        ? '/ta'
        : '/u'  // musteri ve tenant_user her ikisi de /u kullanır

  const groups = getNav(base, user.rol)

  // U ve M için sayfa yetkileri çek
  useEffect(() => {
    if (!isUOrM) return
    fetch('/api/auth/sayfa-yetkileri', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(j => { if (j?.ok) setNavYetkileri(j.yetkileri) })
      .catch(() => {})
  }, [isUOrM])

  // Proje bazlı kontrol: aktifProje varsa proje ayarından, yoksa firma ayarından
  const aktifFirma = isSA ? firmalar.find(f => f.id === saFirmaId) : null
  const birimFiyatAktif = aktifProje
    ? aktifProje.birim_fiyat_aktif === true
    : isSA ? aktifFirma?.birim_fiyat_aktif === true : birimFiyatAktifProp === true
  const personelTakibiAktif = aktifProje
    ? aktifProje.personel_takibi_aktif !== false
    : true

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
    map[`${base}/dashboard/lokasyonlar`] = { value: counts.locations_total, tone: 'blue' }
    map[`${base}/dashboard/gorevler`] = { value: counts.tasks_total, tone: 'yellow' }
    map[`${base}/dashboard/canli-islemler/tum-gorevler`] = { value: counts.live_total, tone: 'orange' }
    map[`${base}/dashboard/projeler`] = { value: counts.projects_total, tone: 'blue' }
    map[`${base}/dashboard/lokasyon-gruplari`] = { value: counts.location_groups_total, tone: 'yellow' }
    map[`${base}/dashboard/checklist-sablonlari`] = { value: counts.checklist_templates_total, tone: 'orange' }
    if (isSA) {
      map[`${base}/dashboard/firmalar`] = { value: counts.firms_total, tone: 'green' }
    }

    return map
  }, [counts, user.rol, base])

  return (
    <aside
      style={{
        width: 282,
        minHeight: '100vh',
        background: '#fff',
        borderRight: '1px solid #e5e7eb',
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
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid #f3f4f6' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, cursor: 'pointer' }}
          onClick={() => go(`${base}/dashboard`)}
          title="Gösterge Paneli"
        >
          {/* Logo alanı */}
          {isSA && sidebarLogo ? (
            <SidebarLogo src={sidebarLogo} alt="Logo" imgWidth="100%" />
          ) : !isSA && firma?.logo_url ? (
            <SidebarLogo src={firma.logo_url} alt="Firma Logo" />
          ) : null}
        </div>
        {altyazi && !isSA && (
          <div style={{ textAlign: 'center', marginTop: 6, fontSize: 13, fontWeight: 700, color: '#4b5563', fontFamily: 'Inter, sans-serif', letterSpacing: '0.03em' }}>
            {altyazi}
          </div>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
        {/* Brand label — proje logosu varsa göster (tüm roller), yoksa ProATA fallback (TA/U) */}
        {projeLogo ? (
          <div style={{ padding: '6px 14px', margin: '8px 6px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SidebarLogo src={projeLogo} alt="Proje" bordered />
          </div>
        ) : null}

        {groups.map((g) => {
          // U ve M rolleri için yetki filtresi uygula + birim-fiyatlar proje bayrağı kontrolü
          const filteredItems = (isUOrM && navYetkileri
            ? g.items.filter(item => {
                const parts = item.href.split('/')
                const kod = parts[parts.length - 1]
                return navYetkileri[kod]?.gorebilir !== false
              })
            : g.items
          ).filter(item => {
            // birim-fiyatlar: sadece aktif proje'de birim_fiyat_aktif=true ise göster
            if (item.href.includes('/birim-fiyatlar')) return birimFiyatAktif
            // personel-takibi: sadece aktif proje'de personel_takibi_aktif=true ise göster
            if (item.href.includes('/personel-takibi')) return personelTakibiAktif
            return true
          })

          if (filteredItems.length === 0) return null

          return (
          <div key={g.label} style={{ marginBottom: 4 }}>
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: '#4F6AFF',
                padding: '10px 8px 4px',
              }}
            >
              {g.label}
            </div>

            {filteredItems.map((item) => (
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
                  color: isActive(item.href) ? '#1f2937' : '#4b5563',
                  background: isActive(item.href) ? '#e5e7eb' : 'transparent',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={(e) => {
                  if (!isActive(item.href)) e.currentTarget.style.background = '#f9fafb'
                }}
                onMouseLeave={(e) => {
                  if (!isActive(item.href)) e.currentTarget.style.background = 'transparent'
                }}
              >
                {item.href.endsWith('/canli-islemler') && !item.href.includes('tum-gorevler') ? (
                  <span style={{ width: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', background: '#22c55e',
                      display: 'inline-block', animation: 'canliPulse 1.5s ease infinite',
                    }} />
                  </span>
                ) : (
                  <span style={{ width: 16, textAlign: 'center', fontSize: 17, opacity: 0.5 }}>›</span>
                )}
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
          )
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: 12, borderTop: '1px solid #f3f4f6' }}>
        <div
          onClick={() => go(`${base}/dashboard/ayarlar`)}
          style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <UserAvatar name={user.isim_soyisim} photoUrl={user.profil_foto} size={40} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: '#111827',
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
                color: '#6b7280',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {footerSubLabel}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '8px 10px 4px', fontSize: 10, color: '#b0b0b0', letterSpacing: '0.02em' }}>
          © 2026 Syncora Yazılım
        </div>
      </div>
    </aside>
  )
}
