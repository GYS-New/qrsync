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
  readonly: boolean
  projeId?: string | null
  showTumGorevler?: boolean  // false yapılırsa "Tüm Görevler" linki gizlenir
  yetkiliLokIds?: string[] | null
  canliAkisSureSaat?: number  // canlı akış listeleme süresi (varsayılan 8)
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
            Son {canliAkisSureSaat} saat
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
        @keyframes rowGlow { 0%{background:#fef9c3} 100%{background:transparent} }
        .row-new { animation: rowGlow 5s ease-out forwards; }
      `}</style>
    </div>
  )
}

export default function CanliIslemlerClient({ firmaId, lokasyonlar, kullanicilar, initialGorevler, meId, readonly, projeId, showTumGorevler = true, yetkiliLokIds, canliAkisSureSaat = 8 }: Props) {
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
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const lastTopIdRef = useRef<string | null>(null)
  const [checklistGorev, setChecklistGorev] = useState<{ id: string; type: 'canli_gorevler' } | null>(null)
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

  async function refreshBrowse() {
    if (!firmaId) return

    const sinceISO = new Date(Date.now() - canliAkisSureSaat * 60 * 60 * 1000).toISOString()
    let q = supabase
      .from('canli_gorevler')
      .select('*,lokasyonlar(tanim),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim),olusturan:users!olusturan_id(isim_soyisim),tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim),iptalEden:users!iptal_eden_id(isim_soyisim)')
      .eq('firma_id', firmaId)
      .gte('durum_degisim_tarihi', sinceISO)
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

    const liveSinceISO = new Date(Date.now() - canliAkisSureSaat * 60 * 60 * 1000).toISOString()
    let liveQ = supabase
      .from('canli_gorevler')
      .select(liveSelect)
      .eq('firma_id', firmaId)
      .not('durum', 'in', '(HAZIR,ACIK)')
      .gte('durum_degisim_tarihi', liveSinceISO)
      .order('durum_degisim_tarihi', { ascending: false })
      .limit(500)

    if (projeId) liveQ = (liveQ as any).or(`proje_id.eq.${projeId},proje_id.is.null`)
    if (yetkiliLokIds) liveQ = liveQ.in('lokasyon_id', yetkiliLokIds)

    const res = await liveQ

    if (res.error) {
      // durum_degisim_tarihi kolonu yoksa olusturma_tarihi ile fallback
      let fallbackQ = supabase
        .from('canli_gorevler')
        .select(liveSelect)
        .eq('firma_id', firmaId)
        .not('durum', 'in', '(HAZIR,ACIK)')
        .gte('durum_degisim_tarihi', liveSinceISO)
        .order('durum_degisim_tarihi', { ascending: false })
        .limit(500)
      if (yetkiliLokIds) fallbackQ = fallbackQ.in('lokasyon_id', yetkiliLokIds)

      const res2 = projeId
        ? await (fallbackQ as any).or(`proje_id.eq.${projeId},proje_id.is.null`)
        : await fallbackQ

      if (res2.error) {
        console.error('LiveFlow fetch error:', res2.error)
        return
      }

      const data = res2.data
      if (data) setLiveFlowGorevler(data)
      return
    }

    const data = res.data
    if (data) {
      // Yeni gelen görev (en üst) 3-4 sn vurgulansın
      const prevTopId = liveFlowGorevler?.[0]?.id
      const nextTopId = data?.[0]?.id
      if (nextTopId && nextTopId !== prevTopId) {
        setHighlightId(nextTopId)
        setTimeout(() => setHighlightId((cur) => (cur === nextTopId ? null : cur)), 5000)
      }
      setLiveFlowGorevler(data)
    }
  }

  const selected = useMemo(() => {
    if (!selectedId) return null
    if (selectedGorev?.id === selectedId) return selectedGorev
    return browseGorevler.find((g) => g.id === selectedId) ?? null
  }, [browseGorevler, selectedGorev, selectedId])


  // KPI sayaçları
  const kpi = useMemo(() => ({
    toplam:     liveFlowGorevler.length,
    tamamlandi: liveFlowGorevler.filter((g:any) => g.durum === 'TAMAMLANDI').length,
    islemde:    liveFlowGorevler.filter((g:any) => g.durum === 'ISLEMDE').length,
    beklemede:  liveFlowGorevler.filter((g:any) => g.durum === 'BEKLEMEDE').length,
    iptal:      liveFlowGorevler.filter((g:any) => g.durum === 'IPTAL').length,
    gecikmis:   liveFlowGorevler.filter((g:any) => g.durum === 'ZAMANINDA_YAPILAMAYAN').length,
    gecmis:     liveFlowGorevler.filter((g:any) => g.durum === 'ZAMANI_GECMIS').length,
  }), [liveFlowGorevler])

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
    const ok = await confirm({
      title: 'İptal Onayı',
      message: 'Bu görevi iptal etmek istediğinizden emin misiniz?',
      confirmText: 'İptal Et',
      cancelText: 'Vazgeç',
      variant: 'danger',
    })
    if (!ok) return
    await supabase
      .from('canli_gorevler')
      .update({ durum: 'IPTAL', iptal_eden_id: meId, iptal_tarihi: new Date().toISOString(), islemi_yapan_id: meId })
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
      if (g.durum === 'TAMAMLANDI') return g.tamamlayan?.isim_soyisim ?? '—'
      if (g.durum === 'IPTAL') return g.iptalEden?.isim_soyisim ?? '—'
      return g.olusturan?.isim_soyisim ?? '—'
    }
    return (
      <tr
        key={g.id}
        onClick={() => {
          setSelectedId(g.id)
          setSelectedGorev(g)
        }}
        className={highlight ? 'row-new' : ''}
        style={{ cursor: 'pointer', background: isSel ? '#f9fafb' : undefined }}
      >
        <td style={{ fontWeight: 500, fontSize: fs }}>{g.tanim}</td>
        <td style={{ color: '#4b5563', fontSize: fs }}>{getLocPath(g.lokasyon_id, g.lokasyonlar?.tanim)}</td>
        <td style={{ color: '#4b5563', fontSize: fs }}>{g.atanan?.isim_soyisim ?? '—'}</td>
        <td style={{ color: '#6b7280', whiteSpace: 'nowrap', fontSize: fs ?? '11.5px' }}>{formatDateTime(g.aktif_olma_tarihi)}</td>
        <td style={{ color: '#6b7280', whiteSpace: 'nowrap', fontSize: fs ?? '11.5px' }}>{formatDateTime(g.durum_degisim_tarihi ?? g.olusturma_tarihi ?? g.aktif_olma_tarihi)}</td>
        <td style={{ fontSize: fs }}>
          <span style={{ fontSize: fs }} className={`verde-badge ${durumRenk[g.durum] ?? ''}`}>{CANLI_DURUM_LABEL[g.durum] ?? g.durum}</span>
        </td>
        {/* "İşlemi Yapan" sadece canlı akış tablosunda gösterilsin */}
        {showActor && (
          <td style={{ color: '#4b5563', fontSize: fs }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: fs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{getIslemiYapan()}</span>

              {/* Çeklist butonu — her durumda, lokasyonda şablon varsa */}
              {lokasyonlar.find((l: any) => l.id === g.lokasyon_id && (l as any).checklist_sablon_id) && (
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

  // U / readonly için: canlı akış izleme (yeni tasarım)
  if (readonly) {
    return (
      <div style={{ padding: '24px 28px' }}>
        {LiveHeader({ kpi, durumFilter, setDurumFilter, clock, streamState, setStreamState, pathname, readonly: true, showTumGorevler, canliAkisSureSaat })}
        <div className="verde-card" style={{ overflow: 'hidden', marginTop: 12 }}>
          <div className="verde-table-wrap">
            <table className="verde-table">
              <thead><tr>
                <th>Görev</th><th>Lokasyon</th><th>Atanan</th>
                <th>Aktif Saat</th><th>İŞLEM TARİH-SAAT</th><th>Durum</th><th>İşlemi Yapan</th>
              </tr></thead>
              <tbody>
                {filteredLive.map((g: any) => (
                  <TableRow key={g.id} g={g} showOps={false} showActor={true} highlight={g.id === highlightId} fontSize={14} />
                ))}
                {!filteredLive.length && (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: '#6b7280', padding: '28px 0', fontSize: 14 }}>
                    {durumFilter === 'TÜMÜ' ? 'Aktif frekansiyel görev yok' : 'Bu filtrede görev yok'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 28px' }}>

      {/* ── YENİ HEADER + KPI ── */}
      {LiveHeader({ kpi, durumFilter, setDurumFilter, clock, streamState, setStreamState, pathname, readonly: false, showTumGorevler, canliAkisSureSaat })}

      {/* ── GÖREV TABLOSU ── */}
      <div className="verde-card" style={{ overflow: 'hidden', marginBottom: 16, marginTop: 12 }}>
        <div style={{ maxHeight: 'calc(100vh - 300px)', overflow: 'auto' }} className="verde-table-wrap">
          <table className="verde-table">
            <thead><tr>
              <th>Görev</th><th>Lokasyon</th><th>Atanan</th>
              <th>Aktif Saat</th><th>İŞLEM TARİH-SAAT</th><th>Durum</th><th>İşlemi Yapan</th>
            </tr></thead>
            <tbody>
              {filteredLive.map((g: any) => (
                <TableRow key={g.id} g={g} showOps={false} showActor fontSize={14} />
              ))}
              {!filteredLive.length && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#6b7280', padding: '22px 0', fontSize: 14 }}>
                  {durumFilter === 'TÜMÜ' ? 'Liste boş' : 'Bu filtrede görev yok'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {checklistGorev && (
        <ChecklistModal
          taskId={checklistGorev.id}
          taskType={checklistGorev.type}
          onKapat={() => setChecklistGorev(null)}
        />
      )}
    </div>
  )
}