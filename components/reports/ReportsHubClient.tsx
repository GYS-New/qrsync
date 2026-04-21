'use client'

import { useMemo, type ReactNode, useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Topbar from '@/components/layout/Topbar'
import { useRouteLoading } from '@/components/ui/RouteLoadingProvider'
import { useToast } from '@/components/ui/ToastProvider'
import { Database, BarChart3, Sparkles, Clock3, ArrowRight, FileBarChart2, MessageSquare, CheckSquare, Receipt, BarChart2, ClipboardList } from 'lucide-react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'

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
    id: 'ceklist',
    title: 'Çeklist Raporları',
    description: 'Tüm görev türleri için çeklist tamamlanma verileri, madde bazlı analiz ve filtrelenebilir raporlar.',
    eyebrow: 'ÇEKLİST', badge: 'Excel + CSV', tone: 'amber' as const,
    icon: 'checklist', path: '/raporlar/ceklist', disabled: false,
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
  {
    id: 'hakedis',
    title: 'Hakediş Raporu',
    description: 'Birim fiyatlı lokasyonlar için tamamlanan, gecikmeli ve kayıp frekansiyel görevlere göre hakediş hesabı.',
    eyebrow: 'HAKEDİŞ', badge: 'Excel + PDF', tone: 'amber' as const,
    icon: 'receipt', path: '/raporlar/hakedis', disabled: false,
  },
  {
    id: 'frekansiyel_rapor',
    title: 'Frekansiyel Görevler Raporu',
    description: 'Canlı görevler bazında lokasyon, grup ve personel frekans analizi, sapma ve kayıp görevler. Excel çıktısı.',
    eyebrow: 'FREKANSİYEL', badge: 'Excel + PDF', tone: 'green' as const,
    icon: 'bar2', path: '/raporlar/ozellestir/frekansiyel', disabled: false,
  },
  {
    id: 'spesifik_rapor',
    title: 'Spesifik Görevler Raporu',
    description: 'Personel bazlı görev dağılımı, tamamlanma süreleri, başarı oranları ve lokasyon analizi. Excel çıktısı.',
    eyebrow: 'SPESİFİK', badge: 'Excel + PDF', tone: 'violet' as const,
    icon: 'clipboard', path: '/raporlar/ozellestir/spesifik', disabled: false,
  },
]

const IKON_MAP: Record<string, ReactNode> = {
  database:  <Database size={22} />,
  bar:       <BarChart3 size={22} />,
  sparkles:  <Sparkles size={22} />,
  clock:     <Clock3 size={22} />,
  message:   <MessageSquare size={22} />,
  checklist: <CheckSquare size={22} />,
  receipt:   <Receipt size={22} />,
  bar2:      <BarChart2 size={22} />,
  clipboard: <ClipboardList size={22} />,
}

