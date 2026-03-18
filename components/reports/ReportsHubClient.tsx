'use client'

import { useMemo, type ReactNode, useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/layout/Topbar'
import { useRouteLoading } from '@/components/ui/RouteLoadingProvider'
import { useToast } from '@/components/ui/ToastProvider'
import { Database, BarChart3, Sparkles, Clock3, ArrowRight, FileBarChart2, MessageSquare } from 'lucide-react'
import { useFirma } from '@/components/layout/FirmaContext'

// ─── Rapor kart tanımları — statik, DB ile ilgisi yok ────────────────────────
const RAPOR_KARTLARI = [
  {
    id: 'ham_veri',
    title: 'Ham Veri Raporları',
    description: 'Kolon seçimi, tarih aralığı ve Excel/PDF çıktılarıyla detaylı operasyon verisini dışa alın.',
    eyebrow: 'HAM VERİ', badge: 'Excel + PDF', tone: 'green' as const,
    icon: 'database', path: '/raporlar/ham-veri', disabled: false,
  },
  {
    id: 'grafiksel',
    title: 'Grafiksel Raporlar',
    description: 'Sütun, çizgi ve pasta grafiklerle hızlı görsel analiz alın; PNG / Excel formatında dışa aktarın.',
    eyebrow: 'GRAFİKSEL', badge: 'Canlı analiz', tone: 'violet' as const,
    icon: 'bar', path: '/raporlar/grafiksel', disabled: false,
  },
  {
    id: 'rapor_ozellestir',
    title: 'Rapor Özelleştir',
    description: 'Hazır şablon seçin ya da kendi Excel şablonunuzu yükleyin, parametrelerle rapor üretin.',
    eyebrow: 'ŞABLON TABANLI', badge: 'Excel + PDF', tone: 'green' as const,
    icon: 'sparkles', path: '/raporlar/ozellestir', disabled: false,
  },
  {
    id: 'sure_analiz',
    title: 'Süre Analiz Raporları',
    description: 'Tamamlanma süresi, lokasyon bazlı bekleme zamanları ve trend karşılaştırmaları.',
    eyebrow: 'SÜRE ANALİZİ', badge: 'Yakında', tone: 'amber' as const,
    icon: 'clock', path: '/raporlar/sure-analiz', disabled: false,
  },
  {
    id: 'musteri_degerlendirme',
    title: 'Müşteri Değerlendirmeleri',
    description: 'QR/NFC ile toplanan anonim müşteri memnuniyeti puanları, yorumlar ve fotoğraflar.',
    eyebrow: 'MÜŞTERİ', badge: 'Yıldız + Yorum', tone: 'violet' as const,
    icon: 'message', path: '/raporlar/musteri-degerlendirme', disabled: false,
  },
]

const IKON_MAP: Record<string, ReactNode> = {
  database: <Database size={22} />,
  bar:      <BarChart3 size={22} />,
  sparkles: <Sparkles size={22} />,
  clock:    <Clock3 size={22} />,
  message:  <MessageSquare size={22} />,
}

// ─── HubCard ─────────────────────────────────────────────────────────────────
function HubCard({
  title, description, eyebrow, icon, tone, cta, badge, disabled, onClick,
}: {
  title: string; description: string; eyebrow: string
  icon: ReactNode; tone: 'green' | 'violet' | 'amber'
  cta: string; badge: string; disabled?: boolean; onClick?: () => void
}) {
  const p = {
    green:  { iconBg: '#f0f9f0', iconColor: '#1f6b1f', chipBg: '#eef8ee', chipText: '#2f6a2f', border: '#d6e4d6' },
    violet: { iconBg: '#f1edff', iconColor: '#5a46d1', chipBg: '#f1edff', chipText: '#5a46d1', border: '#ddd8f8' },
    amber:  { iconBg: '#fff4e2', iconColor: '#9a6712', chipBg: '#fff4e2', chipText: '#9a6712', border: '#f0dfc0' },
  }[tone]

  return (
    <div
      className="verde-card"
      onClick={disabled ? undefined : onClick}
      style={{
        padding: 20, display: 'grid', gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center', gap: 18,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'transform .15s ease, box-shadow .15s ease',
        border: `1px solid ${p.border}`,
      }}
      onMouseEnter={e => { if (!disabled) { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(15,40,15,0.10)' }}}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = '' }}
    >
      <div style={{ width: 48, height: 48, borderRadius: 12, background: p.iconBg, border: `1px solid ${p.border}`, display: 'grid', placeItems: 'center', color: p.iconColor, flexShrink: 0 }}>
        {icon}
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 999, background: p.chipBg, color: p.chipText, letterSpacing: 0.3 }}>{eyebrow}</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#f0f9f0', color: '#506050', border: '1px solid #d6e4d6' }}>{badge}</span>
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f1a0f', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: '#506050', lineHeight: 1.5 }}>{description}</div>
        {disabled && <div style={{ fontSize: 12, color: '#a08040', marginTop: 6, fontStyle: 'italic' }}>Bu modül henüz tamamlanmadı — daha sonra düzenlenecek.</div>}
      </div>
      <div style={{ color: disabled ? '#b0c0b0' : '#2e8b2e', flexShrink: 0 }}>
        {disabled ? <Sparkles size={18} /> : <ArrowRight size={20} />}
      </div>
    </div>
  )
}

// ─── Ana bileşen ─────────────────────────────────────────────────────────────
//
// TA vs SA veri akışı:
//   TA → initialRaporTurleri SSR'dan prop olarak gelir, useMemo ile direkt kullanılır
//        client-side hiçbir state değişimi bu kartları etkileyemez
//   SA → firmaId client'ta değişebilir, useEffect ile dynamic fetch yapılır
//
export default function ReportsHubClient({
  base,
  firmaAdi,
  isSA,
  initialRaporTurleri,
}: {
  base: string
  firmaAdi?: string | null
  isSA: boolean
  // TA için SSR page.tsx'ten gelir — { id: 'ham_veri', aktif: true }[]
  // SA için geçilmez (undefined) — firma seçimine göre client'ta yüklenir
  initialRaporTurleri?: { id: string; aktif: boolean }[]
}) {
  const router     = useRouter()
  const { start }  = useRouteLoading()
  const { toast }  = useToast()
  const toastRef   = useRef(toast)
  toastRef.current = toast

  const { firmaId: saFirmaId, firmalar: saFirmalar } = useFirma()

  // SA: dinamik firma değişimine göre yüklenen aktif türler
  // TA: hiç kullanılmaz — initialRaporTurleri prop'undan direkt hesaplanır
  const [saAktifTurler, setSaAktifTurler] = useState<Set<string> | null>(null)
  const [saLoading, setSaLoading]         = useState(false)

  const firmaLabel = useMemo(() => {
    if (!isSA) return firmaAdi ?? 'Firma'
    if (!saFirmaId) return 'Firma seçin'
    const f = saFirmalar?.find(f => f.id === saFirmaId)
    return f ? f.firma_adi || f.ticari_unvan : 'Seçili firma'
  }, [saFirmaId, isSA, firmaAdi, saFirmalar])

  // SA: firma seçimi değişince yükle
  useEffect(() => {
    if (!isSA) return  // TA bu bloğa HİÇ girmez

    if (!saFirmaId) {
      setSaAktifTurler(null)
      return
    }

    let cancelled = false
    setSaLoading(true)

    fetch(`/api/firma-rapor-turleri?firma_id=${saFirmaId}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        if (json.ok) {
          const aktifIdler = new Set<string>(
            (json.data as { id: string; aktif: boolean }[])
              .filter(t => t.aktif !== false)
              .map(t => t.id)
          )
          setSaAktifTurler(aktifIdler)
        } else {
          toastRef.current({ type: 'error', title: 'Rapor türleri', message: json.error ?? 'Yüklenemedi' })
          setSaAktifTurler(null) // hata → SA tümünü görür
        }
      })
      .catch(() => {
        if (!cancelled) {
          toastRef.current({ type: 'error', title: 'Rapor türleri', message: 'Bağlantı hatası' })
        }
      })
      .finally(() => { if (!cancelled) setSaLoading(false) })

    return () => { cancelled = true }
  }, [isSA, saFirmaId]) // saFirmaId değişince yeniden yükle

  // Gösterilecek kartlar:
  //   SA → saAktifTurler'e göre (null ise tümü göster)
  //   TA → initialRaporTurleri prop'una göre useMemo ile hesaplanır
  //        prop değişmediği sürece bu hesaplama yeniden yapılmaz
  //        herhangi bir client state değişimi bu değeri ETKILEYEMEZ
  const gorunurKartlar = useMemo(() => {
    const kartlar = RAPOR_KARTLARI.map(k => ({
      ...k, icon: IKON_MAP[k.icon], href: `${base}/dashboard${k.path}`,
    }))

    if (isSA) {
      // SA: saAktifTurler null ise (henüz yüklenmedi veya hata) tümünü göster
      if (!saAktifTurler) return kartlar
      return kartlar.filter(k => saAktifTurler.has(k.id))
    }

    // TA: initialRaporTurleri prop'undan direkt hesapla
    // Boş veya tanımsızsa tümünü göster (güvenli fallback)
    if (!initialRaporTurleri || initialRaporTurleri.length === 0) return kartlar
    const aktifIdler = new Set(
      initialRaporTurleri.filter(t => t.aktif !== false).map(t => t.id)
    )
    // Aktif ID seti boşsa (hepsi pasif) tümünü göster — bu bir veri tutarsızlığıdır
    if (aktifIdler.size === 0) return kartlar
    return kartlar.filter(k => aktifIdler.has(k.id))
  }, [isSA, saAktifTurler, base, initialRaporTurleri])
  // ↑ TA için: sadece `base` veya `initialRaporTurleri` prop'u değişirse yeniden hesaplanır
  //   ProjeContext, FirmaContext, Sidebar, Topbar yeniden render'ı bu hesaplamayı ETKİLEMEZ

  const showLoading = isSA && saLoading

  return (
    <div>
      <Topbar
        title="Rapor Merkezi"
        base={base}
        breadcrumbs={[{ label: 'Yönetim' }, { label: 'Rapor Merkezi' }]}
      />
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div className="verde-card" style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f0f9f0', border: '1px solid #d6e4d6', display: 'grid', placeItems: 'center', color: '#1f6b1f', flexShrink: 0 }}>
            <FileBarChart2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#0f1a0f' }}>RAPOR MERKEZİ</div>
            <div style={{ fontSize: 13, color: '#7a907a', marginTop: 2 }}>
              Ham veri, grafiksel özet ve şablon tabanlı raporlar • Firma: <strong style={{ color: '#2d3f2d' }}>{firmaLabel}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {showLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#7a907a' }}>
              Rapor türleri yükleniyor…
            </div>
          ) : (
            gorunurKartlar.map(kart => (
              <HubCard
                key={kart.id}
                title={kart.title}
                description={kart.description}
                eyebrow={kart.eyebrow}
                badge={kart.badge}
                icon={kart.icon}
                tone={kart.tone}
                cta={kart.disabled ? 'Yakında' : 'Aç'}
                disabled={kart.disabled}
                onClick={() => { if (!kart.disabled) { start(); router.push(kart.href) } }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
