'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime, CANLI_DURUM_LABEL } from '@/lib/utils'
import { resolveLiveCompletionStatusByTask } from '@/lib/tasks/liveStatus'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Pause, Play, Square } from 'lucide-react'
import ChecklistModal from '@/components/checklist/ChecklistModal'
import { iptalSebepKontrol } from '@/lib/validation/iptalSebep'

// ── Tarih/saat formatlama yardımcıları (TR — Europe/Istanbul) ────────────
function formatTarihTR(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Istanbul' })
}
function formatSaatTR(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Istanbul' })
}
function formatIslemSaatleri(baslatma?: string | null, bitis?: string | null): string {
  const b = formatSaatTR(baslatma)
  const t = formatSaatTR(bitis)
  if (!b && !t) return '—'
  return `${b || '—'} - ${t || '—'}`
}
function formatIslemSuresi(saniye?: number | null): string {
  if (saniye == null || saniye <= 0) return '—'
  if (saniye < 60) return `${saniye} sn`
  const dk = saniye / 60
  if (dk < 60) return `${dk.toFixed(1)} dk`
  const saat = Math.floor(dk / 60)
  const kalanDk = Math.round(dk % 60)
  return kalanDk > 0 ? `${saat} sa ${kalanDk} dk` : `${saat} sa`
}

// datetime-local input Türkiye saatini bekler — UTC Date'i Istanbul local string'e çevir
function toIstanbulLocalInput(d: Date): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

interface Props {
  firmaId: string
  lokasyonlar: { id: string; tanim: string; aktif: boolean }[]
  kullanicilar: { id: string; isim_soyisim: string; profil_foto?: string }[]
  initialGorevler: any[]
  meId: string
  meName?: string  // SA gibi farklı firma_id'li kullanıcıların join ile görünmeyeceği durumlar için fallback
  readonly: boolean
  projeId?: string | null
  showTumGorevler?: boolean  // false yapılırsa "Tüm Görevler" linki gizlenir
  yetkiliLokIds?: string[] | null
  canliAkisSureSaat?: number  // canlı akış listeleme süresi (varsayılan 8)
  ceklistAktif?: boolean  // proje bazlı: frekansiyel görev çeklist aç/kapat
  personelAtamaAktif?: boolean  // proje bazlı: kapalıysa Atanan sütunu gizlenir
  islemSureleriAktif?: boolean  // proje bazlı: kapalıysa İşlem Saatleri+Süresi sütunları gizlenir
}

type BrowseFilter = 'ACIK' | 'IPTAL' | 'KAPALI' | 'TARIHI_GECMIS'

