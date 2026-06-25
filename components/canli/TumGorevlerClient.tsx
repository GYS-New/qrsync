'use client'

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime, CANLI_DURUM_LABEL } from '@/lib/utils'
import { resolveLiveCompletionStatusByTask } from '@/lib/tasks/liveStatus'
import Button from '@/components/ui/Button'
import { Download, FileSpreadsheet, Pencil, RefreshCw, Trash2, Upload } from 'lucide-react'
import { useToast } from '@/components/ui/ToastProvider'
import { useLicenseExpired } from '@/components/hooks/useLicense'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { IMPORT_EXPORT_BUTTON_STYLE } from '@/lib/import-export/constants'
import ChecklistModal from '@/components/checklist/ChecklistModal'
import { useYetki } from '@/lib/yetki/useYetki'
import { KanalBadge } from '@/components/shared/KanalBadge'
import { suankiVardiyaGunu } from '@/lib/gorev/vardiyaGunu'
import { getEffectiveVardiya } from '@/lib/vardiya/getEffective'

type SortKey = 'grup' | 'tanim' | 'lokasyon' | 'atanan' | 'aktif' | 'islem' | 'durum' | 'actor'


function toDateTimeLocalValue(d: Date) {
  // datetime-local input Türkiye saatini bekler — Europe/Istanbul üzerinden üret
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00'
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}
const DURUM_RENK: Record<string, string> = {
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

function getIslemiYapan(g: any, ctx?: { meId?: string; meName?: string; kullanicilar?: { id: string; isim_soyisim: string }[] }) {
  if (g.islemi_yapan?.isim_soyisim) return g.islemi_yapan.isim_soyisim
  // SA gibi farklı firma_id'li kullanıcılar join ile gelmez; id + isim eşleştirmesi ile fallback
  const lookup = (id: string | null | undefined) => {
    if (!id) return null
    if (ctx?.meId && id === ctx.meId && ctx.meName) return ctx.meName
    const u = ctx?.kullanicilar?.find(k => k.id === id)
    return u?.isim_soyisim ?? null
  }
  const byId = lookup(g.islemi_yapan_id)
  if (byId) return byId
  if (['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN'].includes(g.durum)) {
    return g.tamamlayan?.isim_soyisim ?? lookup(g.tamamlayan_kullanici_id) ?? '—'
  }
  if (g.durum === 'IPTAL') return g.iptalEden?.isim_soyisim ?? lookup(g.iptal_eden_id) ?? '—'
  if (['BEKLEMEDE', 'ZAMANI_GECMIS', 'KAPATILDI', 'SILINDI'].includes(g.durum)) {
    return g.iptalEden?.isim_soyisim ?? lookup(g.iptal_eden_id) ?? g.olusturan?.isim_soyisim ?? '—'
  }
  return g.olusturan?.isim_soyisim ?? '—'
}

export default function TumGorevlerClient({
  base,
  firmaId,
  meId,
  meName,
  readonly,
  lokasyonlar,
  kullanicilar,
  initialGorevler,
  projeId,
  personelAtamaAktif = true,
  ceklistAktif = true,
  islemSureleriAktif = true,
  yetkiliLokIds,
}: {
  base: '/sa' | '/ta' | '/u'
  firmaId: string
  meId: string
  meName?: string
  readonly: boolean
  lokasyonlar: { id: string; tanim: string; parent_id?: string | null; checklist_sablon_id?: string | null }[]
  kullanicilar: { id: string; isim_soyisim: string }[]
  initialGorevler: any[]
  projeId?: string | null
  personelAtamaAktif?: boolean
  ceklistAktif?: boolean
  islemSureleriAktif?: boolean
  yetkiliLokIds?: string[] | null
}) {
  const yetki = useYetki('tum-gorevler')
  const isTA = base === '/ta'
  const isU = base === '/u'
  const [sekme, setSekme] = useState<'gorevler' | 'kurallar'>('gorevler')
  // Sistem tarafından yönetilen durumlar (TA bu durumlara manuel geçiş yapamaz)
  const SYSTEM_STATUSES = ['HAZIR', 'ACIK', 'BEKLEMEDE', 'ISLEMDE', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS']
  // TA'nın seçebileceği hedef durumlar
  const TA_ALLOWED_TARGET_STATUSES = ['TAMAMLANDI', 'IPTAL', 'KAPATILDI', 'SILINDI']
  const supabase = createClient()
  const { toast } = useToast()
  const { expired: licenseExpired, loading: licenseLoading } = useLicenseExpired(firmaId)
  const { confirm, confirmChoice } = useConfirm()
  const importInputRef = useRef<HTMLInputElement | null>(null)

  async function downloadExcel(kind: 'template' | 'export') {
    try {
      const query = firmaId ? `?firmaId=${encodeURIComponent(firmaId)}` : ''
      const res = await fetch(`/api/import-export/live-tasks/${kind}${query}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Dosya indirilemedi')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = kind === 'template' ? 'canli-gorev-import-sablonu.xlsx' : 'canli-gorevler.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      toast({ type: 'error', title: 'İşlem başarısız', message: e.message })
    }
  }

  async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (firmaId) fd.append('firmaId', firmaId)
      const res = await fetch('/api/import-export/live-tasks/import', { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'İmport başarısız')
      await refresh()
      const extra = j.errors?.length ? ` Hata: ${j.errors.slice(0, 3).join(' | ')}` : ''
      toast({ type: 'success', title: 'Başarılı', message: `${j.created} görev içe aktarıldı.${extra}` })
    } catch (err: any) {
      toast({ type: 'error', title: 'İşlem başarısız', message: err.message })
    }
    e.target.value = ''
    setSaving(false)
  }
const [locMap, setLocMap] = useState<Record<string, { tanim: string; parent_id: string | null }>>({})

  // Lokasyon seçimi (Üst / Alt / Alt-alt) - popup içi
  const [loc1, setLoc1] = useState('')
  const [loc2, setLoc2] = useState('')
  const [loc3, setLoc3] = useState('')

  const allLocs = useMemo(() => {
    return Object.entries(locMap).map(([id, v]) => ({ id, tanim: v.tanim, parent_id: v.parent_id }))
  }, [locMap])

  const rootLocs = useMemo(() => {
    return allLocs
      .filter((l) => !l.parent_id)
      .slice()
      .sort((a, b) => (a.tanim ?? '').localeCompare(b.tanim ?? ''))
  }, [allLocs])

  const childLocs = useMemo(() => {
    if (!loc1) return []
    return allLocs
      .filter((l) => l.parent_id === loc1)
      .slice()
      .sort((a, b) => (a.tanim ?? '').localeCompare(b.tanim ?? ''))
  }, [allLocs, loc1])

  const grandLocs = useMemo(() => {
    if (!loc2) return []
    return allLocs
      .filter((l) => l.parent_id === loc2)
      .slice()
      .sort((a, b) => (a.tanim ?? '').localeCompare(b.tanim ?? ''))
  }, [allLocs, loc2])

  function deriveChain(id: string): { l1: string; l2: string; l3: string } {
    if (!id) return { l1: '', l2: '', l3: '' }
    const chain: string[] = []
    let cur: string | null = id
    let guard = 0
    while (cur && guard < 5) {
      chain.push(cur)
      cur = locMap[cur]?.parent_id ?? null
      guard++
    }
    chain.reverse()
    if (chain.length === 1) return { l1: chain[0], l2: '', l3: '' }
    if (chain.length === 2) return { l1: chain[0], l2: chain[1], l3: '' }
    return { l1: chain[0], l2: chain[1], l3: chain[2] }
  }

const getLocParts = useMemo(() => {
  return (lokasyonId: string | null | undefined, fallbackName?: string | null): string[] => {
    if (!lokasyonId) return fallbackName ? [fallbackName] : []
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
    return parts.reverse()
  }
}, [locMap])

const getLocUstAlt = (lokasyonId: string | null | undefined, fallbackName?: string | null) => {
  const parts = getLocParts(lokasyonId, fallbackName)
  if (parts.length === 0) return { ust: '—', alt: fallbackName ?? '—' }
  if (parts.length === 1) return { ust: '—', alt: parts[0] }
  return { ust: parts.slice(0, -1).join(' / '), alt: parts[parts.length - 1] }
}



  const [gorevler, setGorevler] = useState<any[]>(initialGorevler ?? [])
  const [vardiyaAyari, setVardiyaAyari] = useState<{ no: number; baslangic: string; bitis: string }[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checklistGorev, setChecklistGorev] = useState<{ id: string; type: 'canli_gorevler'; duzenleme?: boolean } | null>(null)
  // İptal nedeni popup'ı için state
  const [iptalDetay, setIptalDetay] = useState<{ sebep?: string | null; eden?: string | null; tarih?: string | null } | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDuzenleMode, setBulkDuzenleMode] = useState(false)
  const [bulkDuzenlePopup, setBulkDuzenlePopup] = useState(false)
  const [bulkDuzenleDurum, setBulkDuzenleDurum] = useState('')
  const [bulkDuzenleIds, setBulkDuzenleIds] = useState<Set<string>>(new Set())
  const [bulkDuzenleUyari, setBulkDuzenleUyari] = useState<string[]>([])
  const [bulkIptalSebep, setBulkIptalSebep] = useState('')  // Web bulk IPTAL'de zorunlu sebep
  const [editIptalSebep, setEditIptalSebep] = useState('')  // Edit modal IPTAL'de zorunlu sebep
  const selected = useMemo(() => gorevler.find((g: any) => g.id === selectedId) ?? null, [gorevler, selectedId])

  const [modal, setModal] = useState<null | 'create' | 'edit'>(null)
  const [saving, setSaving] = useState(false)
  const emptyForm = { tanim: '', lokasyon_id: '', atanan_kullanici_id: '', aktif_olma_tarihi: '', durum: 'HAZIR' }
  const [form, setForm] = useState<any>(emptyForm)


  const liveSelect =
    '*,lokasyonlar(tanim),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim),olusturan:users!olusturan_id(isim_soyisim),tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim),iptalEden:users!iptal_eden_id(isim_soyisim)'

  async function refresh() {
    try {
      await fetch('/api/canli-gorevler/check', { cache: 'no-store' }).catch(() => null)

      const durumlar = isTA
        ? ['HAZIR','ACIK', 'BEKLEMEDE', 'ISLEMDE', 'TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS', 'IPTAL', 'KAPATILDI']
        : ['HAZIR','ACIK', 'BEKLEMEDE', 'ISLEMDE', 'TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS', 'IPTAL', 'KAPATILDI', 'SILINDI']

      let q = supabase
        .from('canli_gorevler')
        .select(liveSelect)
        .eq('firma_id', firmaId)
        .in('durum', durumlar)
        .order('aktif_olma_tarihi', { ascending: false })
        .limit(2000)
      if (projeId) q = (q as any).or(`proje_id.eq.${projeId},proje_id.is.null`)
      const { data, error } = await q

      // Hata varsa veya data null ise mevcut listeyi ezme
      if (error || !data) {
        console.error('refresh error', error)
        return
      }

      const result = data.sort((a: any, b: any) =>
        new Date(b.aktif_olma_tarihi).getTime() - new Date(a.aktif_olma_tarihi).getTime()
      )
      // Boş sonuç gelirse mevcut listeyi koruma (RLS/geçici hata durumu)
      if (result.length > 0) setGorevler(result)
    } catch (e) {
      console.error('refresh error', e)
    }
  }

  useEffect(() => {
  let alive = true
  async function loadLocs() {
    if (!firmaId) return
    let q = supabase
      .from('lokasyonlar')
      .select('id,tanim,parent_id,oto_yikama_lokasyon')
      .eq('firma_id', firmaId)
      .eq('aktif', true)
    // Proje seçiliyse sadece o projenin lokasyonlarını göster
    if (projeId) q = (q as any).eq('proje_id', projeId)

    const { data, error } = await q

    if (error) {
      console.error('Lokasyonlar yüklenemedi', error)
      return
    }
    if (!alive) return
    // Modül izolasyonu: Oto Yıkama lokasyonlarını çıkar
    const { filterOutOtoYikama } = await import('@/lib/yetki/clientOtoYikamaFilter')
    const filtreliLok = filterOutOtoYikama((data ?? []) as any)
    const map: Record<string, { tanim: string; parent_id: string | null }> = {}
    filtreliLok.forEach((l: any) => {
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

// Efektif vardiya ayarları — proje override > firma fallback (mig 094)
useEffect(() => {
  if (!firmaId) return
  let alive = true
  ;(async () => {
    const ev = await getEffectiveVardiya(supabase as any, firmaId, projeId ?? null)
    if (!alive) return
    const sayisi = ev.vardiya_sayisi ?? 3
    const set = ((ev.tum_vardiya_ayarlari ?? {})[String(sayisi)] ?? []) as { no: number; baslangic: string; bitis: string }[]
    setVardiyaAyari(Array.isArray(set) ? set : [])
  })()
  return () => { alive = false }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [firmaId, projeId])

useEffect(() => {
    // Mount'ta sadece HAZIR→ACIK geçiş check'ini tetikle, listeyi SSR'den gelen
    // initialGorevler ile başlat. Boş dönme riskli client fetch'i mount'ta yapma.
    fetch('/api/canli-gorevler/check', { cache: 'no-store' }).catch(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId])

  
  function toggleBulk(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

function openCreate() {
    setForm({ ...emptyForm, durum: 'HAZIR' })
    setLoc1(''); setLoc2(''); setLoc3('')
    setEditIptalSebep('')
    setModal('create')
  }

  function openEdit() {
    if (!selected) return
    if (selected.durum === 'ZAMANI_GECMIS') {
      toast({ type: 'error', title: 'İşlem Yapılamaz', message: 'Zamanı geçmiş görevler düzenlenemez.' })
      return
    }
    setEditIptalSebep(selected.iptal_sebep ?? '')
    const c = deriveChain(selected.lokasyon_id ?? '')
    setForm({
      tanim: selected.tanim ?? '',
      lokasyon_id: selected.lokasyon_id ?? '',
      atanan_kullanici_id: selected.atanan_kullanici_id ?? '',
      aktif_olma_tarihi: selected.aktif_olma_tarihi ? toDateTimeLocalValue(new Date(selected.aktif_olma_tarihi)) : '',
      durum: selected.durum ?? 'HAZIR',
    })
    setLoc1(c.l1); setLoc2(c.l2); setLoc3(c.l3)
    setModal('edit')
  }

  async function save() {
    setSaving(true)
    try {
      if (!form.tanim?.trim()) {
        toast({ type: 'error', title: 'Eksik bilgi', message: 'Görev tanımı zorunludur.' })
        setSaving(false)
        return
      }
      if (!loc1) {
        toast({ type: 'error', title: 'Eksik bilgi', message: 'Lokasyon seçimi zorunludur.' })
        setSaving(false)
        return
      }

      const nowIso = new Date().toISOString()

      const nowMs = Date.now()

      const aktifInput =
        form.aktif_olma_tarihi ||
        (modal === 'edit' && selected ? toDateTimeLocalValue(new Date(selected.aktif_olma_tarihi)) : '')

      const aktifDate = aktifInput ? new Date(aktifInput) : new Date()
      const aktifIso = aktifDate.toISOString()


      // Yeni görev geri tarihli oluşturulamaz.
      if (modal === 'create' && aktifDate.getTime() < nowMs) {
        toast({ type: 'error', title: 'Geçersiz tarih', message: 'Aktif olma tarihi geçmiş bir tarih olamaz.' })
        setSaving(false)
        return
      }

      const payload: any = {
        tanim: form.tanim.trim(),
        lokasyon_id: form.lokasyon_id || loc1 || null,
        atanan_kullanici_id: form.atanan_kullanici_id || null,
        aktif_olma_tarihi: aktifIso ?? nowIso,
        durum: modal === 'create' ? 'HAZIR' : form.durum,
        durum_degisim_tarihi: nowIso,
        islemi_yapan_id: meId,
      }

      // TA ve U durum kısıtı:
      // - Sistem durumlarına (HAZIR/ACIK/BEKLEMEDE/ZAMANI_GECMIS) manuel geçiş yapamaz.
      // - Yalnızca TAMAMLANDI / IPTAL / KAPATILDI / SILINDI hedeflerini seçebilir.
      // - HAZIR durumundaki görev TAMAMLANDI yapılamaz (önce ACIK olmalı).
      if (modal === 'edit' && selected && (isTA || isU)) {
        const nextDurum = payload.durum
        if (nextDurum === selected.durum) {
          // ok - değişmiyorsa izin ver
        } else if (SYSTEM_STATUSES.includes(nextDurum)) {
          toast({ type: 'error', title: 'Yetki kısıtı', message: 'Bu durum sistem tarafından yönetilir ve manuel seçilemez.' })
          setSaving(false)
          return
        } else if (!TA_ALLOWED_TARGET_STATUSES.includes(nextDurum)) {
          toast({ type: 'error', title: 'Yetki kısıtı', message: 'Bu durum seçilemez.' })
          setSaving(false)
          return
        } else if (nextDurum === 'TAMAMLANDI' && selected.durum === 'HAZIR') {
          toast({ type: 'error', title: 'İşlem Yapılamaz', message: '"Hazır" durumundaki görev tamamlandı olarak işaretlenemez. Görevin önce açılması gerekiyor.' })
          setSaving(false)
          return
        }
      }

      // U: tanim, lokasyon ve tarih değiştiremez — payload'dan çıkar
      if (modal === 'edit' && selected && isU) {
        delete payload.tanim
        delete payload.lokasyon_id
        delete payload.aktif_olma_tarihi
      }

      // Web üzerinden durum değiştiyse "işlemi yapan" olarak kullanıcıyı yaz
      if (modal === 'edit' && selected && form.durum !== selected.durum) {
        // ZAMANI_GECMIS görevler hiçbir şekilde işlenemez
        if (selected.durum === 'ZAMANI_GECMIS') {
          toast({ type: 'error', title: 'İşlem Yapılamaz', message: 'Zamanı geçmiş görevlerde durum değiştirilemez.' })
          setSaving(false)
          return
        }
        if (form.durum === 'TAMAMLANDI') {
          if ((selected as any)?.durum === 'ZAMANI_GECMIS') {
            toast({ type: 'error', title: 'İşlem yapılamaz', message: 'Zamanı geçmiş görevlerde işlem yapılamaz.' })
            setSaving(false)
            return
          }
          payload.durum = resolveLiveCompletionStatusByTask(selected as any, nowIso)
          if (payload.durum === 'ZAMANI_GECMIS') {
            toast({ type: 'error', title: 'İşlem yapılamaz', message: 'Zamanı geçmiş görevlerde işlem yapılamaz.' })
            setSaving(false)
            return
          }
          payload.tamamlayan_kullanici_id = meId
          payload.tamamlanma_tarihi = nowIso
        } else if (['IPTAL', 'KAPATILDI', 'SILINDI'].includes(form.durum)) {
          payload.iptal_eden_id = meId
          payload.iptal_tarihi = nowIso
          // IPTAL'de sebep zorunlu (web tarafı)
          if (form.durum === 'IPTAL') {
            const sebep = editIptalSebep.trim()
            if (sebep.length < 3) {
              toast({ type: 'error', title: 'İptal Sebebi Eksik', message: 'Lütfen en az 3 karakter iptal sebebi girin.' })
              setSaving(false)
              return
            }
            payload.iptal_sebep = sebep
          }
        } else {
          // Diğer durumlar (BEKLEMEDE, ZAMANINDA_YAPILAMAYAN, KAPATILDI, SILINDI, ZAMANI_GECMIS vs.)
          // Şimdilik iptal_eden_id alanını "işlemi yapan" olarak kullanıyoruz (mobil taraf ayrı ele alınacak)
          payload.iptal_eden_id = meId
        }
      }

      if (modal === 'create') {
        if (licenseExpired) {
          toast({ type: 'error', title: 'Lisans Süresi Doldu', message: 'Lisans süreniz dolduğundan yeni görev oluşturulamaz.' })
          setSaving(false)
          return
        }

          // Tekil görev ekle
          const { data: insData, error: insErr } = await supabase
            .from('canli_gorevler')
            .insert({ ...payload, firma_id: firmaId, olusturan_id: meId, islemi_yapan_id: meId, ...(projeId ? { proje_id: projeId } : {}) })
            .select('id')
          if (insErr) throw insErr
          if (!insData?.length) throw new Error('Görev eklenemedi (yetki/politika engeli olabilir).')
          toast({ type: 'success', title: 'Başarılı', message: 'Görev eklendi' })
      } else if (modal === 'edit' && selected) {
        const { data: updData, error: updErr } = await supabase
          .from('canli_gorevler')
          .update(payload)
          .eq('id', selected.id)
          .eq('firma_id', firmaId)
          .select('id')
        if (updErr) throw updErr
        if (!updData?.length) throw new Error('Güncelleme uygulanmadı (yetki/politika engeli olabilir).')
        toast({ type: 'success', title: 'Başarılı', message: 'Görev güncellendi' })
      }

      setModal(null)
      await refresh()
    } catch (e: any) {
      toast({ type: 'error', title: 'İşlem başarısız', message: e?.message ?? 'Hata' })
    }
    setSaving(false)
  }


  // Toplu düzenle için checkbox açılabilir durumlar (terminal olanlar dışında)
  const BULK_DUZENLE_EXCLUDED = ['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS', 'SILINDI']
  function canBulkDuzenle(g: any) {
    return !BULK_DUZENLE_EXCLUDED.includes(g.durum)
  }

  function toggleBulkDuzenleId(id: string) {
    setBulkDuzenleIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // U için izin verilen durum hedefleri
  const U_ALLOWED_STATUSES = ['TAMAMLANDI', 'IPTAL', 'KAPATILDI', 'SILINDI']

  async function applyBulkDuzenle() {
    if (!bulkDuzenleDurum || !bulkDuzenleIds.size) return
    // IPTAL hedefinde sebep zorunlu (min 3 karakter)
    if (bulkDuzenleDurum === 'IPTAL') {
      const sebep = bulkIptalSebep.trim()
      if (sebep.length < 3) {
        toast({ type: 'error', title: 'İptal Sebebi Eksik', message: 'Lütfen en az 3 karakter iptal sebebi girin.' })
        return
      }
    }
    const nowIso = new Date().toISOString()
    const allIds = Array.from(bulkDuzenleIds)

    // U ve TA için: TAMAMLANDI hedefinde HAZIR görevleri engelle
    let engelliGorevler: string[] = []
    let islenecekIds = allIds

    if ((isTA || isU) && bulkDuzenleDurum === 'TAMAMLANDI') {
      const engelliSet = allIds.filter(id => {
        const g = gorevler.find((x: any) => x.id === id)
        return g && g.durum === 'HAZIR'
      })
      engelliGorevler = engelliSet.map(id => {
        const g = gorevler.find((x: any) => x.id === id)
        return g?.tanim ?? id
      })
      islenecekIds = allIds.filter(id => !engelliSet.includes(id))

      if (engelliGorevler.length > 0) {
        setBulkDuzenleUyari(engelliGorevler)
        // Engellenecek görev varsa popup'ı kapat, uyarıyı göster, işlenebilecekleri de yapma
        setBulkDuzenlePopup(false)
        return
      }
    }

    if (!islenecekIds.length) return

    try {
      // TAMAMLANDI için her görevin gerçek durumu (aktif_olma_tarihi + elapsed ile) hesaplanır;
      // 8 saat geçtiyse veya BEKLEMEDE ise ZAMANINDA_YAPILAMAYAN (sapma) olur.
      if (bulkDuzenleDurum === 'TAMAMLANDI') {
        const { data: tasks } = await supabase
          .from('canli_gorevler')
          .select('id, durum, aktif_olma_tarihi, durum_degisim_tarihi')
          .in('id', islenecekIds)
          .eq('firma_id', firmaId)
        const gruplar: Record<string, string[]> = {}
        for (const t of (tasks ?? []) as any[]) {
          const resolved = resolveLiveCompletionStatusByTask(t, nowIso)
          if (resolved === 'ZAMANI_GECMIS') continue // tamamla kabul edilmez
          ;(gruplar[resolved] = gruplar[resolved] ?? []).push(t.id)
        }
        for (const [status, ids] of Object.entries(gruplar)) {
          await supabase.from('canli_gorevler').update({
            durum: status,
            tamamlayan_kullanici_id: meId,
            tamamlanma_tarihi: nowIso,
            durum_degisim_tarihi: nowIso,
            islemi_yapan_id: meId,
          }).in('id', ids).eq('firma_id', firmaId)
        }
      } else {
        const patch: any = {
          durum: bulkDuzenleDurum,
          durum_degisim_tarihi: nowIso,
          islemi_yapan_id: meId,
        }
        if (['IPTAL', 'KAPATILDI', 'SILINDI'].includes(bulkDuzenleDurum)) {
          patch.iptal_eden_id = meId
          patch.iptal_tarihi = nowIso
        }
        if (bulkDuzenleDurum === 'IPTAL') {
          patch.iptal_sebep = bulkIptalSebep.trim()
        }
        const { error } = await supabase
          .from('canli_gorevler')
          .update(patch)
          .in('id', islenecekIds)
          .eq('firma_id', firmaId)
        if (error) throw error
      }
      toast({ type: 'success', title: 'Başarılı', message: `${islenecekIds.length} görevin durumu güncellendi.` })
      setBulkDuzenlePopup(false)
      setBulkDuzenleMode(false)
      setBulkDuzenleIds(new Set())
      setBulkDuzenleDurum('')
      setBulkIptalSebep('')
      await refresh()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
  }

  async function bulkDelete() {
    const secim = await confirmChoice({
      title: `${selectedIds.size} Görevi Sil`,
      message: 'Bu görevleri nasıl silmek istiyorsunuz?',
      options: [
        { label: 'Listeden Kaldır', value: 'soft', description: 'Görevler veritabanında kalır, listede görünmez.' },
        { label: 'Kalıcı Olarak Sil', value: 'hard', description: 'Görevler tamamen silinir. Bu işlem geri alınamaz.' },
      ],
      cancelText: 'İptal',
    })
    if (!secim) return

    if (secim === 'hard') {
      const ok2 = await confirm({
        title: '⚠️ Kalıcı Toplu Silme Onayı',
        message: `${selectedIds.size} görev veritabanından kalıcı olarak silinecek.\n\nBu işlem GERİ ALINAMAZ. Onaylıyor musunuz?`,
        confirmText: 'Evet, Kalıcı Olarak Sil',
        cancelText: 'İptal',
        variant: 'danger',
      })
      if (!ok2) return
    }

    setSaving(true)
    try {
      if (secim === 'soft') {
        const nowIso = new Date().toISOString()
        const { data: bupdData, error: bupdErr } = await supabase
          .from('canli_gorevler')
          .update({ durum: 'SILINDI', durum_degisim_tarihi: nowIso, iptal_eden_id: meId, iptal_tarihi: nowIso, islemi_yapan_id: meId })
          .in('id', Array.from(selectedIds))
          .eq('firma_id', firmaId)
          .select('id')
        if (bupdErr) throw bupdErr
        if (!bupdData?.length) throw new Error('Toplu silme uygulanmadı (yetki/politika engeli olabilir).')
        toast({ type: 'success', title: 'Başarılı', message: 'Seçilen görevler listeden kaldırıldı' })
      } else {
        const { data: bdelData, error: bdelErr } = await supabase
          .from('canli_gorevler')
          .delete()
          .in('id', Array.from(selectedIds))
          .eq('firma_id', firmaId)
          .select('id')
        if (bdelErr) throw bdelErr
        if (!bdelData?.length) throw new Error('Toplu silme uygulanmadı (yetki/politika engeli olabilir).')
        toast({ type: 'success', title: 'Başarılı', message: 'Seçilen görevler kalıcı olarak silindi' })
      }
      setSelectedIds(new Set())
      setBulkMode(false)
      await refresh()
    } catch (e: any) {
      toast({ type: 'error', title: 'İşlem başarısız', message: e?.message ?? 'Hata' })
    }
    setSaving(false)
  }

async function del() {
    if (!selected) {
      toast({ type: 'info', title: 'Uyarı', message: 'Önce kayıt seçin.' })
      return
    }

    const secim = await confirmChoice({
      title: 'Görevi Sil',
      message: 'Bu görevi nasıl silmek istiyorsunuz?',
      options: [
        { label: 'Listeden Kaldır', value: 'soft', description: 'Görev veritabanında kalır, listede görünmez.' },
        { label: 'Kalıcı Olarak Sil', value: 'hard', description: 'Görev tamamen silinir. Bu işlem geri alınamaz.' },
      ],
      cancelText: 'İptal',
    })
    if (!secim) return

    if (secim === 'hard') {
      const ok2 = await confirm({
        title: '⚠️ Kalıcı Silme Onayı',
        message: `Bu görev veritabanından kalıcı olarak silinecek.\n\nBu işlem GERİ ALINAMAZ. Onaylıyor musunuz?`,
        confirmText: 'Evet, Kalıcı Olarak Sil',
        cancelText: 'İptal',
        variant: 'danger',
      })
      if (!ok2) return
    }

    setSaving(true)
    try {
      if (secim === 'soft') {
        const nowIso = new Date().toISOString()
        const { data: updData, error: updErr } = await supabase
          .from('canli_gorevler')
          .update({ durum: 'SILINDI', durum_degisim_tarihi: nowIso, iptal_eden_id: meId, iptal_tarihi: nowIso, islemi_yapan_id: meId })
          .eq('id', selected.id)
          .eq('firma_id', firmaId)
          .select('id')
        if (updErr) throw updErr
        if (!updData?.length) throw new Error('Silme uygulanmadı (yetki/politika engeli olabilir).')
        toast({ type: 'success', title: 'Başarılı', message: 'Görev listeden kaldırıldı' })
      } else {
        const { data: delData, error: delErr } = await supabase
          .from('canli_gorevler')
          .delete()
          .eq('id', selected.id)
          .eq('firma_id', firmaId)
          .select('id')
        if (delErr) throw delErr
        if (!delData?.length) throw new Error('Silme uygulanmadı (yetki/politika engeli olabilir).')
        toast({ type: 'success', title: 'Başarılı', message: 'Görev kalıcı olarak silindi' })
      }
      setSelectedId(null)
      await refresh()
    } catch (e: any) {
      toast({ type: 'error', title: 'İşlem başarısız', message: e?.message ?? 'Hata' })
    }
    setSaving(false)
  }


  const [q, setQ] = useState('')
  const [filterLoc1, setFilterLoc1] = useState('')
  const [filterLoc2, setFilterLoc2] = useState('')
  const [filterLoc3, setFilterLoc3] = useState('')
  const [atananId, setAtananId] = useState('')
  const [durum, setDurum] = useState('')
  const [actor, setActor] = useState('')
  // Tarih filtresi yalnızca aktif_olma_tarihi üzerinden, date input (saat yok).
  // İşlem tarihi (durum_degisim_tarihi) filtresi kaldırıldı.
  const [from, setFrom] = useState('')        // 'YYYY-MM-DD'
  const [to, setTo] = useState('')            // 'YYYY-MM-DD'
  // Vardiya filtresi — aktif_olma_tarihi'nin TR saatine göre. Saat aralığı
  // firma vardiya ayarından dinamik (sarkan vardiya — örn V1 23:30-07:30 — destekli).
  const [vardiyaFilter, setVardiyaFilter] = useState<'all' | 'v1' | 'v2' | 'v3' | 'v4'>('all')
  const [firmaVardiyalari, setFirmaVardiyalari] = useState<{ no: number; baslangic: string; bitis: string }[]>([])

  useEffect(() => {
    if (!firmaId) { setFirmaVardiyalari([]); return }
    const qs = new URLSearchParams({ firma_id: firmaId })
    if (projeId) qs.set('proje_id', projeId)
    fetch(`/api/firma/vardiya-ayarlari?${qs}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => setFirmaVardiyalari(j?.ok ? (j.vardiyalar ?? []) : []))
      .catch(() => setFirmaVardiyalari([]))
  }, [firmaId, projeId])

  // Vardiya filtre aralığı (dakika cinsinden, sarkan vardiya için bit > 1440)
  const vardiyaAralik = useMemo<{ basMin: number; bitMin: number } | null>(() => {
    if (vardiyaFilter === 'all') return null
    const vNo = Number(vardiyaFilter.replace('v', ''))
    const v = firmaVardiyalari.find(x => x.no === vNo)
    if (!v) return null
    const [bh, bm] = v.baslangic.split(':').map(Number)
    const [eh, em] = v.bitis.split(':').map(Number)
    if (![bh, bm, eh, em].every(Number.isFinite)) return null
    const basMin = bh * 60 + bm
    let bitMin = eh * 60 + em
    if (bitMin === 0 && basMin !== 0) bitMin = 24 * 60
    if (bitMin <= basMin && bitMin !== 24 * 60) bitMin += 24 * 60
    return { basMin, bitMin }
  }, [vardiyaFilter, firmaVardiyalari])

  // Seçili lokasyon filtresi (3 seviyeden en derini)
  const lokasyonId = filterLoc3 || filterLoc2 || filterLoc1

  // Seçilen lokasyonun tüm alt lokasyonlarını (dahil kendisi) set olarak döndür —
  // üst lokasyon seçildiğinde alt lokasyonlarındaki görevler de filtreye dahil olsun.
  const lokasyonSet = useMemo(() => {
    if (!lokasyonId) return null
    const set = new Set<string>([lokasyonId])
    // BFS ile descendants
    const queue = [lokasyonId]
    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const l of allLocs) {
        if (l.parent_id === cur && !set.has(l.id)) {
          set.add(l.id)
          queue.push(l.id)
        }
      }
    }
    return set
  }, [lokasyonId, allLocs])

  // Filtre lokasyon seçenekleri
  const filterLoc2Options = useMemo(() => filterLoc1 ? (allLocs.filter(l => l.parent_id === filterLoc1).sort((a,b) => a.tanim.localeCompare(b.tanim))) : [], [allLocs, filterLoc1])
  const filterLoc3Options = useMemo(() => filterLoc2 ? (allLocs.filter(l => l.parent_id === filterLoc2).sort((a,b) => a.tanim.localeCompare(b.tanim))) : [], [allLocs, filterLoc2])

  // Arşiv verisi — Uygula sonrası tek seferde 5000 satıra kadar çekilir,
  // ana tabloya merge edilerek tek görünüm sağlanır. Arşiv için ayrı pagination yok.
  const [arsivRows, setArsivRows] = useState<any[]>([])
  const [arsivTotal, setArsivTotal] = useState(0)
  const [arsivLoading, setArsivLoading] = useState(false)
  const [arsivAktif, setArsivAktif] = useState(false)
  const ARSIV_FETCH_LIMIT = 5000

  async function arsivYukle() {
    setArsivLoading(true)
    setArsivAktif(true)
    try {
      const qp = new URLSearchParams({ firma_id: firmaId, page: '1', limit: String(ARSIV_FETCH_LIMIT) })
      if (projeId) qp.set('proje_id', projeId)
      // Üst lokasyon seçildiğinde tüm torunları kapsayan ID listesi gönder
      // (backend tek lokasyon_id ile eq kontrolü yapıyor; descendant'ları yakalamak için 'in')
      if (lokasyonSet && lokasyonSet.size > 0) qp.set('lokasyon_ids', [...lokasyonSet].join(','))
      else if (lokasyonId) qp.set('lokasyon_id', lokasyonId)
      if (atananId) qp.set('atanan_id', atananId)
      if (durum) qp.set('durum', durum)
      if (q.trim()) qp.set('q', q.trim())
      if (from) qp.set('from', from)
      if (to) qp.set('to', to)
      if (vardiyaFilter !== 'all') qp.set('vardiya', vardiyaFilter)
      const res = await fetch(`/api/arsiv/frekansiyel?${qp}`)
      const j = await res.json()
      setArsivRows(j.data ?? [])
      setArsivTotal(j.total ?? 0)
    } catch {} finally { setArsivLoading(false) }
  }

  async function uygula() {
    await arsivYukle()
  }

  const [sortKey, setSortKey] = useState<SortKey>('grup')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const actorOptions = useMemo(() => {
    const set = new Set<string>()
    ;(gorevler ?? []).forEach((g: any) => {
      const name = getIslemiYapan(g, { meId, meName, kullanicilar })
      if (name && name !== '—') set.add(name)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'))
  }, [gorevler])

  // ── Vardiya bazlı bugünkü özet ─────────────────────────────────────────
  // Vardiyalar gece döngüsünde sıfırlanır (canli_gorevler bugünkü görevleri tutar)
  // ama eski ZAMANI_GECMIS/BEKLEMEDE görevler henüz arşivlenmediyse aktif tabloda
  // kalabiliyor. Bu yüzden hem TR tarihi hem TR saati ile eşleştirme yapıyoruz —
  // sadece bugünün TR tarihine ait görevler vardiyalara dağılır.
  const vardiyaOzetleri = useMemo(() => {
    if (!vardiyaAyari.length) return []
    function trIsoParts(iso: string): { tarih: string; saat: string } {
      // ISO timestamp → Europe/Istanbul TZ üzerinden 'YYYY-MM-DD' + 'HH:MM'
      const d = new Date(iso)
      const tarih = d.toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })  // YYYY-MM-DD
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
    // Sarkan V1 (23:30-07:30) aktifken bugun=yarının vardiya_gunu'na ait olur
    const bugunTR = suankiVardiyaGunu(vardiyaAyari)
    // Kayıp = IPTAL + BEKLEMEDE + ZAMANI_GECMIS (yapılamayan görevler)
    const KAYIP_DURUMLAR = new Set(['IPTAL', 'BEKLEMEDE', 'ZAMANI_GECMIS'])
    const sayac: Record<number, { toplam: number; tamamlanan: number; sapma: number; kayip: number }> = {}
    for (const v of vardiyaAyari) sayac[v.no] = { toplam: 0, tamamlanan: 0, sapma: 0, kayip: 0 }
    for (const g of gorevler ?? []) {
      // Bugün vardiya sayacı — görevin AİT olduğu güne göre (vardiya_gunu).
      // V1 sarkan görevi 31 May 23:35 aktif olsa bile vardiya_gunu='1 Haz'
      // olduğu için 1 Haz açıldığında doğru vardiya sayacına girer.
      if (!g.vardiya_gunu || g.vardiya_gunu !== bugunTR) continue
      if (!g.aktif_olma_tarihi) continue
      const { saat } = trIsoParts(g.aktif_olma_tarihi)
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
        // Başarı = (tamamlanan + sapma) / toplam — sapma da görev yapılmış sayılır (geç tamamlama)
        const basari = s.toplam > 0 ? Math.round(((s.tamamlanan + s.sapma) / s.toplam) * 100) : 0
        return { no: v.no, baslangic: v.baslangic, bitis: v.bitis, ...s, basari }
      })
  }, [vardiyaAyari, gorevler])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    // Date input string'leri → TRT gün sınırlı ms (00:00 ve 23:59:59 +03:00)
    // Tarih filtresi vardiya_gunu (date) üzerinden — YYYY-MM-DD string
    // karşılaştırması yeterli. Sarkan V1 görevi 31 May 23:35'te aktif olsa
    // bile vardiya_gunu='1 Haz' olduğu için "1 Haz" filtresine girer.
    const fromDate: string | null = from || null
    const toDate: string | null   = to   || null

    return (gorevler ?? []).filter((g: any) => {
      if (s) {
        const hay = [
          g.tanim ?? '',
          g.lokasyonlar?.tanim ?? '',
          g.atanan?.isim_soyisim ?? '',
          getIslemiYapan(g, { meId, meName, kullanicilar }) ?? '',
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(s)) return false
      }

      if (lokasyonSet && (!g.lokasyon_id || !lokasyonSet.has(g.lokasyon_id))) return false
      if (atananId && g.atanan_kullanici_id !== atananId) return false
      if (durum && g.durum !== durum) return false
      if (actor && getIslemiYapan(g, { meId, meName, kullanicilar }) !== actor) return false

      if (fromDate || toDate) {
        if (!g.vardiya_gunu) return false
        if (fromDate && g.vardiya_gunu < fromDate) return false
        if (toDate   && g.vardiya_gunu > toDate)   return false
      }
      if (vardiyaAralik) {
        if (!g.aktif_olma_tarihi) return false
        const hm = new Date(g.aktif_olma_tarihi).toLocaleTimeString('en-GB', {
          timeZone: 'Europe/Istanbul', hour12: false, hour: '2-digit', minute: '2-digit',
        })
        const [h, m] = hm.split(':').map(Number)
        if (!Number.isFinite(h) || !Number.isFinite(m)) return false
        const dk = h * 60 + m
        const { basMin, bitMin } = vardiyaAralik
        const icinde = bitMin <= 24 * 60
          ? (dk >= basMin && dk < bitMin)
          : (dk >= basMin || dk < (bitMin - 24 * 60))  // sarkan
        if (!icinde) return false
      }

      return true
    })
  }, [q, lokasyonSet, atananId, durum, actor, from, to, vardiyaAralik, gorevler])

  const sorted = useMemo(() => {
    // Varsayılan 3-seviyeli grup sıralaması:
    //   Grup 1 (üst):  İşlem görmüş (TAMAMLANDI/IPTAL/ZAMANINDA_YAPILAMAYAN/ZAMANI_GECMIS/KAPATILDI/SILINDI)
    //                  → durum_degisim_tarihi desc (son işlem önce)
    //   Grup 2 (orta): Aktif (ACIK/ISLEMDE/BEKLEMEDE)
    //                  → aktif_olma_tarihi desc
    //   Grup 3 (alt):  HAZIR (aktifleşmeyi bekleyenler)
    //                  → aktif_olma_tarihi desc (en yakın aktifleşecek önce)
    if (sortKey === 'grup') {
      const gorevGrup = (g: any): number => {
        const d = g.durum
        if (d === 'HAZIR') return 3
        if (d === 'ACIK' || d === 'ISLEMDE' || d === 'BEKLEMEDE') return 2
        return 1 // TAMAMLANDI, ZAMANINDA_YAPILAMAYAN, IPTAL, vs — işlem görmüş
      }
      const tarih = (g: any): number => {
        if (gorevGrup(g) === 1) {
          return g.durum_degisim_tarihi ? new Date(g.durum_degisim_tarihi).getTime() : 0
        }
        return g.aktif_olma_tarihi ? new Date(g.aktif_olma_tarihi).getTime() : 0
      }
      const arr = [...filtered]
      arr.sort((a, b) => {
        const ga = gorevGrup(a)
        const gb = gorevGrup(b)
        if (ga !== gb) return ga - gb // üst grup önce (1 → 2 → 3)
        return tarih(b) - tarih(a) // aynı grupta en yeni önce
      })
      return arr
    }

    // Tek kolon sıralaması — kullanıcı başlığa tıkladığında
    const dir = sortDir === 'asc' ? 1 : -1
    const getVal = (g: any): any => {
      if (sortKey === 'tanim') return (g.tanim ?? '').toString()
      if (sortKey === 'lokasyon') return (g.lokasyonlar?.tanim ?? '').toString()
      if (sortKey === 'atanan') return (g.atanan?.isim_soyisim ?? '').toString()
      if (sortKey === 'durum') return (CANLI_DURUM_LABEL[g.durum] ?? g.durum ?? '').toString()
      if (sortKey === 'actor') return (getIslemiYapan(g, { meId, meName, kullanicilar }) ?? '').toString()
      if (sortKey === 'islem') return g.durum_degisim_tarihi ? new Date(g.durum_degisim_tarihi).getTime() : 0
      // aktif
      return g.aktif_olma_tarihi ? new Date(g.aktif_olma_tarihi).getTime() : 0
    }

    const arr = [...filtered]
    arr.sort((a, b) => {
      const va = getVal(a)
      const vb = getVal(b)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return va.toString().localeCompare(vb.toString(), 'tr') * dir
    })
    return arr
  }, [filtered, sortKey, sortDir, meId, meName, kullanicilar])

  // Tablo satırları (aktif görevler) — client-side pagination
  const tabloRows = useMemo(() => sorted.map(r => ({ ...r, _source: 'tablo' as const })), [sorted])
  // Arşiv satırları — _source ile işaretli, ana tabloya merge edilir
  const arsivDisplayRows = useMemo(() => arsivRows.map(r => ({ ...r, _source: 'arsiv' as const })), [arsivRows])

  // combinedRows = aktif tablo + arşiv (Uygula sonrası arşiv yüklendiyse)
  // Aktif görevler önce, arşiv görevleri arşiv_tarihi DESC sırada altına eklenir.
  const combinedRows = useMemo(() => {
    if (!arsivAktif || arsivDisplayRows.length === 0) return tabloRows
    return [...tabloRows, ...arsivDisplayRows]
  }, [tabloRows, arsivDisplayRows, arsivAktif])

  // Sayfalama (tablo)
  const PAGE_SIZE = 50
  const [sayfa, setSayfa] = useState(1)
  const toplamSayfa = Math.max(1, Math.ceil(combinedRows.length / PAGE_SIZE))
  const sayfaRows = combinedRows.slice((sayfa - 1) * PAGE_SIZE, sayfa * PAGE_SIZE)
  useEffect(() => { setSayfa(1) }, [combinedRows.length])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDir(key === 'aktif' ? 'desc' : 'asc')
    }
  }

  function clear() {
    setQ('')
    setFilterLoc1('')
    setFilterLoc2('')
    setFilterLoc3('')
    setAtananId('')
    setDurum('')
    setActor('')
    setFrom('')
    setTo('')
    setVardiyaFilter('all')
    setArsivRows([])
    setArsivAktif(false)
    setSortKey('grup')
    setSortDir('desc')
  }

  const thBtn = (label: string, key: SortKey) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontWeight: 700,
        fontSize: 13.5,
        textTransform: 'uppercase',
        color: '#6b7280',
        letterSpacing: '0.05em',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
      <span style={{ fontSize: 14, opacity: sortKey === key ? 1 : 0.45, color: sortKey === key ? '#1f2937' : '#9ca3af' }}>
        {sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </button>
  )

  return (
    <div className="verde-card" style={{ padding: 16, overflowX: 'hidden' }}>

      {/* ── VARDİYA BAZLI BUGÜNKÜ ÖZET ── */}
      {vardiyaOzetleri.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${vardiyaOzetleri.length}, minmax(0,1fr))`,
          gap: 10, marginBottom: 16,
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
      )}

      {/* ── GÖREV LİSTESİ SEKMESİ ── */}
      {sekme === 'gorevler' && (<>

      {/* ── SATIR 1: Aksiyon Butonları (Canlı Akış | Şablon/İçe/Dışa | CRUD) ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, overflowX: 'auto', whiteSpace: 'nowrap', paddingBottom: 4 }}>
        <input ref={importInputRef} type="file" accept=".xlsx" style={{ display:'none' }} onChange={onImportFile} />

        {/* SOL — Canlı Görev Akışı + Frekans Sayıları */}
        <a href={`${base}/dashboard/canli-islemler`} style={{ textDecoration: 'none', flexShrink: 0 }}>
          <button type="button" style={{
            height: 36, padding: '0 16px', borderRadius: 8, border: 'none',
            background: '#111827', color: '#fff', fontWeight: 800, fontSize: 13.5,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>📡 Canlı Görev Akışı</button>
        </a>
        <a href={`${base}/dashboard/canli-islemler/tum-gorevler/frekans-sayilari`} style={{ textDecoration: 'none', flexShrink: 0 }}>
          <button type="button" style={{
            height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid #d1d5db',
            background: '#fff', color: '#111827', fontWeight: 700, fontSize: 13,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>📊 Frekans Sayıları</button>
        </a>

        <div style={{ flex: 1 }} />

        {/* ORTA — Şablon / İçe Aktar / Dışa Aktar (U göremez) */}
        {!isU && (<>
          <Button className="text-[13.5px]" variant="ghost" onClick={() => downloadExcel('template')} disabled={readonly || saving || (!licenseLoading && licenseExpired)} type="button" style={IMPORT_EXPORT_BUTTON_STYLE}><Download size={14} /> Şablon</Button>
          <Button className="text-[13.5px]" variant="ghost" onClick={() => importInputRef.current?.click()} disabled={readonly || saving || (!licenseLoading && licenseExpired)} type="button" style={IMPORT_EXPORT_BUTTON_STYLE}><Upload size={14} /> İçe Aktar</Button>
          <Button className="text-[13.5px]" variant="ghost" onClick={() => downloadExcel('export')} disabled={readonly || saving} type="button" style={IMPORT_EXPORT_BUTTON_STYLE}><FileSpreadsheet size={14} /> Dışa Aktar</Button>
        </>)}

        <div style={{ flex: 1 }} />

        {/* SAĞ — CRUD: Ekle, Düzenle, Toplu Düzenle, Sil, Toplu Sil */}
        {!isU && yetki.ekleyebilir && (
          <Button className="text-[13.5px]" variant="primary" disabled={readonly || saving || (!licenseLoading && licenseExpired)} onClick={openCreate} type="button" style={IMPORT_EXPORT_BUTTON_STYLE}>+ Ekle</Button>
        )}
        {!readonly && yetki.duzenleyebilir && (<>
          <Button className="text-[13.5px]" variant="primary" disabled={saving || !selected} onClick={openEdit} type="button" style={IMPORT_EXPORT_BUTTON_STYLE}><Pencil size={14} /> Düzenle</Button>
          <Button
            className="text-[13.5px]"
            variant={bulkDuzenleMode ? (bulkDuzenleIds.size > 0 ? 'primary' : 'ghost') : 'ghost'}
            type="button"
            style={IMPORT_EXPORT_BUTTON_STYLE}
            onClick={() => {
              if (!bulkDuzenleMode) {
                setBulkDuzenleMode(true)
                setBulkDuzenleIds(new Set())
                setBulkDuzenleDurum('')
                setBulkMode(false)
              } else if (bulkDuzenleIds.size > 0) {
                setBulkDuzenlePopup(true)
              } else {
                setBulkDuzenleMode(false)
                setBulkDuzenleIds(new Set())
              }
            }}
          >
            {bulkDuzenleMode
              ? bulkDuzenleIds.size > 0
                ? `Toplu Durum Değiştir (${bulkDuzenleIds.size})`
                : 'Vazgeç'
              : '✏️ Toplu Düzenle'}
          </Button>
        </>)}
        {!isU && yetki.silebilir && (<>
          <Button className="text-[13.5px]" variant="danger" disabled={readonly || saving || bulkMode} onClick={del} type="button" style={IMPORT_EXPORT_BUTTON_STYLE}><Trash2 size={14} /> Sil</Button>
          <Button
            className="text-[13.5px]"
            variant="danger"
            disabled={readonly || saving || (!licenseLoading && licenseExpired)}
            onClick={() => {
              if (!bulkMode) {
                setBulkMode(true); setSelectedIds(new Set()); setSelectedId(null)
                toast({ type: 'info', title: 'Toplu Sil', message: 'Silmek için görevleri seç.' })
                return
              }
              if (!selectedIds.size) {
                setBulkMode(false); setSelectedIds(new Set())
                toast({ type: 'info', title: 'İptal', message: 'Toplu silme iptal edildi.' })
                return
              }
              bulkDelete()
            }}
            type="button"
            style={IMPORT_EXPORT_BUTTON_STYLE}
          >
            <Trash2 size={14} /> {bulkMode ? (selectedIds.size ? 'Tümünü Sil' : 'İptal') : 'Toplu Sil'}
          </Button>
        </>)}
      </div>

      {/* ── SATIR 2: Arama + Filtreler ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center', padding: '10px 12px', background: '#f8fbf8', borderRadius: 8, border: '1px solid #f3f4f6' }}>
        {/* Arama — en sol */}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ara (görev, lokasyon, kişi...)"
          className="verde-input"
          style={{ width: 220, flexShrink: 0 }}
        />

        {/* Lokasyon — 3 seviye */}
        <select className="verde-select" value={filterLoc1} onChange={e => { setFilterLoc1(e.target.value); setFilterLoc2(''); setFilterLoc3('') }} style={{ width: 148 }}>
          <option value="">Lokasyon (Tümü)</option>
          {rootLocs.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
        </select>
        {filterLoc2Options.length > 0 && (
          <select className="verde-select" value={filterLoc2} onChange={e => { setFilterLoc2(e.target.value); setFilterLoc3('') }} style={{ width: 148 }}>
            <option value="">Alt Lokasyon</option>
            {filterLoc2Options.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
          </select>
        )}
        {filterLoc3Options.length > 0 && (
          <select className="verde-select" value={filterLoc3} onChange={e => setFilterLoc3(e.target.value)} style={{ width: 148 }}>
            <option value="">Alt-Alt Lokasyon</option>
            {filterLoc3Options.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
          </select>
        )}

        {personelAtamaAktif && (
          <select className="verde-select" value={atananId} onChange={e => setAtananId(e.target.value)} style={{ width: 148 }}>
            <option value="">Atanan (Tümü)</option>
            {kullanicilar.map(u => <option key={u.id} value={u.id}>{u.isim_soyisim}</option>)}
          </select>
        )}

        <select className="verde-select" value={durum} onChange={e => setDurum(e.target.value)} style={{ width: 148 }}>
          <option value="">Durum (Tümü)</option>
          <option value="ACIK">Açık</option>
          <option value="ISLEMDE">İşlemde</option>
          <option value="BEKLEMEDE">Beklemede</option>
          <option value="TAMAMLANDI">Tamamlandı</option>
          <option value="ZAMANINDA_YAPILAMAYAN">Zamanında Yapılamayan</option>
          <option value="IPTAL">İptal</option>
          <option value="ZAMANI_GECMIS">Zamanı Geçmiş</option>
          <option value="KAPATILDI">Kapatıldı</option>
          <option value="SILINDI">Silindi</option>
        </select>

        <select className="verde-select" value={actor} onChange={e => setActor(e.target.value)} style={{ width: 148 }}>
          <option value="">İşlemi Yapan (Tümü)</option>
          {actorOptions.map(name => <option key={name} value={name}>{name}</option>)}
        </select>

        <div style={{ width: 1, height: 24, background: '#e5e7eb', flexShrink: 0 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>Aktif Olma Tarihi:</span>
          <input type="date" className="verde-input" style={{ width: 140 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span style={{ fontSize: 12, color: '#9a9a9a' }}>—</span>
          <input type="date" className="verde-input" style={{ width: 140 }} value={to} onChange={e => setTo(e.target.value)} />
        </div>

        <select className="verde-select" value={vardiyaFilter} onChange={e => setVardiyaFilter(e.target.value as any)} style={{ width: 180 }}
          title="Aktif olma saatine göre vardiya filtresi (firma vardiya ayarından)">
          <option value="all">Vardiya (Tümü)</option>
          {firmaVardiyalari.map(v => (
            <option key={v.no} value={`v${v.no}`}>{v.no}. Vardiya ({v.baslangic.slice(0,5)}-{v.bitis.slice(0,5)})</option>
          ))}
        </select>

        <button type="button" onClick={uygula} disabled={arsivLoading}
          style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: '#1f2937', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: arsivLoading ? 0.7 : 1 }}>
          {arsivLoading ? 'Yükleniyor…' : '▶ Uygula'}
        </button>
        <button type="button" onClick={clear}
          style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, color: '#4b5563', cursor: 'pointer' }}>
          Temizle
        </button>
      </div>

      <div className="verde-table-wrap" style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 290px)' }}>
        <table className="verde-table" style={{ fontFamily: "Inter, ui-sans-serif, system-ui", fontSize: 13 }}>
          <thead>
            <tr>
              {bulkMode ? <th style={{ width: 44 }}></th> : null}
              {bulkDuzenleMode ? <th style={{ width: 44 }}></th> : null}
              {arsivAktif && <th>Kayıt Türü</th>}
              <th>{thBtn('Görev', 'tanim')}</th>
              <th>{thBtn('Üst Lokasyon', 'lokasyon')}</th>
              <th>{thBtn('Lokasyon', 'lokasyon')}</th>
              {personelAtamaAktif && <th style={{ paddingRight: 22 }}>{thBtn('Atanan', 'atanan')}</th>}
              <th style={{ paddingLeft: 22 }}>{thBtn('Aktif Saat', 'aktif')}</th>
              <th>{thBtn('İşlem Tarihi', 'islem')}</th>
              {islemSureleriAktif && <th>İşlem Saatleri</th>}
              {islemSureleriAktif && <th>İşlem Süresi</th>}
              <th>{thBtn('İşlemi Yapan', 'actor')}</th>
              <th>Kanal</th>
              <th>{thBtn('Durum', 'durum')}</th>
              <th style={{ textAlign:'center' }}>Çeklist</th>
            </tr>
          </thead>
          <tbody>
            {sayfaRows.map((g: any) => {
              const isArsiv = g._source === 'arsiv'
              return (
              <tr key={`${g._source}-${g.id}`} onClick={() => {
                  if (isArsiv) return
                  if (bulkMode) { toggleBulk(g.id); setSelectedId(null) }
                  else if (bulkDuzenleMode) { if (canBulkDuzenle(g)) toggleBulkDuzenleId(g.id) }
                  else { setSelectedId(g.id) }
                }} style={{
                  cursor: isArsiv ? 'default' : 'pointer',
                  background: isArsiv
                    ? '#f8fafc'
                    : bulkMode
                      ? (selectedIds.has(g.id) ? '#e7f9e7' : undefined)
                      : bulkDuzenleMode
                        ? (bulkDuzenleIds.has(g.id) ? '#e7f0ff' : undefined)
                        : (g.id===selectedId ? '#e7f9e7' : undefined)
                }}>
                {bulkMode ? (
                  <td onClick={(e) => e.stopPropagation()} style={{ width: 44 }}>
                    {!isArsiv && (
                      <input type="checkbox" checked={selectedIds.has(g.id)} onChange={() => toggleBulk(g.id)} style={{ width: 16, height: 16 }} />
                    )}
                  </td>
                ) : null}
                {bulkDuzenleMode ? (
                  <td onClick={(e) => e.stopPropagation()} style={{ width: 44, textAlign: 'center' }}>
                    {!isArsiv && canBulkDuzenle(g) ? (
                      <input type="checkbox" checked={bulkDuzenleIds.has(g.id)} onChange={() => toggleBulkDuzenleId(g.id)} style={{ width: 16, height: 16, accentColor: '#7c3aed' }} />
                    ) : (
                      <span style={{ fontSize: 11, color: '#c0c0c0' }}>—</span>
                    )}
                  </td>
                ) : null}
                {arsivAktif && (
                  <td>
                    <span style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: isArsiv ? '#f1f5f9' : '#e7f9e7',
                      color: isArsiv ? '#64748b' : '#1f2937',
                      border: `1px solid ${isArsiv ? '#cbd5e1' : '#bbf7d0'}`,
                    }}>
                      {isArsiv ? 'Arşiv' : 'Tablo'}
                    </span>
                  </td>
                )}
                {/* Doğal görünme: simüle tamamlanan görevler gerçeklerden ayırt edilmez. */}
                <td style={{ fontWeight: 600, color: isArsiv ? '#475569' : undefined }}>{g.tanim}</td>
                {(() => {
                  const { ust, alt } = getLocUstAlt(g.lokasyon_id, g.lokasyonlar?.tanim)
                  return (
                    <>
                      <td style={{ color: isArsiv ? '#94a3b8' : '#6b7280', fontSize: 12.5 }}>{ust}</td>
                      <td style={{ color: isArsiv ? '#64748b' : '#4b5563', fontWeight: 600 }}>{alt}</td>
                    </>
                  )
                })()}
                {personelAtamaAktif && <td style={{ color: isArsiv ? '#64748b' : '#4b5563', paddingRight: 22 }}>{g.atanan?.isim_soyisim ?? '—'}</td>}
                <td style={{ color: isArsiv ? '#94a3b8' : '#6b7280', whiteSpace: 'nowrap', fontSize: 13, paddingLeft: 22 }}>{g.aktif_olma_tarihi ? formatDateTime(g.aktif_olma_tarihi) : '—'}</td>
                {/* İşlem Tarihi — sadece tarih kısmı (DD.MM.YYYY) */}
                <td style={{ color: isArsiv ? '#94a3b8' : '#6b7280', whiteSpace: 'nowrap', fontSize: 13 }}>
                  {formatTarihTR(isArsiv ? (g.arsiv_tarihi ?? g.durum_degisim_tarihi) : g.durum_degisim_tarihi)}
                </td>
                {/* İşlem Saatleri (proje ayarına bağlı) */}
                {islemSureleriAktif && (
                  <td style={{ color: isArsiv ? '#94a3b8' : '#6b7280', whiteSpace: 'nowrap', fontSize: 13 }}>
                    {formatIslemSaatleri(g.baslatilma_tarihi, g.tamamlanma_tarihi ?? g.durum_degisim_tarihi)}
                  </td>
                )}
                {/* İşlem Süresi (proje ayarına bağlı) — ekstra görevde "Ekstra" badge */}
                {islemSureleriAktif && (
                  <td style={{ color: isArsiv ? '#94a3b8' : '#6b7280', whiteSpace: 'nowrap', fontSize: 13 }}>
                    {g.kural_id == null
                      ? <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 6, background: '#ede9fe', color: '#7c3aed', fontWeight: 700, fontSize: 11 }}>Ekstra</span>
                      : formatIslemSuresi(g.tamamlanma_suresi_saniye)
                    }
                  </td>
                )}
                <td style={{ color: isArsiv ? '#94a3b8' : '#4b5563' }}>{getIslemiYapan(g, { meId, meName, kullanicilar })}</td>
                <td><KanalBadge value={g.son_tamamlama_kanali} size="sm" /></td>
                <td>
                  {g.durum === 'IPTAL' ? (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setIptalDetay({ sebep: g.iptal_sebep, eden: g.iptalEden?.isim_soyisim ?? null, tarih: g.iptal_tarihi }) }}
                      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      title="İptal nedenini görüntüle"
                    >
                      <span className={`verde-badge ${DURUM_RENK[g.durum] ?? ''}`} style={{ cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 2 }}>
                        {CANLI_DURUM_LABEL[g.durum] ?? g.durum}
                      </span>
                    </button>
                  ) : (
                    <span className={`verde-badge ${DURUM_RENK[g.durum] ?? ''}`}>{CANLI_DURUM_LABEL[g.durum] ?? g.durum}</span>
                  )}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {ceklistAktif && !isArsiv && lokasyonlar.find((l: any) => l.id === g.lokasyon_id && (l as any).checklist_sablon_id) ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); setChecklistGorev({ id: g.id, type: 'canli_gorevler' }) }}
                      style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, padding: '2px 7px', cursor: 'pointer', fontSize: 11, color: '#1d4ed8' }}
                    >
                      📋 Çeklist
                    </button>
                  ) : <span style={{ color: '#cbd5e1' }}>—</span>}
                </td>
              </tr>
              )
            })}
            {!combinedRows.length && (
              <tr>
                <td colSpan={(bulkMode || bulkDuzenleMode) ? (arsivAktif ? 12 : 11) : (arsivAktif ? 11 : 10)} style={{ textAlign: 'center', color: '#6b7280', padding: '26px 0', fontSize: 13 }}>
                  Kriterlere uygun görev bulunamadı
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sayfalama */}
      {toplamSayfa > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#f8fafc', borderRadius: 8, marginTop: 8 }}>
          <span style={{ fontSize: 13, color: '#64748b' }}>
            {combinedRows.length} kayıt — Sayfa {sayfa}/{toplamSayfa}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setSayfa(1)} disabled={sayfa === 1}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, cursor: sayfa === 1 ? 'default' : 'pointer', opacity: sayfa === 1 ? 0.4 : 1 }}>{'<<'}</button>
            <button onClick={() => setSayfa(s => Math.max(1, s - 1))} disabled={sayfa === 1}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, cursor: sayfa === 1 ? 'default' : 'pointer', opacity: sayfa === 1 ? 0.4 : 1 }}>{'<'}</button>
            <button onClick={() => setSayfa(s => Math.min(toplamSayfa, s + 1))} disabled={sayfa === toplamSayfa}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, cursor: sayfa === toplamSayfa ? 'default' : 'pointer', opacity: sayfa === toplamSayfa ? 0.4 : 1 }}>{'>'}</button>
            <button onClick={() => setSayfa(toplamSayfa)} disabled={sayfa === toplamSayfa}
              style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 13, cursor: sayfa === toplamSayfa ? 'default' : 'pointer', opacity: sayfa === toplamSayfa ? 0.4 : 1 }}>{'>>'}</button>
          </div>
        </div>
      )}

      {/* ── TOPLU DÜZENLE UYARI POPUP ── */}
      {bulkDuzenleUyari.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setBulkDuzenleUyari([])}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} className="verde-card" style={{ width: 'min(460px, 96vw)', padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 6, color: '#b91c1c' }}>⚠️ Durum Değişimi Yapılamıyor</div>
            <div style={{ fontSize: 13.5, color: '#4b5563', marginBottom: 12 }}>
              Aşağıdaki görevlerin durumu <strong>"Tamamlandı"</strong> yapılamaz.
              Lütfen tekrar düzenleyin:
            </div>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
              {bulkDuzenleUyari.map((tanim, i) => (
                <div key={i} style={{ fontSize: 13, color: '#b91c1c', padding: '3px 0', borderBottom: i < bulkDuzenleUyari.length - 1 ? '1px solid #fecaca' : 'none' }}>
                  • {tanim}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: '#6b7280', marginBottom: 16 }}>
              "Hazır" durumundaki görevler önce sisteme göre "Açık" hale gelmelidir.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="ghost" type="button" onClick={() => { setBulkDuzenleUyari([]); setBulkDuzenlePopup(true) }}>Geri Dön</Button>
              <div style={{ width: 8 }} />
              <Button variant="primary" type="button" onClick={() => setBulkDuzenleUyari([])}>Tamam</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── TOPLU DÜZENLE POPUP ── */}
      {bulkDuzenlePopup && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setBulkDuzenlePopup(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()} className="verde-card" style={{ width: 'min(400px, 96vw)', padding: 20 }}>
            <div style={{ fontSize: 15, fontWeight: 900, marginBottom: 4 }}>Toplu Durum Değiştir</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
              {bulkDuzenleIds.size} görev seçildi. Yeni durum seçin:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {(isU ? U_ALLOWED_STATUSES : ['TAMAMLANDI', 'IPTAL', 'KAPATILDI', 'SILINDI']).map(d => (
                <label key={d} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, border: `2px solid ${bulkDuzenleDurum === d ? '#374151' : '#e0ece0'}`, cursor: 'pointer', background: bulkDuzenleDurum === d ? '#f9fafb' : '#fff' }}>
                  <input type="radio" name="bulkDurum" value={d} checked={bulkDuzenleDurum === d} onChange={() => setBulkDuzenleDurum(d)} style={{ width: 16, height: 16 }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{CANLI_DURUM_LABEL[d] ?? d}</span>
                </label>
              ))}
            </div>
            {bulkDuzenleDurum === 'IPTAL' && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 6 }}>İptal Sebebi <span style={{ color: '#dc2626' }}>*</span></div>
                <textarea
                  value={bulkIptalSebep}
                  onChange={(e) => setBulkIptalSebep(e.target.value)}
                  placeholder="Görevlerin neden iptal edildiğini açıklayın (en az 3 karakter)"
                  maxLength={500}
                  rows={3}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' as const, boxSizing: 'border-box' }}
                />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, textAlign: 'right' as const }}>{bulkIptalSebep.length}/500</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" type="button" onClick={() => { setBulkDuzenlePopup(false); setBulkIptalSebep('') }}>Vazgeç</Button>
              <Button variant="primary" type="button" disabled={!bulkDuzenleDurum || (bulkDuzenleDurum === 'IPTAL' && bulkIptalSebep.trim().length < 3)} onClick={applyBulkDuzenle}>Tamam</Button>
            </div>
          </div>
        </div>
      )}

      {/* Ekle / Düzenle Modal */}
      {modal ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => (saving ? null : setModal(null))}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.25)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} className="verde-card" style={{ width: 'min(680px, 96vw)', padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#111827' }}>{modal === 'create' ? 'Görev Ekle' : 'Görev Düzenle'}</div>
              <button
                type="button"
                onClick={() => setModal(null)}
                disabled={saving}
                style={{ border: 'none', background: 'transparent', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 18, lineHeight: '18px' }}
                aria-label="Kapat"
              >
                ×
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 6 }}>Görev</div>
                <input
                  className="verde-input"
                  value={form.tanim}
                  onChange={(e) => setForm({ ...form, tanim: e.target.value })}
                  disabled={isU && modal === 'edit'}
                  style={(isU && modal === 'edit') ? { background: '#f5f5f5', color: '#888' } : undefined}
                />
              </div>

              <div>
                <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 6 }}>
                  Aktif Olma Tarihi
                </div>
                <input
                  type="datetime-local"
                  className="verde-input"
                  min={modal === 'create' ? toDateTimeLocalValue(new Date()) : undefined}
                  value={form.aktif_olma_tarihi}
                  onChange={(e) => setForm({ ...form, aktif_olma_tarihi: e.target.value })}
                  disabled={isU && modal === 'edit'}
                  style={(isU && modal === 'edit') ? { background: '#f5f5f5', color: '#888' } : undefined}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 6 }}>Lokasyon *</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div>
                    <select
                      className="verde-input"
                      value={loc1}
                      disabled={isU && modal === 'edit'}
                      style={(isU && modal === 'edit') ? { background: '#f5f5f5', color: '#888' } : undefined}
                      onChange={(e) => {
                        const v = e.target.value
                        setLoc1(v)
                        setLoc2('')
                        setLoc3('')
                        setForm({ ...form, lokasyon_id: v })
                      }}
                    >
                      <option value="">Lokasyon Seçiniz</option>
                      {rootLocs.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.tanim}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <select
                      className="verde-input"
                      value={loc2}
                      disabled={!loc1 || childLocs.length === 0}
                      onChange={(e) => {
                        const v = e.target.value
                        setLoc2(v)
                        setLoc3('')
                        setForm({ ...form, lokasyon_id: v || loc1 })
                      }}
                    >
                      {!loc1 ? (
                        <option value="">Önce lokasyon seçiniz</option>
                      ) : childLocs.length === 0 ? (
                        <option value="">Alt lokasyon yok</option>
                      ) : (
                        <option value="">Alt Lokasyon Seçiniz</option>
                      )}
                      {childLocs.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.tanim}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <select
                      className="verde-input"
                      value={loc3}
                      disabled={!loc2 || grandLocs.length === 0}
                      onChange={(e) => {
                        const v = e.target.value
                        setLoc3(v)
                        setForm({ ...form, lokasyon_id: v || loc2 || loc1 })
                      }}
                    >
                      {!loc2 ? (
                        <option value="">Önce alt lokasyon seçiniz</option>
                      ) : grandLocs.length === 0 ? (
                        <option value="">Alt lokasyon yok</option>
                      ) : (
                        <option value="">Alt Lokasyon Seçiniz</option>
                      )}
                      {grandLocs.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.tanim}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {personelAtamaAktif && (
              <div>
                <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 6 }}>Atanan</div>
                <select
                  className="verde-input"
                  value={form.atanan_kullanici_id}
                  onChange={(e) => setForm({ ...form, atanan_kullanici_id: e.target.value })}
                >
                  <option value="">Seçiniz</option>
                  {kullanicilar.map((u) => (
                    <option key={u.id} value={u.id}>{u.isim_soyisim}</option>
                  ))}
                </select>
              </div>
              )}


              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 6 }}>Durum</div>
                {modal === 'create' ? (
                  <input className="verde-input" value="Hazır" disabled />
                ) : (
                  <select
                    className="verde-input"
                    value={form.durum}
                    onChange={(e) => setForm({ ...form, durum: e.target.value })}
                  >
                    {/* U ve TA'da mevcut durum sistem durumuysa görüntülemek için disabled option */}
                    {(isTA || isU) && selected && SYSTEM_STATUSES.includes(selected.durum) && (
                      <option value={selected.durum} disabled>
                        {CANLI_DURUM_LABEL[selected.durum] ?? selected.durum}
                      </option>
                    )}
                    {/* SA: tüm durumlar seçilebilir */}
                    {!isTA && !isU && (
                      <>
                        <option value="HAZIR">Hazır</option>
                        <option value="ACIK">Açık</option>
                        <option value="BEKLEMEDE">Beklemede</option>
                        <option value="ZAMANINDA_YAPILAMAYAN">Zamanında Yapılamayan</option>
                      </>
                    )}
                    {/* TA ve U: yalnızca izinli hedef durumlar */}
                    <option value="TAMAMLANDI">Tamamlandı</option>
                    <option value="IPTAL">İptal</option>
                    <option value="KAPATILDI">Kapatıldı</option>
                    <option value="SILINDI">Silindi</option>
                  </select>
                )}
              </div>

              {modal === 'edit' && form.durum === 'IPTAL' && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 13, color: '#4b5563', marginBottom: 6 }}>
                    İptal Sebebi <span style={{ color: '#dc2626' }}>*</span>
                  </div>
                  <textarea
                    value={editIptalSebep}
                    onChange={(e) => setEditIptalSebep(e.target.value)}
                    placeholder="Görevin neden iptal edildiğini açıklayın (en az 3 karakter)"
                    maxLength={500}
                    rows={3}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', resize: 'vertical' as const, boxSizing: 'border-box' }}
                  />
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, textAlign: 'right' as const }}>{editIptalSebep.length}/500</div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <div>
                {ceklistAktif && modal === 'edit' && selected && lokasyonlar.find((l: any) => l.id === form.lokasyon_id && (l as any).checklist_sablon_id) && (
                  <button
                    type="button"
                    onClick={() => { setChecklistGorev({ id: selected.id, type: 'canli_gorevler', duzenleme: true }) }}
                    style={{ height: 36, padding: '0 14px', borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    📋 Çeklisti Düzenle
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="ghost" disabled={saving} onClick={() => setModal(null)} type="button">
                  Vazgeç
                </Button>
                <Button variant="primary" disabled={saving || !form.tanim?.trim() || !loc1} onClick={save} type="button">
                  {saving ? 'Kaydediliyor...' : 'Kaydet'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      </>)}

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

      {checklistGorev && (
        <ChecklistModal
          taskId={checklistGorev.id}
          taskType={checklistGorev.type}
          duzenleme={checklistGorev.duzenleme}
          onKapat={() => setChecklistGorev(null)}
          onKaydet={checklistGorev.duzenleme ? () => { setChecklistGorev(null); openEdit() } : undefined}
        />
      )}
</div>
  )
}