// ─── HubCard ─────────────────────────────────────────────────────────────────
function HubCard({
  title, description, eyebrow, icon, tone, cta, badge, disabled, sureliGorevBadge, onClick,
}: {
  title: string; description: string; eyebrow: string
  icon: ReactNode; tone: 'green' | 'violet' | 'amber'
  cta: string; badge: string; disabled?: boolean
  sureliGorevBadge?: boolean  // undefined = gösterme, true = aktif, false = pasif
  onClick?: () => void
}) {
  const p = {
    green:  { iconBg: '#f9fafb', iconColor: '#1f2937', chipBg: '#eef8ee', chipText: '#2f6a2f', border: '#e5e7eb' },
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
          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#f9fafb', color: '#4b5563', border: '1px solid #e5e7eb' }}>{badge}</span>
          {sureliGorevBadge === true && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#f3e8ff', color: '#7c3aed', border: '1px solid #c4b5fd' }}>⚡ Süreli Görev Takibi Aktif</span>
          )}
          {sureliGorevBadge === false && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' }}>⚡ Süreli Görev Takibi Pasif</span>
          )}
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 13.5, color: '#4b5563', lineHeight: 1.5 }}>{description}</div>
        {disabled && <div style={{ fontSize: 12, color: '#a08040', marginTop: 6, fontStyle: 'italic' }}>Bu modül henüz tamamlanmadı — daha sonra düzenlenecek.</div>}
      </div>
      <div style={{ color: disabled ? '#d1d5db' : '#374151', flexShrink: 0 }}>
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
  initialFirmaId,
  sureliGorevAktif,
  birimFiyatAktif,
  raporOzellestirAktif,
  frekanRaporYetki,
  spesifRaporYetki,
}: {
  base: string
  firmaAdi?: string | null
  isSA: boolean
  initialRaporTurleri?: { id: string; aktif: boolean }[]
  initialFirmaId?: string | null
  sureliGorevAktif?: boolean
  birimFiyatAktif?: boolean      // Hakediş kartı görünürlüğü
  raporOzellestirAktif?: boolean // Rapor Özelleştir + frekansiyel/spesifik rapor kartları (TA/U SSR'dan gelir)
  frekanRaporYetki?: boolean     // Frekansiyel rapor yetki (TA/U SSR'dan gelir)
  spesifRaporYetki?: boolean     // Spesifik rapor yetki (TA/U SSR'dan gelir)
}) {
  const router     = useRouter()
  const { start }  = useRouteLoading()
  const { toast }  = useToast()
  const toastRef   = useRef(toast)
  toastRef.current = toast

  // U/M rolleri için router cache'i atla — sayfa her mount'ta sunucudan taze veri alır
  useEffect(() => {
    if (!isSA) router.refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const { firmaId: saFirmaId, firmalar: saFirmalar } = useFirma()
  const { aktifProje } = useProje()

  // Hakediş görünürlüğü: aktifProje varsa proje ayarından, yoksa firma ayarından
  const saBirimFiyatAktif = isSA
    ? saFirmalar?.find(f => f.id === saFirmaId)?.birim_fiyat_aktif === true
    : false
  const hakedisGoster = aktifProje
    ? aktifProje.birim_fiyat_aktif === true
    : isSA ? saBirimFiyatAktif : birimFiyatAktif === true

  // Rapor Özelleştir görünürlüğü: firma ayarı false ise rapor_ozellestir + alt kartları gizlenir.
  // SA için dinamik context'ten, TA/U için SSR prop'undan. Default true (eski davranış).
  const ozellestirGoster = isSA
    ? (saFirmalar?.find(f => f.id === saFirmaId)?.rapor_ozellestir_aktif !== false)
    : (raporOzellestirAktif !== false)

  // SA: dinamik firma değişimine göre yüklenen aktif türler
  // TA: hiç kullanılmaz — initialRaporTurleri prop'undan direkt hesaplanır
  const [saAktifTurler, setSaAktifTurler] = useState<Set<string> | null>(null)
  const [saLoading, setSaLoading]         = useState(false)
  // SA için aktif projede süreli görev aktif mi? (client-side fetch)
  const [saSureliGorevAktif, setSaSureliGorevAktif] = useState<boolean | undefined>(undefined)

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

  // SA: aktif proje değişince süreli görev durumunu çek
  useEffect(() => {
    if (!isSA || !aktifProje?.id) { setSaSureliGorevAktif(undefined); return }
    fetch(`/api/lokasyonlar-list?firmaId=${saFirmaId ?? ''}&projeId=${aktifProje.id}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : [])
      .then((loks: any[]) => {
        setSaSureliGorevAktif(Array.isArray(loks) && loks.some((l: any) => l.sureli_gorev_aktif))
      })
      .catch(() => setSaSureliGorevAktif(undefined))
  }, [isSA, aktifProje?.id, saFirmaId])

  // Gösterilecek kartlar:
  //   SA → saAktifTurler'e göre (null ise tümü göster)
  //   TA → initialRaporTurleri prop'una göre useMemo ile hesaplanır
  //        prop değişmediği sürece bu hesaplama yeniden yapılmaz
  //        herhangi bir client state değişimi bu değeri ETKILEYEMEZ
  const gorunurKartlar = useMemo(() => {
    // hakedis ve yeni rapor kartları firma_rapor_turleri dışında yönetilir
    const FIRMA_RAPOR_DISI = new Set(['hakedis', 'frekansiyel_rapor', 'spesifik_rapor'])

    const kartlar = RAPOR_KARTLARI
      .filter(k => k.id !== 'hakedis' || hakedisGoster)
      // Firma ayarı rapor_ozellestir_aktif = false ise SADECE ana kartı gizle.
      // Frekansiyel/Spesifik rapor kartları temel özellik, etkilenmez.
      .filter(k => k.id !== 'rapor_ozellestir' || ozellestirGoster)
      // SA için frekansiyel/spesifik her zaman görünür; TA/U için prop'tan gelir
      .filter(k => {
        if (!isSA) {
          if (k.id === 'frekansiyel_rapor') return frekanRaporYetki !== false
          if (k.id === 'spesifik_rapor')    return spesifRaporYetki !== false
        }
        return true
      })
      .map(k => ({
        ...k, icon: IKON_MAP[k.icon], href: `${base}/dashboard${k.path}`,
      }))

    if (isSA) {
      // SA: saAktifTurler null ise (henüz yüklenmedi veya hata) tümünü göster
      if (!saAktifTurler) return kartlar
      return kartlar.filter(k => FIRMA_RAPOR_DISI.has(k.id) || saAktifTurler.has(k.id))
    }

    // TA: initialRaporTurleri prop'undan direkt hesapla
    // Boş veya tanımsızsa tümünü göster (güvenli fallback)
    if (!initialRaporTurleri || initialRaporTurleri.length === 0) return kartlar
    const aktifIdler = new Set(
      initialRaporTurleri.filter(t => t.aktif !== false).map(t => t.id)
    )
    // Aktif ID seti boşsa (hepsi pasif) tümünü göster — bu bir veri tutarsızlığıdır
    if (aktifIdler.size === 0) return kartlar
    // hakedis + frekansiyel/spesifik rapor firma_rapor_turleri'nde kayıtlı değil
    return kartlar.filter(k => FIRMA_RAPOR_DISI.has(k.id) || aktifIdler.has(k.id))
  }, [isSA, saAktifTurler, base, initialRaporTurleri, hakedisGoster, ozellestirGoster, frekanRaporYetki, spesifRaporYetki])
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
          <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f9fafb', border: '1px solid #e5e7eb', display: 'grid', placeItems: 'center', color: '#1f2937', flexShrink: 0 }}>
            <FileBarChart2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#111827' }}>RAPOR MERKEZİ</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              Ham veri, grafiksel özet ve şablon tabanlı raporlar • Firma: <strong style={{ color: '#374151' }}>{firmaLabel}</strong>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {showLoading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
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
                sureliGorevBadge={kart.id === 'sure_analiz' ? (isSA ? saSureliGorevAktif : sureliGorevAktif) : undefined}
                onClick={() => { if (!kart.disabled) { start(); router.push(kart.href) } }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}
