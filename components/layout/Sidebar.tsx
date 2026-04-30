'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { User, UserRole } from '@/types'
import { useRouteLoading } from '@/components/ui/RouteLoadingProvider'
import ProataLogo, { ProataMark } from '@/components/brand/ProataLogo'
import { useProje } from '@/components/projeler/ProjeContext'
import { useFirma } from '@/components/layout/FirmaContext'
import IoAsistan from './IoAsistan'
import IoMascot from './IoMascot'

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
        { label: 'Süper Adminler', href: `${base}/dashboard/super-adminler`, icon: '🛡️' },
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
        { label: 'Push Bildirim Geçmişi', href: `${base}/dashboard/push-log`, icon: '🔔' },
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
          { label: 'Push Bildirim Geçmişi', href: `${base}/dashboard/push-log`, icon: '🔔' },
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
          { label: 'Push Bildirim Geçmişi', href: `${base}/dashboard/push-log`, icon: '🔔' },
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
          { label: 'Push Bildirim Geçmişi', href: `${base}/dashboard/push-log`, icon: '🔔' },
        ]

  return [
    { label: 'Ana Menü', items: [{ label: 'Gösterge Paneli', href: `${base}/dashboard`, icon: '⊞' }] },
    { label: 'Yönetim', items: mgmt },
    {
      label: 'Sistem',
      items: [
        { label: 'Profil Ayarları', href: `${base}/dashboard/ayarlar`, icon: '⚙' },
        ...(isSA || isTA
          ? [
              { label: 'Sistem Ayarları', href: `${base}/dashboard/sistem-ayarlari`, icon: '🛠️' },
              { label: 'Sistem Logları', href: `${base}/dashboard/sistem-loglari`, icon: '📜' },
            ]
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

/** İO düşünce baloncuğu — boşta iken rastgele düşünceler gösterir */
const IO_THOUGHTS = ['🤔', '...?', '💭', 'hmm...', '✨', '🔍', '...!', '💡']
/**
 * İO Asistan avatar bloğu — sidebar'da gösterilen maskot + düşünce baloncuğu.
 * Baloncuk periyodik olarak belirir ve eş zamanlı olarak maskotu "thinking" ifadesine sokar,
 * baloncuk kaybolunca maskot kendi otomatik ifade döngüsüne geri döner.
 */
const IO_HOVER_MESSAGE = 'Merhaba! Ben dijital asistanınız İO, size nasıl yardımcı olabilirim?'

function IoAsistanAvatar({ onClick }: { onClick: () => void }) {
  const [thought, setThought] = useState<string | null>(null)
  const [phase, setPhase] = useState<'show' | 'hide'>('show')
  const [hover, setHover] = useState(false)
  const [typed, setTyped] = useState('')
  const avatarRef = useRef<HTMLDivElement>(null)
  const [hoverPos, setHoverPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    let showTimeout: ReturnType<typeof setTimeout>
    let hideTimeout: ReturnType<typeof setTimeout>
    let clearTimeoutId: ReturnType<typeof setTimeout>

    function schedule() {
      // 8-15 saniye arası rastgele bekle
      const delay = 8000 + Math.random() * 7000
      showTimeout = setTimeout(() => {
        const pick = IO_THOUGHTS[Math.floor(Math.random() * IO_THOUGHTS.length)]
        setThought(pick)
        setPhase('show')
        // 2.5-4 saniye göster sonra kapat
        hideTimeout = setTimeout(() => {
          setPhase('hide')
          clearTimeoutId = setTimeout(() => { setThought(null); schedule() }, 300)
        }, 2500 + Math.random() * 1500)
      }, delay)
    }

    schedule()
    return () => { clearTimeout(showTimeout); clearTimeout(hideTimeout); clearTimeout(clearTimeoutId) }
  }, [])

  // Daktilo efekti — hover başlayınca harfleri sırayla ekle, hover biterse sıfırla
  useEffect(() => {
    if (!hover) { setTyped(''); setHoverPos(null); return }
    // Baloncuğu sidebar dışına, fixed konumda konumlandır (avatar sağına)
    if (avatarRef.current) {
      const r = avatarRef.current.getBoundingClientRect()
      setHoverPos({ top: r.top + r.height / 2, left: r.right + 18 })
    }
    let i = 0
    const timer = setInterval(() => {
      i++
      setTyped(IO_HOVER_MESSAGE.slice(0, i))
      if (i >= IO_HOVER_MESSAGE.length) clearInterval(timer)
    }, 32)
    return () => clearInterval(timer)
  }, [hover])

  return (
    <div className="io-avatar-wrap">
      <div
        ref={avatarRef}
        className="io-avatar"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        title="İO Asistan"
        style={{ width: 110, height: 110, borderRadius: 12, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
      >
        <IoMascot size={110} expression={hover ? 'happy' : (thought ? 'thinking' : undefined)} />
      </div>
      <div className="io-ground-shadow" />
      {/* Düşünce baloncuğu — sidebar içinde, sadece hover yokken */}
      {!hover && thought && (
        <div className={`io-thought-bubble ${phase}`}>{thought}</div>
      )}
      {/* Hover baloncuğu — fixed position, sidebar DIŞINA çıkar, içerik üstüne biner */}
      {hover && hoverPos && (
        <div
          className="io-hover-bubble show"
          style={{ position: 'fixed', top: hoverPos.top, left: hoverPos.left, transform: 'translateY(-50%)' }}
        >
          {typed}
          {typed.length < IO_HOVER_MESSAGE.length && <span className="io-caret">|</span>}
        </div>
      )}
    </div>
  )
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

export default function Sidebar({ user, firma, projeAdi: projeAdiProp, projeLogo, sidebarLogo, sidebarAltyazi, birimFiyatAktifProp, personelTakibiAktifProp }: { user: User; firma: any; projeAdi?: string | null; projeLogo?: string | null; sidebarLogo?: string | null; sidebarAltyazi?: string | null; birimFiyatAktifProp?: boolean; personelTakibiAktifProp?: boolean }) {
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
  const [asistanOpen, setAsistanOpen] = useState(false)

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
  // U/M rolleri ProjeProvider sarmalı içinde değil — context'ten aktifProje null gelir.
  // Bu durumda U layout'tan SSR ile geçirilen prop'u kullan.
  const personelTakibiAktif = aktifProje
    ? aktifProje.personel_takibi_aktif !== false
    : personelTakibiAktifProp !== undefined ? personelTakibiAktifProp : true
  // İO Asistan: aktifProje varsa o projenin ayarı, yoksa varsayılan açık (proje seçilmediyse gösterilmesin sorunu yaşanmasın)
  const ioAsistanAktif = aktifProje ? aktifProje.io_asistan_aktif !== false : true
  // Manuel push: proje varsa proje, yoksa firma ayarından. Rol bazlı alt toggle.
  const manuelPushAktif = (() => {
    const baseAktif = aktifProje
      ? aktifProje.manuel_push_aktif === true
      : isSA ? aktifFirma?.manuel_push_aktif === true : false
    if (!baseAktif) return false
    if (isSA || user.rol === 'tenant_admin') return true
    if (user.rol === 'tenant_user') {
      return aktifProje
        ? aktifProje.manuel_push_u_rolu === true
        : aktifFirma?.manuel_push_u_rolu === true
    }
    if (user.rol === 'musteri') {
      return aktifProje
        ? aktifProje.manuel_push_m_rolu === true
        : aktifFirma?.manuel_push_m_rolu === true
    }
    return false
  })()

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
    <>
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
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => go(`${base}/dashboard`)}
          title="Gösterge Paneli"
        >
          {/* Sidebar Logo (firma veya SA) */}
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
        {/* İO maskot — sola yaslı, sağında baloncuk için alan */}
        {ioAsistanAktif && (
          <div style={{ padding: '2px 14px 4px', display: 'flex', justifyContent: 'flex-start', overflow: 'visible' }}>
            <style>{`
              @keyframes ioFloat {
                0%, 100% { transform: translateY(0px); }
                50% { transform: translateY(-6px); }
              }
              @keyframes ioShadowPulse {
                0%, 100% { opacity: 0.5; transform: scaleX(1); }
                50% { opacity: 0.25; transform: scaleX(0.8); }
              }
              @keyframes ioBubbleIn {
                0% { opacity: 0; transform: scale(0.3) translateY(4px); }
                50% { opacity: 1; transform: scale(1.05) translateY(-1px); }
                100% { opacity: 1; transform: scale(1) translateY(0); }
              }
              @keyframes ioBubbleOut {
                0% { opacity: 1; transform: scale(1); }
                100% { opacity: 0; transform: scale(0.5) translateY(4px); }
              }
              .io-avatar-wrap { position: relative; }
              .io-avatar { animation: ioFloat 3s ease-in-out infinite; transition: filter 0.3s ease, transform 0.3s ease; }
              .io-avatar:hover { filter: drop-shadow(0 0 14px rgba(55,138,221,0.65)); transform: scale(1.35) !important; animation-play-state: paused; }
              .io-ground-shadow {
                width: 64px; height: 12px; border-radius: 50%;
                background: radial-gradient(ellipse, rgba(0,0,0,0.3) 0%, transparent 70%);
                margin: 0 auto 0; animation: ioShadowPulse 3s ease-in-out infinite;
              }
              .io-thought-bubble {
                position: absolute; top: 50%; left: calc(100% + 18px);
                transform: translateY(-50%);
                background: #fff; border: 2px solid #cbd5e1;
                border-radius: 14px;
                padding: 8px 16px; font-size: 18px;
                color: #334155; font-weight: 700;
                white-space: nowrap;
                box-shadow: 0 6px 18px rgba(0,0,0,0.14);
                pointer-events: none;
                z-index: 10;
              }
              .io-hover-bubble {
                background: #fff; border: 2px solid #cbd5e1;
                border-radius: 14px;
                padding: 10px 14px; font-size: 14px;
                line-height: 1.35;
                max-width: 240px; min-width: 200px;
                white-space: normal;
                color: #1f2937; font-weight: 700;
                box-shadow: 0 8px 24px rgba(0,0,0,0.18);
                pointer-events: none;
                z-index: 99999;
              }
              .io-thought-bubble.show { animation: ioBubbleInRight 0.35s ease forwards; }
              .io-thought-bubble.hide { animation: ioBubbleOutRight 0.3s ease forwards; }
              .io-hover-bubble.show { animation: ioHoverIn 0.25s ease forwards; }
              @keyframes ioHoverIn {
                0% { opacity: 0; transform: translateY(-50%) scale(0.85) translateX(-6px); }
                100% { opacity: 1; transform: translateY(-50%) scale(1) translateX(0); }
              }
              .io-thought-bubble::after, .io-hover-bubble::after {
                content: ''; position: absolute; left: -6px; top: 50%;
                width: 10px; height: 10px; background: #fff;
                border-left: 2px solid #cbd5e1; border-bottom: 2px solid #cbd5e1;
                transform: translateY(-50%) rotate(45deg);
              }
              .io-caret {
                display: inline-block; width: 2px; margin-left: 1px;
                animation: ioCaretBlink 0.9s steps(2) infinite;
              }
              @keyframes ioCaretBlink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
              @keyframes ioBubbleInRight {
                0% { opacity: 0; transform: translateY(-50%) scale(0.3) translateX(-4px); }
                50% { opacity: 1; transform: translateY(-50%) scale(1.05) translateX(1px); }
                100% { opacity: 1; transform: translateY(-50%) scale(1) translateX(0); }
              }
              @keyframes ioBubbleOutRight {
                0% { opacity: 1; transform: translateY(-50%) scale(1); }
                100% { opacity: 0; transform: translateY(-50%) scale(0.5) translateX(-4px); }
              }
            `}</style>
            <IoAsistanAvatar onClick={() => setAsistanOpen(true)} />
          </div>
        )}

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
            // push-log: manuel_push_aktif ayarına göre (proje varsa proje, yoksa firma)
            if (item.href.includes('/push-log')) return manuelPushAktif
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

      {/* Footer — proje logosu + copyright */}
      <div style={{ padding: 12, borderTop: '1px solid #f3f4f6' }}>
        {projeLogo && (
          <div style={{
            height: 56,
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '6px 10px',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={projeLogo} alt="Proje" style={{ maxWidth: '100%', maxHeight: 44, objectFit: 'contain' }} />
          </div>
        )}
        <div style={{ textAlign: 'center', padding: '8px 10px 4px', fontSize: 10, color: '#b0b0b0', letterSpacing: '0.02em' }}>
          2026@United Software Teknologies
        </div>
      </div>
    </aside>
    {ioAsistanAktif && <IoAsistan open={asistanOpen} onClose={() => setAsistanOpen(false)} />}
    </>
  )
}