// ── CANLI AKIŞ HEADER BİLEŞENİ ─────────────────────────────────────────
function LiveHeader({
  kpi, durumFilter, setDurumFilter, clock, streamState, setStreamState, pathname, readonly, showTumGorevler = true, canliAkisSureSaat = 8,
}: {
  kpi: { toplam: number; tamamlandi: number; islemde: number; beklemede: number; iptal: number; gecikmis: number; gecmis: number }
  durumFilter: string
  setDurumFilter: (v: string) => void
  clock: string
  streamState: 'running' | 'paused' | 'stopped'
  setStreamState: (v: any) => void
  pathname: string | null
  readonly: boolean
  showTumGorevler?: boolean
  canliAkisSureSaat?: number
}) {
  const FILTERS = [
    { key: 'TÜMÜ',      label: 'Tümü',              count: kpi.toplam },
    { key: 'TAMAMLANDI',label: 'Tamamlandı',       count: kpi.tamamlandi },
    { key: 'ISLEMDE',   label: 'İşlemde',          count: kpi.islemde },
    { key: 'BEKLEMEDE', label: 'Beklemede',         count: kpi.beklemede },
    { key: 'IPTAL',     label: 'İptal',             count: kpi.iptal },
    { key: 'GECİKMİŞ', label: 'Gecikmeli',         count: kpi.gecikmis },
    { key: 'GECMİŞ',   label: 'Zamanı Geçmiş',    count: kpi.gecmis },
  ]
  const dotColor = streamState === 'running' ? '#374151' : streamState === 'paused' ? '#d97706' : '#9ca3af'
  const kpiCards = [
    { label: 'Toplam',             val: kpi.toplam,      bg: 'transparent',  vColor: '#111827',  lColor: '#6b7280' },
    { label: 'Tamamlandı',       val: kpi.tamamlandi,  bg: '#f0fdf4',      vColor: '#166534',  lColor: '#3B6D11' },
    { label: 'İşlemde',          val: kpi.islemde,     bg: '#eff6ff',      vColor: '#1d4ed8',  lColor: '#185FA5' },
    { label: 'Beklemede',        val: kpi.beklemede,   bg: '#fffbeb',      vColor: '#92400e',  lColor: '#854F0B' },
    { label: 'İptal',            val: kpi.iptal,       bg: '#f9fafb',      vColor: '#6b7280',  lColor: '#6b7280' },
    { label: 'Gecikmeli',        val: kpi.gecikmis,    bg: '#fef9c3',      vColor: '#854d0e',  lColor: '#854d0e' },
    { label: 'Zamanı Geçmiş',    val: kpi.gecmis,      bg: '#fef2f2',      vColor: '#991b1b',  lColor: '#A32D2D' },
  ]

  return (
    <div className="verde-card" style={{ overflow: 'hidden', marginBottom: 0 }}>
      {/* ── BAŞLIK SATIRI ── */}
      <div style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          {/* Tarayıcı animasyonu */}
          <div style={{ width: 20, height: 20, border: '1.5px solid #374151', borderRadius: 5, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
            <div style={{
              position: 'absolute', left: 0, right: 0, height: 2,
              background: 'rgba(46,139,46,0.5)',
              animation: streamState === 'running' ? 'canliScan 1.8s linear infinite' : 'none',
            }} />
          </div>
          <span style={{ fontSize: 14, fontWeight: 800, color: '#111827', letterSpacing: '-0.2px' }}>
            Frekansiyel Görev Akışı
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', padding: '2px 8px', borderRadius: 4 }}>
            {canliAkisSureSaat === -1 ? 'Bugün' : `Son ${canliAkisSureSaat} saat`}
          </span>
          {/* Canlı badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, background: streamState === 'running' ? '#f9fafb' : '#f5f5f5', border: `1px solid ${streamState === 'running' ? '#d1d5db' : '#e0e0e0'}` }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0,
              animation: streamState === 'running' ? 'canliPulse 1.4s ease-in-out infinite' : 'none' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: dotColor }}>
              {streamState === 'running' ? 'Canlı' : streamState === 'paused' ? 'Duraklatıldı' : 'Durduruldu'}
            </span>
          </div>
        </div>

        {/* Kontroller - sadece SA/TA için */}
        {!readonly && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {[
              { s: 'running' as const, icon: '▶', title: 'Başlat' },
              { s: 'paused' as const, icon: '⏸', title: 'Duraklat' },
              { s: 'stopped' as const, icon: '⏹', title: 'Durdur' },
            ].map(({ s, icon, title }) => (
              <button key={s} type="button" title={title}
                onClick={() => setStreamState(s)}
                style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${streamState === s ? '#374151' : '#e5e7eb'}`, background: streamState === s ? '#e5e7eb' : '#fff', cursor: 'pointer', fontSize: 11, color: streamState === s ? '#1f2937' : '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {icon}
              </button>
            ))}
          </div>
        )}

        {showTumGorevler && (
          <Link href={`${pathname}/tum-gorevler`}
            style={{ fontSize: 12.5, fontWeight: 700, color: '#374151', textDecoration: 'none', border: '1px solid #d1d5db', borderRadius: 7, padding: '5px 12px', background: '#f9fafb', whiteSpace: 'nowrap', flexShrink: 0 }}>
            Tüm Görevler →
          </Link>
        )}
      </div>

      {/* ── KPI KARTLARI (tıklanabilir filtre) ── */}
      <div style={{ padding: '8px 18px', borderBottom: '1px solid #f3f4f6', display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, alignItems: 'stretch' }}>
        {kpiCards.map(({ label, val, bg, vColor, lColor }, i) => {
          const filterKey = FILTERS[i]?.key ?? 'TÜMÜ'
          const active = durumFilter === filterKey
          return (
            <button key={label} type="button" onClick={() => setDurumFilter(filterKey)}
              style={{
                background: active ? vColor + '0F' : bg === 'transparent' ? '#fafafa' : bg,
                borderRadius: 8, padding: '8px 8px', textAlign: 'left', cursor: 'pointer',
                border: active ? `2px solid ${vColor}` : '1px solid #e5e7eb',
                transition: 'all 0.15s',
                outline: 'none',
              }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: vColor, lineHeight: 1 }}>{val}</div>
              <div style={{ fontSize: 10, color: lColor, marginTop: 2, fontWeight: active ? 700 : 500 }}>{label}</div>
            </button>
          )
        })}
      </div>
      <div style={{ padding: '4px 18px 4px', display: 'flex', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 11, color: '#9ca3af', fontVariantNumeric: 'tabular-nums' }}>{clock}</span>
      </div>

      <style>{`
        @keyframes canliPulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.65)} }
        @keyframes canliScan { 0%{top:-100%} 100%{top:100%} }
        @keyframes islemdePulse { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
        /* Parlama efekti — 3 katman: data-attribute, class, element hover bypass */
        .verde-table tbody tr[data-highlight="1"],
        .verde-table tbody tr.row-new,
        tr[data-highlight="1"] {
          background-color: #fde68a !important;
          box-shadow: inset 0 0 0 2px #f59e0b !important;
        }
        .verde-table tbody tr[data-highlight="1"] > td,
        .verde-table tbody tr.row-new > td,
        tr[data-highlight="1"] > td {
          background-color: #fde68a !important;
          transition: background-color 0.8s ease-out;
        }
      `}</style>
    </div>
  )
}

export default function CanliIslemlerClient({ firmaId, lokasyonlar, kullanicilar, initialGorevler, meId, meName, readonly, projeId, showTumGorevler = true, yetkiliLokIds, canliAkisSureSaat = 8, ceklistAktif = true, personelAtamaAktif = true, islemSureleriAktif = true }: Props) {
  const supabase = createClient()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const pathname = usePathname()
  const isTA  = pathname?.startsWith('/ta')
  const isSA  = !isTA && !readonly   // SA veya alt_SA
const [locMap, setLocMap] = useState<Record<string, { tanim: string; parent_id: string | null }>>({})

const getLocPath = useMemo(() => {
  return (lokasyonId: string | null | undefined, fallbackName?: string | null) => {
    if (!lokasyonId) return fallbackName ?? '—'
    const parts: string[] = []
    let cur: string | null = lokasyonId
    let guard = 0
    while (cur && guard < 5) {
      const node: { tanim: string; parent_id: string | null } | undefined =
  locMap[cur as string]
      if (!node) break
      parts.push(node.tanim)
      cur = node.parent_id
      guard++
    }
    const path = parts.reverse().join(' / ')
    return path || (fallbackName ?? '—')
  }
}, [locMap])



  const [streamState, setStreamState] = useState<'running' | 'paused' | 'stopped'>('running')
  const [clock, setClock] = useState('')
  const [durumFilter, setDurumFilter] = useState<string>('TÜMÜ')

  useEffect(() => {
    function tick() {
      const now = new Date()
      const pad = (n: number) => String(n).padStart(2, '0')
      setClock(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [])

  const [browseGorevler, setBrowseGorevler] = useState<any[]>(initialGorevler)
  const [liveFlowGorevler, setLiveFlowGorevler] = useState<any[]>([])
  const [liveKpiRows, setLiveKpiRows] = useState<{ durum: string }[]>([])
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const lastTopIdRef = useRef<string | null>(null)
  // Bugünün tüm canlı görevleri (vardiya özet kartları için).
  // browseGorevler son N saat ile sınırlı; vardiya özetinin doğruluğu için
  // bugünün TR gün başlangıcından itibaren ayrı fetch ediyoruz.
  const [bugunGorevler, setBugunGorevler] = useState<any[]>([])
  const [vardiyaAyari, setVardiyaAyari] = useState<{ no: number; baslangic: string; bitis: string }[]>([])

  // NÜKLEER FIX: React render zinciri bir sebepten parlamayı DOM'a yansıtamıyor
  // (muhtemelen #422 hydration sorunu). highlightId değişince DOM'u direkt boyayalım.
  // Her data refresh'te (1sn) tr remount oluyor; deps'e liveFlowGorevler ekleyerek
  // stil 3sn boyunca her render'da yeniden uygulanır.
  const highlightedIdRef = useRef<string | null>(null)
  useEffect(() => {
    // Önceki highlightId'yi temizle
    const prev = highlightedIdRef.current
    if (prev && prev !== highlightId) {
      document.querySelectorAll<HTMLTableRowElement>(`tr[data-gid="${prev}"]`).forEach(tr => {
        tr.style.removeProperty('background-color')
        tr.style.removeProperty('box-shadow')
        tr.querySelectorAll<HTMLTableCellElement>('td').forEach(td => {
          td.style.removeProperty('background-color')
        })
      })
    }
    highlightedIdRef.current = highlightId
    if (!highlightId) return
    // Yeni highlightId'yi uygula (data refresh'te de tekrar çalışır, deps yüzünden)
    const apply = () => {
      const rows = document.querySelectorAll<HTMLTableRowElement>(`tr[data-gid="${highlightId}"]`)
      rows.forEach(tr => {
        tr.style.setProperty('background-color', '#fde68a', 'important')
        tr.style.setProperty('box-shadow', 'inset 0 0 0 2px #f59e0b', 'important')
        tr.style.setProperty('transition', 'background-color 0.8s ease-out', 'important')
        tr.querySelectorAll<HTMLTableCellElement>('td').forEach(td => {
          td.style.setProperty('background-color', '#fde68a', 'important')
          td.style.setProperty('transition', 'background-color 0.8s ease-out', 'important')
        })
      })
    }
    apply()
    // Bir sonraki frame'de de uygula (tr henüz mount olmadıysa yakalar)
    const raf = requestAnimationFrame(apply)
    return () => cancelAnimationFrame(raf)
  }, [highlightId, liveFlowGorevler])

  // 3sn sonra highlight'ı temizle (ayrı effect: data refresh deps'i etkilemesin)
  useEffect(() => {
    if (!highlightId) return
    const target = highlightId
    const t = setTimeout(() => setHighlightId(cur => cur === target ? null : cur), 3000)
    return () => clearTimeout(t)
  }, [highlightId])

  // İŞLEMDE durumunda olan görevlerin badge'i (durum rozeti) yanıp sönsün.
  // Satır değil — sadece rozet. Görev devam ediyor anlamında.
  // Negatif animation-delay ile global clock'a senkron — re-mount'ta kopmaz.
  useEffect(() => {
    liveFlowGorevler.forEach(g => {
      const tr = document.querySelector<HTMLTableRowElement>(`tr[data-gid="${g.id}"]`)
      if (!tr) return
      const badge = tr.querySelector<HTMLElement>('.verde-badge')
      if (!badge) return
      if (g.durum === 'ISLEMDE') {
        const offset = (Date.now() / 1000) % 1.0
        badge.style.setProperty('animation', 'islemdePulse 1s linear infinite', 'important')
        badge.style.setProperty('animation-delay', `${-offset}s`, 'important')
      } else {
        badge.style.removeProperty('animation')
        badge.style.removeProperty('animation-delay')
      }
    })
  }, [liveFlowGorevler])
  const [checklistGorev, setChecklistGorev] = useState<{ id: string; type: 'canli_gorevler' } | null>(null)
  // İptal nedeni popup'ı
  const [iptalDetay, setIptalDetay] = useState<{ sebep?: string | null; eden?: string | null; tarih?: string | null } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedGorev, setSelectedGorev] = useState<any | null>(null)

  const [browse, setBrowse] = useState<BrowseFilter>('ACIK')

  const [modal, setModal] = useState<null | 'create' | 'edit'>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const emptyForm = { tanim: '', lokasyon_id: '', atanan_kullanici_id: '', aktif_olma_tarihi: '', durum: '' }
  const [form, setForm] = useState(emptyForm)

  const durumRenk: Record<string, string> = {
    HAZIR: 'status-hazir',
    ACIK: 'status-islemde',
    BEKLEMEDE: 'status-beklemede',
    ISLEMDE: 'status-islemde',
    IPTAL: 'status-iptal',
    TAMAMLANDI: 'status-tamamlandi',
    ZAMANINDA_YAPILAMAYAN: 'status-zamaninda',
    ZAMANI_GECMIS: 'status-zamaninda',
    KAPATILDI: 'status-kapatildi',
    SILINDI: 'status-silindi',
  }

  // Canlı akış (tamamlanan/iptal/kapatıldı/silindi) için: 1 sn yenile + realtime
  useEffect(() => {
  let alive = true
  async function loadLocs() {
    if (!firmaId) return
    let q = supabase
      .from('lokasyonlar')
      .select('id,tanim,parent_id')
      .eq('firma_id', firmaId)
      .eq('aktif', true)
    if (projeId) q = (q as any).eq('proje_id', projeId)
    const { data, error } = await q

    if (error) {
      console.error('Lokasyonlar yüklenemedi', error)
      return
    }
    if (!alive) return
    const map: Record<string, { tanim: string; parent_id: string | null }> = {}
    ;(data ?? []).forEach((l: any) => {
      map[l.id] = { tanim: l.tanim, parent_id: l.parent_id }
    })
    setLocMap(map)
  }
  loadLocs()
  return () => {
    alive = false
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [firmaId, projeId])

useEffect(() => {
    if (streamState === 'stopped') {
      setLiveFlowGorevler([])
      setLiveKpiRows([])
      lastTopIdRef.current = null
      return
    }

    if (!firmaId) return

    const channel = supabase
      .channel(`canli-gorevler-liveflow-${firmaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'canli_gorevler', filter: `firma_id=eq.${firmaId}` },
        async () => {
          await Promise.all([refreshBrowse(), refreshLiveFlow()])
        },
      )
      // Spesifik görevler de dinle (mobil tamamlama/iptal)
      .on(
        'postgres_changes' as any,
        { event: 'UPDATE', schema: 'public', table: 'gorevler', filter: `firma_id=eq.${firmaId}` },
        async () => { await refreshBrowse() },
      )
      .subscribe()

    const liveInterval = setInterval(refreshLiveFlow, 1000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(liveInterval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId])

  // Görevlere göz at listesi için: 10 sn yenile
  useEffect(() => {
    if (!firmaId) return
    refreshBrowse()
    const interval = setInterval(refreshBrowse, 10000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId])

  // Hazır -> Aktif otomasyonu (dev ortamında cron yoksa): 10 sn'de bir kontrol et
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await fetch('/api/canli-gorevler/check', { cache: 'no-store' })
      } catch {}
    }, 10000)
    return () => clearInterval(interval)
  }, [streamState])

  // Listeleme süresinin başlangıcını hesapla.
  //   canliAkisSureSaat = -1 → "Bugün" → TR günü 00:00:00
  //   canliAkisSureSaat > 0 → Son N saat → şimdi - N saat
  function computeSinceISO(): string {
    if (canliAkisSureSaat === -1) {
      const trDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })  // 'YYYY-MM-DD'
      return new Date(`${trDate}T00:00:00+03:00`).toISOString()
    }
    return new Date(Date.now() - canliAkisSureSaat * 60 * 60 * 1000).toISOString()
  }

  // Vardiya ayarlarını çek (firma + vardiya_sayisi)
  useEffect(() => {
    if (!firmaId) return
    let alive = true
    ;(async () => {
      const { data: firma } = await supabase
        .from('firmalar')
        .select('vardiya_sayisi, tum_vardiya_ayarlari')
        .eq('id', firmaId)
        .single()
      if (!alive || !firma) return
      const sayisi = (firma as any).vardiya_sayisi ?? 3
      const set = ((firma as any).tum_vardiya_ayarlari?.[String(sayisi)] ?? []) as { no: number; baslangic: string; bitis: string }[]
      setVardiyaAyari(Array.isArray(set) ? set : [])
    })()
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId])

  // Bugünün TR günü için tüm canlı görevleri çek (vardiya özet kartları)
  async function refreshBugun() {
    if (!firmaId) return
    const trDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
    const trStartISO = new Date(`${trDate}T00:00:00+03:00`).toISOString()
    let q = supabase
      .from('canli_gorevler')
      .select('id,durum,aktif_olma_tarihi')
      .eq('firma_id', firmaId)
      .gte('aktif_olma_tarihi', trStartISO)
      .limit(2000)
    if (projeId) q = (q as any).or(`proje_id.eq.${projeId},proje_id.is.null`)
    if (yetkiliLokIds) q = q.in('lokasyon_id', yetkiliLokIds)
    const { data } = await q
    if (data) setBugunGorevler(data)
  }

  // Vardiya özet kartlarını her dakika tazele (canlı veriden ayrı, hafif sorgu)
  useEffect(() => {
    if (!firmaId) return
    refreshBugun()
    const id = setInterval(refreshBugun, 60 * 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId, projeId, yetkiliLokIds])

  // Vardiya özetleri — TumGorevlerClient ile aynı mantık
  const vardiyaOzetleri = useMemo(() => {
    if (!vardiyaAyari.length) return []
    function trIsoParts(iso: string): { tarih: string; saat: string } {
      const d = new Date(iso)
      const tarih = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
      const saat = d.toLocaleTimeString('tr-TR', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Istanbul',
      })
      return { tarih, saat }
    }
    function vardiyaBul(saat: string): number | null {
      for (const v of vardiyaAyari) {
        const gece = v.bitis <= v.baslangic
        const eslesir = gece
          ? (saat >= v.baslangic || saat < v.bitis)
          : (saat >= v.baslangic && saat < v.bitis)
        if (eslesir) return v.no
      }
      return null
    }
    const bugunTR = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
    const KAYIP_DURUMLAR = new Set(['IPTAL', 'BEKLEMEDE', 'ZAMANI_GECMIS'])
    const sayac: Record<number, { toplam: number; tamamlanan: number; sapma: number; kayip: number }> = {}
    for (const v of vardiyaAyari) sayac[v.no] = { toplam: 0, tamamlanan: 0, sapma: 0, kayip: 0 }
    for (const g of bugunGorevler) {
      if (!g.aktif_olma_tarihi) continue
      const { tarih, saat } = trIsoParts(g.aktif_olma_tarihi)
      if (tarih !== bugunTR) continue
      const vNo = vardiyaBul(saat)
      if (vNo === null || !sayac[vNo]) continue
      sayac[vNo].toplam++
      if (g.durum === 'TAMAMLANDI') sayac[vNo].tamamlanan++
      else if (g.durum === 'ZAMANINDA_YAPILAMAYAN') sayac[vNo].sapma++
      else if (KAYIP_DURUMLAR.has(g.durum)) sayac[vNo].kayip++
    }
    return vardiyaAyari
      .slice()
      .sort((a, b) => a.no - b.no)
      .map(v => {
        const s = sayac[v.no] ?? { toplam: 0, tamamlanan: 0, sapma: 0, kayip: 0 }
        const basari = s.toplam > 0 ? Math.round(((s.tamamlanan + s.sapma) / s.toplam) * 100) : 0
        return { no: v.no, baslangic: v.baslangic, bitis: v.bitis, ...s, basari }
      })
  }, [vardiyaAyari, bugunGorevler])

  async function refreshBrowse() {
    if (!firmaId) return

    const sinceISO = computeSinceISO()
    let q = supabase
      .from('canli_gorevler')
      .select('*,lokasyonlar(tanim),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim),olusturan:users!olusturan_id(isim_soyisim),tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim),iptalEden:users!iptal_eden_id(isim_soyisim)')
      .eq('firma_id', firmaId)
      .gte('aktif_olma_tarihi', sinceISO)
      .order('durum_degisim_tarihi', { ascending: false })
      .limit(500)

    // TA için "SILINDI" listeden kaldırılır
    if (isTA) q = q.neq('durum', 'SILINDI')
    if (projeId) q = (q as any).or(`proje_id.eq.${projeId},proje_id.is.null`)
    if (yetkiliLokIds) q = q.in('lokasyon_id', yetkiliLokIds)

    const { data } = await q

    if (data) {
      setBrowseGorevler(data)
      // Seçili görev listeden düşse bile seçili kalmalı: gerekirse ID ile tekil çek
      if (selectedId) {
        const found = data.find((g: any) => g.id === selectedId)
        if (found) {
          setSelectedGorev(found)
        } else {
          const { data: single } = await supabase
            .from('canli_gorevler')
            .select('*,lokasyonlar(tanim),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim),olusturan:users!olusturan_id(isim_soyisim),tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim),iptalEden:users!iptal_eden_id(isim_soyisim)')
            .eq('id', selectedId)
            .maybeSingle()
          if (single) setSelectedGorev(single)
        }
      }
    }
  }

  async function refreshLiveFlow() {
    if (!firmaId) return

    // Yalnızca kullanıcı tarafından işlem yapılmış görevler
    // islemi_yapan_id dolu = bir insan eli değmiştir (TAMAMLANDI, IPTAL, ZAMANINDA_YAPILAMAYAN, ZAMANI_GECMIS manuel vs.)
    const liveSelect =
      '*,lokasyonlar(tanim),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim),olusturan:users!olusturan_id(isim_soyisim),tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim),iptalEden:users!iptal_eden_id(isim_soyisim)'

    const liveSinceISO = computeSinceISO()
    // Kapsam: "Son N saatte AKTİF OLMUŞ görevler" (vardiya kartlarıyla uyumlu).
    // Önceden durum_degisim_tarihi'ne göre filtreliyordu — bu yüzden dün aktif
    // olup bugün PD cron'la ZYS'ye düşen görevler "bugünün" gecikmelisine
    // sayılıyordu. Artık görev hangi vardiyada aktif olduysa o günün özetinde.
    let liveQ = supabase
      .from('canli_gorevler')
      .select(liveSelect)
      .eq('firma_id', firmaId)
      .not('durum', 'in', '(HAZIR,ACIK)')
      .gte('aktif_olma_tarihi', liveSinceISO)
      .order('durum_degisim_tarihi', { ascending: false })
      .limit(500)

    if (projeId) liveQ = liveQ.eq('proje_id', projeId)
    if (yetkiliLokIds) liveQ = liveQ.in('lokasyon_id', yetkiliLokIds)

    // KPI için ayrı count sorgusu — sadece durum kolonu, yüksek limit
    let kpiQ = supabase
      .from('canli_gorevler')
      .select('durum')
      .eq('firma_id', firmaId)
      .not('durum', 'in', '(HAZIR,ACIK)')
      .gte('aktif_olma_tarihi', liveSinceISO)
      .limit(10000)
    if (projeId) kpiQ = kpiQ.eq('proje_id', projeId)
    if (yetkiliLokIds) kpiQ = kpiQ.in('lokasyon_id', yetkiliLokIds)

    const [res, kpiRes] = await Promise.all([liveQ, kpiQ])

    if (kpiRes.error) {
      console.error('[LiveFlow] kpi error:', kpiRes.error)
    }
    if (kpiRes.data && !kpiRes.error) {
      setLiveKpiRows(kpiRes.data as { durum: string }[])
    }

    if (res.error) {
      console.error('[LiveFlow] primary error:', res.error)
      // Join hatası vs — basit fallback ile join'siz dene
      let fallbackQ = supabase
        .from('canli_gorevler')
        .select('*')
        .eq('firma_id', firmaId)
        .not('durum', 'in', '(HAZIR,ACIK)')
        .gte('aktif_olma_tarihi', liveSinceISO)
        .order('durum_degisim_tarihi', { ascending: false })
        .limit(500)
      if (projeId) fallbackQ = fallbackQ.eq('proje_id', projeId)
      if (yetkiliLokIds) fallbackQ = fallbackQ.in('lokasyon_id', yetkiliLokIds)

      const res2 = await fallbackQ

      if (res2.error) {
        console.error('[LiveFlow] fallback error:', res2.error)
        return
      }

      const data = res2.data
      if (data) setLiveFlowGorevler(data)
      return
    }

    const data = res.data
    if (data) {
      const nextTopId = data?.[0]?.id ?? null
      const prevTopId = lastTopIdRef.current
      // TEMP DEBUG — parlama sorununu bulmak için
      console.log('[LiveFlow]', { count: data.length, nextTopId, prevTopId, willHighlight: !!(nextTopId && nextTopId !== prevTopId) })
      if (nextTopId && nextTopId !== prevTopId) {
        const targetId = nextTopId
        console.log('[LiveFlow] HIGHLIGHT SET →', targetId)
        setHighlightId(targetId)
        // 3sn sonra temizleme useEffect'te (DOM tarafı).
      }
      lastTopIdRef.current = nextTopId
      setLiveFlowGorevler(data)
    }
  }

  const selected = useMemo(() => {
    if (!selectedId) return null
    if (selectedGorev?.id === selectedId) return selectedGorev
    return browseGorevler.find((g) => g.id === selectedId) ?? null
  }, [browseGorevler, selectedGorev, selectedId])


  // KPI sayaçları — liveKpiRows'dan (ayrı/limitsiz sorgudan) hesaplanır.
  // liveFlowGorevler limit(500) ile sınırlı olduğu için KPI total yanlış gösteriyordu.
  const kpi = useMemo(() => ({
    toplam:     liveKpiRows.length,
    tamamlandi: liveKpiRows.filter(g => g.durum === 'TAMAMLANDI').length,
    islemde:    liveKpiRows.filter(g => g.durum === 'ISLEMDE').length,
    beklemede:  liveKpiRows.filter(g => g.durum === 'BEKLEMEDE').length,
    iptal:      liveKpiRows.filter(g => g.durum === 'IPTAL').length,
    gecikmis:   liveKpiRows.filter(g => g.durum === 'ZAMANINDA_YAPILAMAYAN').length,
    gecmis:     liveKpiRows.filter(g => g.durum === 'ZAMANI_GECMIS').length,
  }), [liveKpiRows])

  // Durum filtreli canlı liste
  const filteredLive = useMemo(() => {
    if (durumFilter === 'TÜMÜ') return liveFlowGorevler
    if (durumFilter === 'TAMAMLANDI') return liveFlowGorevler.filter((g:any) => g.durum === 'TAMAMLANDI')
    if (durumFilter === 'ISLEMDE') return liveFlowGorevler.filter((g:any) => g.durum === 'ISLEMDE')
    if (durumFilter === 'BEKLEMEDE') return liveFlowGorevler.filter((g:any) => g.durum === 'BEKLEMEDE')
    if (durumFilter === 'IPTAL') return liveFlowGorevler.filter((g:any) => g.durum === 'IPTAL')
    if (durumFilter === 'GECİKMİŞ') return liveFlowGorevler.filter((g:any) => g.durum === 'ZAMANINDA_YAPILAMAYAN')
    if (durumFilter === 'GECMİŞ') return liveFlowGorevler.filter((g:any) => g.durum === 'ZAMANI_GECMIS')
    return liveFlowGorevler
  }, [liveFlowGorevler, durumFilter])

  // Sayfalama — canlı akış
  const LIVE_PER_PAGE = 100
  const [liveSayfa, setLiveSayfa] = useState(1)
  const liveToplamSayfa = Math.max(1, Math.ceil(filteredLive.length / LIVE_PER_PAGE))
  const filtreLiveSayfa = useMemo(
    () => filteredLive.slice((liveSayfa - 1) * LIVE_PER_PAGE, liveSayfa * LIVE_PER_PAGE),
    [filteredLive, liveSayfa]
  )
  // Filtre değişince 1. sayfaya dön
  useEffect(() => { setLiveSayfa(1) }, [durumFilter])
  // Sayfa sayısı düştüyse (yeni filtre) sayfayı sınır içine çek
  useEffect(() => { if (liveSayfa > liveToplamSayfa) setLiveSayfa(liveToplamSayfa) }, [liveToplamSayfa, liveSayfa])

  const browseList = useMemo(() => {
    if (browse === 'ACIK') return browseGorevler.filter((g) => ['HAZIR', 'ACIK', 'BEKLEMEDE', 'ISLEMDE'].includes(g.durum))
    if (browse === 'IPTAL') return browseGorevler.filter((g) => g.durum === 'IPTAL')
    if (browse === 'KAPALI') return browseGorevler.filter((g) => ['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN'].includes(g.durum))
    // TARIHI_GECMIS
    return browseGorevler.filter((g) => g.durum === 'ZAMANI_GECMIS')
  }, [browseGorevler, browse])

  function openCreate() {
    setError('')
    setSuccess('')
    setForm(emptyForm)
    setModal('create')
  }

  function openEdit() {
    if (!selected) return
    setError('')
    setSuccess('')
    setForm({
      tanim: selected.tanim ?? '',
      lokasyon_id: selected.lokasyon_id ?? '',
      atanan_kullanici_id: selected.atanan_kullanici_id ?? '',
      aktif_olma_tarihi: selected.aktif_olma_tarihi ? toIstanbulLocalInput(new Date(selected.aktif_olma_tarihi)) : '',
      durum: selected.durum ?? '',
    })
    setModal('edit')
  }

  async function updateDurum(gorevId: string, nd: string) {
    const nowIso = new Date().toISOString()
    const patch: any = { durum: nd, durum_degisim_tarihi: nowIso, islemi_yapan_id: meId }

    // Önce mevcut durumu kontrol et
    const { data: liveTask } = await supabase
      .from('canli_gorevler')
      .select('durum,aktif_olma_tarihi,durum_degisim_tarihi')
      .eq('id', gorevId)
      .maybeSingle()

    const mevcutDurum = (liveTask as any)?.durum

    // ZAMANI_GECMIS → SA manuel yapabilir; TA ve diğerleri yapamaz
    if (nd === 'ZAMANI_GECMIS') {
      if (!isSA) throw new Error('Bu işlem için yetkiniz yok.')
      patch.iptal_eden_id = meId
      patch.iptal_tarihi  = nowIso
      const { error: err } = await supabase.from('canli_gorevler').update(patch).eq('id', gorevId)
      if (err) throw err
      return
    }

    // Otomatik ZAMANI_GECMIS olan görevlerde SA hariç işlem yapılamaz
    if (mevcutDurum === 'ZAMANI_GECMIS' && !isSA) {
      throw new Error('Zamanı geçmiş görevlerde işlem yapılamaz.')
    }
    // BEKLEMEDE: hiçbir kullanıcı manuel işlem yapamaz
    if (mevcutDurum === 'BEKLEMEDE') {
      throw new Error('Beklemede olan görevlerde manuel işlem yapılamaz.')
    }

    // Terminal → non-terminal geri-açma: önceki tamamlanma/iptal/başlatma izlerini sıfırla
    // (yoksa eski tamamlanma_tarihi, tamamlayan_kullanici_id, son_tamamlama_kanali, vs.
    // canli_gorevler kaydında kalır ve sanki görev yarım tamamlanmış gibi görünür)
    const TERMINAL_DURUMLAR = ['TAMAMLANDI', 'IPTAL', 'KAPATILDI', 'SILINDI', 'ZAMANI_GECMIS', 'ZAMANINDA_YAPILAMAYAN']
    const NON_TERMINAL_DURUMLAR = ['HAZIR', 'ACIK', 'BEKLEMEDE', 'ISLEMDE']
    if (TERMINAL_DURUMLAR.includes(mevcutDurum) && NON_TERMINAL_DURUMLAR.includes(nd)) {
      patch.tamamlanma_tarihi        = null
      patch.tamamlayan_kullanici_id  = null
      patch.tamamlanma_suresi_saniye = null
      patch.iptal_tarihi             = null
      patch.iptal_eden_id            = null
      patch.iptal_sebep              = null
      patch.son_tamamlama_kanali     = null
      // ISLEMDE'ye değilse başlatma izini de temizle (görev hiç başlatılmamış sayılır)
      if (nd !== 'ISLEMDE') {
        patch.baslatilma_tarihi    = null
        patch.baslatan_kullanici_id = null
      }
    }

    // Duruma göre ek alanları doldur
    if (nd === 'TAMAMLANDI') {
      patch.durum = resolveLiveCompletionStatusByTask(liveTask as any, nowIso)
      if (patch.durum === 'ZAMANI_GECMIS' && !isSA) {
        throw new Error('Zamanı geçmiş görevlerde işlem yapılamaz.')
      }
      patch.tamamlanma_tarihi       = nowIso
      patch.tamamlayan_kullanici_id = meId
    }
    if (['IPTAL', 'KAPATILDI', 'SILINDI'].includes(nd)) {
      patch.iptal_tarihi  = nowIso
      patch.iptal_eden_id = meId
    }

    const { error: err } = await supabase.from('canli_gorevler').update(patch).eq('id', gorevId)
    if (err) throw err
  }

  async function handleCreateOrEdit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      if (!form.tanim || !form.lokasyon_id || !form.aktif_olma_tarihi) throw new Error('Lütfen gerekli alanları doldurun.')
      if (modal === 'create' && new Date(form.aktif_olma_tarihi).getTime() < Date.now()) throw new Error('Aktif olma tarihi geçmiş bir tarih olamaz.')

      // Personel takibi kontrolü — atanan kullanıcı iş başı yapmış mı?
      if (form.atanan_kullanici_id && firmaId) {
        const kontrolUrl = new URLSearchParams({ user_id: form.atanan_kullanici_id, firma_id: firmaId })
        if (projeId) kontrolUrl.set('proje_id', projeId)
        const kontrolRes  = await fetch(`/api/mesai/kontrol?${kontrolUrl}`)
        const kontrolJson = await kontrolRes.json()
        if (kontrolJson.ok && kontrolJson.atanabilir === false) {
          throw new Error(kontrolJson.neden)
        }
      }
      const payload: any = {
        tanim: form.tanim,
        lokasyon_id: form.lokasyon_id,
        atanan_kullanici_id: form.atanan_kullanici_id || null,
        aktif_olma_tarihi: new Date(form.aktif_olma_tarihi).toISOString(),
      }
      if (modal === 'edit' && form.durum) payload.durum = form.durum

      if (modal === 'create') {
        const { error: err } = await supabase.from('canli_gorevler').insert({
          ...payload,
          firma_id: firmaId,
          durum: 'HAZIR',
          olusturan_id: meId,
          islemi_yapan_id: meId,
          ...(projeId ? { proje_id: projeId } : {}),
        })
        if (err) throw err
        setSuccess('Frekansiyel görev oluşturuldu!')
      } else if (modal === 'edit' && selected) {
        payload.islemi_yapan_id = meId
        const { error: err } = await supabase.from('canli_gorevler').update(payload).eq('id', selected.id)
        if (err) throw err
        setSuccess('Frekansiyel görev güncellendi!')
      }

      setModal(null)
      await Promise.all([refreshBrowse(), refreshLiveFlow()])
    } catch (e: any) {
      setError(e.message ?? 'İşlem sırasında hata oluştu')
    }

    setSaving(false)
  }

  async function handleDelete() {
    if (!selected) return
    const ok = await confirm({
      title: 'Silme Onayı',
      message: 'Seçili frekansiyel görevi silmek istediğinizden emin misiniz?',
      confirmText: 'Sil',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return
    if (isTA) {
      // TA için: fiziksel silme yok, durum SILINDI yapılır ve listeden düşer.
      await updateDurum(selected.id, 'SILINDI')
    } else {
      const res = await fetch('/api/tasks/sil', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [selected.id], tablo: 'canli_gorevler', firma_id: firmaId }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error ?? 'Silinemedi')
    }
    setSelectedId(null)
    setSelectedGorev(null)
    refreshLiveFlow()
  }

  async function handleIptal(id: string) {
    // İptal sebebi zorunlu — junk girişlere karşı ortak validator (lib/validation/iptalSebep)
    // En az 5 char, 3 farklı karakter, harf/rakam içermeli ("....", "aaaaa" reddedilir).
    let sebep = ''
    while (true) {
      const sebepRaw = window.prompt('Görev iptal sebebi (örn. "ekipman arızası", "personel yetişemedi"):', sebep)
      if (sebepRaw === null) return  // Vazgeç
      const check = iptalSebepKontrol(sebepRaw)
      if (check.ok) { sebep = check.sebep; break }
      sebep = sebepRaw  // tekrar göster, kullanıcı düzeltsin
      toast({ type: 'error', title: 'Geçersiz İptal Sebebi', message: check.mesaj })
    }
    await supabase
      .from('canli_gorevler')
      .update({ durum: 'IPTAL', iptal_eden_id: meId, iptal_tarihi: new Date().toISOString(), islemi_yapan_id: meId, iptal_sebep: sebep })
      .eq('id', id)
    refreshLiveFlow()
  }

  async function handleKapat(id: string) {
    const ok = await confirm({
      title: 'Onay',
      message: 'Görevi "Zamanında Yapılamayan" olarak kapatmak istiyor musunuz?',
      confirmText: 'Evet',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return
    const nowIso = new Date().toISOString()
    await supabase.from('canli_gorevler').update({
      durum: 'ZAMANINDA_YAPILAMAYAN',
      durum_degisim_tarihi: nowIso,
      iptal_eden_id: meId,
      iptal_tarihi: nowIso,
      islemi_yapan_id: meId,
    }).eq('id', id)
    refreshLiveFlow()
  }

  async function handleZamanGecmis(id: string) {
    const ok = await confirm({
      title: 'Zamanı Geçmiş',
      message: 'Bu görevi "Zamanı Geçmiş" olarak işaretlemek istiyor musunuz?',
      confirmText: 'Evet',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return
    const nowIso = new Date().toISOString()
    await supabase.from('canli_gorevler').update({
      durum: 'ZAMANI_GECMIS',
      durum_degisim_tarihi: nowIso,
      iptal_eden_id: meId,
      iptal_tarihi: nowIso,
      islemi_yapan_id: meId,
    }).eq('id', id)
    refreshBrowse()
    refreshLiveFlow()
  }

  const TableRow = ({
    g,
    showOps,
    highlight,
    fontSize,
    showActor,
  }: {
    g: any
    showOps: boolean
    highlight?: boolean
    fontSize?: number
    showActor?: boolean
  }) => {
    const isSel = g.id === selectedId
    const fs = fontSize ? `${fontSize}px` : undefined
    const getIslemiYapan = () => {
      if (g.islemi_yapan?.isim_soyisim) return g.islemi_yapan.isim_soyisim
      // SA gibi farklı firma_id'li kullanıcılar join ile gelmez; elimizdeki bilgiyle fallback:
      if (g.islemi_yapan_id) {
        if (g.islemi_yapan_id === meId && meName) return meName
        const u = kullanicilar.find(k => k.id === g.islemi_yapan_id)
        if (u) return u.isim_soyisim
      }
      if (g.tamamlayan?.isim_soyisim) return g.tamamlayan.isim_soyisim
      if (g.tamamlayan_kullanici_id) {
        if (g.tamamlayan_kullanici_id === meId && meName) return meName
        const u = kullanicilar.find(k => k.id === g.tamamlayan_kullanici_id)
        if (u) return u.isim_soyisim
      }
      if (g.durum === 'IPTAL') return g.iptalEden?.isim_soyisim ?? '—'
      return g.olusturan?.isim_soyisim ?? '—'
    }
    // Highlight efekti — her td'ye direkt bg ver (tr bg bazı tarayıcılarda render olmuyor)
    const hlBg = highlight ? '#fde68a' : undefined
    const tdHL = { backgroundColor: hlBg, transition: 'background-color 0.8s ease-out' }
    return (
      <tr
        key={g.id}
        data-gid={g.id}
        data-highlight={highlight ? '1' : '0'}
        className={highlight ? 'row-new' : ''}
        onClick={() => {
          setSelectedId(g.id)
          setSelectedGorev(g)
        }}
        style={{
          cursor: 'pointer',
          backgroundColor: highlight ? '#fde68a' : (isSel ? '#f9fafb' : undefined),
          transition: 'background-color 0.8s ease-out',
          boxShadow: highlight ? 'inset 0 0 0 2px #f59e0b' : undefined,
        }}
      >
        <td style={{ fontWeight: 500, fontSize: fs, ...tdHL }}>{g.tanim}</td>
        <td style={{ color: '#4b5563', fontSize: fs, ...tdHL }}>{getLocPath(g.lokasyon_id, g.lokasyonlar?.tanim)}</td>
        {personelAtamaAktif && <td style={{ color: '#4b5563', fontSize: fs, ...tdHL }}>{g.atanan?.isim_soyisim ?? '—'}</td>}
        <td style={{ color: '#6b7280', whiteSpace: 'nowrap', fontSize: fs ?? '11.5px', ...tdHL }}>{formatDateTime(g.aktif_olma_tarihi)}</td>
        {/* İşlem Tarihi — son durum değişiminin tarihi */}
        <td style={{ color: '#6b7280', whiteSpace: 'nowrap', fontSize: fs ?? '11.5px', ...tdHL }}>{formatTarihTR(g.durum_degisim_tarihi ?? g.olusturma_tarihi ?? g.aktif_olma_tarihi)}</td>
        {/* İşlem Saatleri (proje ayarına bağlı) */}
        {islemSureleriAktif && (
          <td style={{ color: '#6b7280', whiteSpace: 'nowrap', fontSize: fs ?? '11.5px', ...tdHL }}>{formatIslemSaatleri(g.baslatilma_tarihi, g.tamamlanma_tarihi ?? g.durum_degisim_tarihi)}</td>
        )}
        {/* İşlem Süresi (proje ayarına bağlı) — ekstra görevde "Ekstra" badge */}
        {islemSureleriAktif && (
          <td style={{ color: '#6b7280', whiteSpace: 'nowrap', fontSize: fs ?? '11.5px', ...tdHL }}>
            {g.kural_id == null
              ? <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 6, background: '#ede9fe', color: '#7c3aed', fontWeight: 700, fontSize: 11 }}>Ekstra</span>
              : formatIslemSuresi(g.tamamlanma_suresi_saniye)
            }
          </td>
        )}
        <td style={{ fontSize: fs, ...tdHL }}>
          {g.durum === 'IPTAL' ? (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIptalDetay({ sebep: g.iptal_sebep, eden: g.iptalEden?.isim_soyisim ?? null, tarih: g.iptal_tarihi }) }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              title="İptal nedenini görüntüle"
            >
              <span style={{ fontSize: fs, cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 2 }} className={`verde-badge ${durumRenk[g.durum] ?? ''}`}>
                {CANLI_DURUM_LABEL[g.durum] ?? g.durum}
              </span>
            </button>
          ) : (
            <span style={{ fontSize: fs }} className={`verde-badge ${durumRenk[g.durum] ?? ''}`}>{CANLI_DURUM_LABEL[g.durum] ?? g.durum}</span>
          )}
        </td>
        {/* "İşlemi Yapan" sadece canlı akış tablosunda gösterilsin */}
        {showActor && (
          <td style={{ color: '#4b5563', fontSize: fs, ...tdHL }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: fs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{getIslemiYapan()}</span>

              {/* Çeklist butonu — her durumda, lokasyonda şablon varsa + proje ayarında aktifse */}
              {ceklistAktif && lokasyonlar.find((l: any) => l.id === g.lokasyon_id && (l as any).checklist_sablon_id) && (
                <button
                  onClick={(e) => { e.stopPropagation(); setChecklistGorev({ id: g.id, type: 'canli_gorevler' }) }}
                  style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#1d4ed8', flexShrink: 0 }}
                >
                  📋 Çeklist
                </button>
              )}

              {/* Yetkili kullanıcılar için butonlar aynı hücrede kalsın */}
              {showOps && !readonly && (
                <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                  {/* BEKLEMEDE: otomatik ZAMANI_GECMIS'e geçer, manuel işlem yapılamaz */}
                  {g.durum === 'ACIK' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleKapat(g.id)
                      }}
                      style={{
                        background: '#f9fafb',
                        border: '1px solid #fed7aa',
                        borderRadius: 4,
                        padding: '3px 8px',
                        cursor: 'pointer',
                        fontSize: 11,
                        color: '#c2610c',
                      }}
                    >
                      Kapat
                    </button>
                  )}
                  {/* SA: HAZIR/ACIK/BEKLEMEDE/ISLEMDE → Zamanı Geçmiş yapabilir */}
                  {isSA && ['HAZIR', 'ACIK', 'BEKLEMEDE', 'ISLEMDE'].includes(g.durum) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleZamanGecmis(g.id)
                      }}
                      style={{
                        background: '#fef2f2',
                        border: '1px solid #fca5a5',
                        borderRadius: 4,
                        padding: '3px 8px',
                        cursor: 'pointer',
                        fontSize: 11,
                        color: '#991b1b',
                      }}
                    >
                      Z. Geçmiş
                    </button>
                  )}
                  {['HAZIR', 'ACIK', 'ISLEMDE'].includes(g.durum) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleIptal(g.id)
                      }}
                      style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: 4,
                        padding: '3px 8px',
                        cursor: 'pointer',
                        fontSize: 11,
                        color: '#b91c1c',
                      }}
                    >
                      İptal
                    </button>
                  )}
                </div>
              )}
            </div>
          </td>
        )}
      </tr>
    )
  }

  // Vardiya özet kartları — readonly + interaktif iki render dalında da gösterilir.
  // Bugünün TR günü için aktif olmuş görevleri vardiyalara dağıtır.
  const vardiyaKartlari = vardiyaOzetleri.length > 0 ? (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${vardiyaOzetleri.length}, minmax(0,1fr))`,
      gap: 10, marginBottom: 12,
    }}>
      {vardiyaOzetleri.map(v => {
        const renk = v.basari >= 80 ? '#16a34a' : v.basari >= 50 ? '#d97706' : v.basari > 0 ? '#dc2626' : '#6b7280'
        return (
          <div key={v.no} style={{
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
            padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: '#111827', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.no}. Vardiya
                <span style={{ marginLeft: 6, fontSize: 12, color: '#6b7280', fontWeight: 500 }}>
                  {v.baslangic}-{v.bitis}
                </span>
              </div>
              <span style={{
                padding: '3px 10px', borderRadius: 999, fontSize: 13, fontWeight: 800, flexShrink: 0,
                background: `${renk}1a`, color: renk,
              }}>%{v.basari}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13 }}>
              <span style={{ color: '#374151' }}><strong>{v.toplam}</strong> Toplam</span>
              <span style={{ color: '#a3a3a3' }}>›</span>
              <span style={{ color: '#16a34a' }}><strong>{v.tamamlanan}</strong> Tamamlanan</span>
              <span style={{ color: '#a3a3a3' }}>›</span>
              <span style={{ color: '#d97706' }}><strong>{v.sapma}</strong> Sapma</span>
              <span style={{ color: '#a3a3a3' }}>›</span>
              <span style={{ color: '#dc2626' }} title="İptal + Beklemede + Zamanı Geçmiş"><strong>{v.kayip}</strong> Kayıp</span>
              <span style={{ marginLeft: 'auto', padding: '1px 8px', borderRadius: 999, fontSize: 10.5, fontWeight: 700, background: '#f1f5f9', color: '#64748b', letterSpacing: '0.02em', flexShrink: 0 }}>BUGÜN</span>
            </div>
          </div>
        )
      })}
    </div>
  ) : null

  // U / readonly için: canlı akış izleme (yeni tasarım)
  if (readonly) {
    return (
      <div style={{ padding: '24px 28px' }}>
        {vardiyaKartlari}
        {LiveHeader({ kpi, durumFilter, setDurumFilter, clock, streamState, setStreamState, pathname, readonly: true, showTumGorevler, canliAkisSureSaat })}
        <div className="verde-card" style={{ overflow: 'hidden', marginTop: 12 }}>
          <div className="verde-table-wrap">
            <table className="verde-table">
              <thead><tr>
                <th>Görev</th><th>Lokasyon</th>{personelAtamaAktif && <th>Atanan</th>}
                <th>Aktif Saat</th><th>İşlem Tarihi</th>{islemSureleriAktif && <th>İşlem Saatleri</th>}{islemSureleriAktif && <th>İşlem Süresi</th>}<th>Durum</th><th>İşlemi Yapan</th>
              </tr></thead>
              <tbody>
                {filtreLiveSayfa.map((g: any) => (
                  <TableRow key={g.id} g={g} showOps={false} showActor={true} highlight={g.id === highlightId} fontSize={14} />
                ))}
                {!filteredLive.length && (
                  <tr><td colSpan={(personelAtamaAktif ? 9 : 8) - (islemSureleriAktif ? 0 : 2)} style={{ textAlign: 'center', color: '#6b7280', padding: '28px 0', fontSize: 14 }}>
                    {durumFilter === 'TÜMÜ' ? 'Aktif frekansiyel görev yok' : 'Bu filtrede görev yok'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <LiveSayfalama total={filteredLive.length} sayfa={liveSayfa} toplam={liveToplamSayfa} onSayfa={setLiveSayfa} perPage={LIVE_PER_PAGE} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 28px' }}>

      {/* ── VARDİYA BAZLI BUGÜNKÜ ÖZET ── */}
      {vardiyaKartlari}

      {/* ── YENİ HEADER + KPI ── */}
      {LiveHeader({ kpi, durumFilter, setDurumFilter, clock, streamState, setStreamState, pathname, readonly: false, showTumGorevler, canliAkisSureSaat })}

      {/* ── GÖREV TABLOSU ── */}
      <div className="verde-card" style={{ overflow: 'hidden', marginBottom: 16, marginTop: 12 }}>
        <div style={{ maxHeight: 'calc(100vh - 300px)', overflow: 'auto' }} className="verde-table-wrap">
          <table className="verde-table">
            <thead><tr>
              <th>Görev</th><th>Lokasyon</th>{personelAtamaAktif && <th>Atanan</th>}
              <th>Aktif Saat</th><th>İşlem Tarihi</th>{islemSureleriAktif && <th>İşlem Saatleri</th>}{islemSureleriAktif && <th>İşlem Süresi</th>}<th>Durum</th><th>İşlemi Yapan</th>
            </tr></thead>
            <tbody>
              {filtreLiveSayfa.map((g: any) => (
                <TableRow key={g.id} g={g} showOps={false} showActor fontSize={14} />
              ))}
              {!filteredLive.length && (
                <tr><td colSpan={(personelAtamaAktif ? 9 : 8) - (islemSureleriAktif ? 0 : 2)} style={{ textAlign: 'center', color: '#6b7280', padding: '22px 0', fontSize: 14 }}>
                  {durumFilter === 'TÜMÜ' ? 'Liste boş' : 'Bu filtrede görev yok'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        <LiveSayfalama total={filteredLive.length} sayfa={liveSayfa} toplam={liveToplamSayfa} onSayfa={setLiveSayfa} perPage={LIVE_PER_PAGE} />
      </div>

      {checklistGorev && (
        <ChecklistModal
          taskId={checklistGorev.id}
          taskType={checklistGorev.type}
          onKapat={() => setChecklistGorev(null)}
        />
      )}

      {iptalDetay && (() => {
        const sebep = (iptalDetay.sebep ?? '').trim()
        const otomatik = sebep.startsWith('Otomatik iptal')
        const tip = otomatik ? '🤖 Otomatik İptal' : '👤 Manuel İptal'
        const tipRenk = otomatik ? '#0369a1' : '#92400e'
        const tipBg = otomatik ? '#e0f2fe' : '#fef3c7'
        return (
          <div onClick={() => setIptalDetay(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: '#fff', borderRadius: 12, padding: '20px 22px', maxWidth: 440, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 800, background: tipBg, color: tipRenk }}>{tip}</span>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>İptal Sebebi</div>
              <div style={{ padding: '12px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13.5, color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 14 }}>
                {sebep || 'Sebep belirtilmemiş'}
              </div>
              {iptalDetay.eden && (
                <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 4 }}>
                  <strong style={{ color: '#1f2937' }}>İptal Eden:</strong> {iptalDetay.eden}
                </div>
              )}
              {iptalDetay.tarih && (
                <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 14 }}>
                  <strong style={{ color: '#1f2937' }}>Tarih:</strong> {formatDateTime(iptalDetay.tarih)}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => setIptalDetay(null)}
                  style={{ height: 34, padding: '0 16px', borderRadius: 8, border: 'none', background: '#1f2937', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  Kapat
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function LiveSayfalama({ total, sayfa, toplam, onSayfa, perPage }: {
  total: number; sayfa: number; toplam: number; onSayfa: (n: number) => void; perPage: number
}) {
  if (total <= perPage) return null
  const ilk = (sayfa - 1) * perPage + 1
  const son = Math.min(sayfa * perPage, total)
  const btnBase: React.CSSProperties = { padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #f1f5f9', background: '#fafafa' }}>
      <span style={{ fontSize: 12.5, color: '#64748b' }}>
        <strong style={{ color: '#111827' }}>{ilk}-{son}</strong> / {total} kayıt · Sayfa {sayfa}/{toplam}
      </span>
      <div style={{ display: 'flex', gap: 4 }}>
        <button onClick={() => onSayfa(1)} disabled={sayfa === 1}
          style={{ ...btnBase, opacity: sayfa === 1 ? 0.4 : 1 }}>{'<<'}</button>
        <button onClick={() => onSayfa(Math.max(1, sayfa - 1))} disabled={sayfa === 1}
          style={{ ...btnBase, opacity: sayfa === 1 ? 0.4 : 1 }}>{'<'}</button>
        <span style={{ ...btnBase, background: '#f1f5f9', cursor: 'default' }}>{sayfa} / {toplam}</span>
        <button onClick={() => onSayfa(Math.min(toplam, sayfa + 1))} disabled={sayfa === toplam}
          style={{ ...btnBase, opacity: sayfa === toplam ? 0.4 : 1 }}>{'>'}</button>
        <button onClick={() => onSayfa(toplam)} disabled={sayfa === toplam}
          style={{ ...btnBase, opacity: sayfa === toplam ? 0.4 : 1 }}>{'>>'}</button>
      </div>
    </div>
  )
}
