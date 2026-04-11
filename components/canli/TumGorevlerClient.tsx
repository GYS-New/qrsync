'use client'

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime, CANLI_DURUM_LABEL } from '@/lib/utils'
import { resolveLiveCompletionStatusByTask } from '@/lib/tasks/liveStatus'
import Button from '@/components/ui/Button'
import { Download, FileSpreadsheet, Pencil, Trash2, Upload } from 'lucide-react'
import { useToast } from '@/components/ui/ToastProvider'
import { useLicenseExpired } from '@/components/hooks/useLicense'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { IMPORT_EXPORT_BUTTON_STYLE } from '@/lib/import-export/constants'
import ChecklistModal from '@/components/checklist/ChecklistModal'
import { useYetki } from '@/lib/yetki/useYetki'

type SortKey = 'tanim' | 'lokasyon' | 'atanan' | 'aktif' | 'islem' | 'durum' | 'actor'


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

function getIslemiYapan(g: any) {
  if (g.islemi_yapan?.isim_soyisim) return g.islemi_yapan.isim_soyisim
  if (['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN'].includes(g.durum)) return g.tamamlayan?.isim_soyisim ?? '—'
  if (g.durum === 'IPTAL') return g.iptalEden?.isim_soyisim ?? '—'
  if (['BEKLEMEDE', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS', 'KAPATILDI', 'SILINDI'].includes(g.durum)) {
    return g.iptalEden?.isim_soyisim ?? g.olusturan?.isim_soyisim ?? '—'
  }
  return g.olusturan?.isim_soyisim ?? '—'
}

export default function TumGorevlerClient({
  base,
  firmaId,
  meId,
  readonly,
  lokasyonlar,
  kullanicilar,
  initialGorevler,
  projeId,
  personelAtamaAktif = true,
  yetkiliLokIds,
}: {
  base: '/sa' | '/ta' | '/u'
  firmaId: string
  meId: string
  readonly: boolean
  lokasyonlar: { id: string; tanim: string; parent_id?: string | null; checklist_sablon_id?: string | null }[]
  kullanicilar: { id: string; isim_soyisim: string }[]
  initialGorevler: any[]
  projeId?: string | null
  personelAtamaAktif?: boolean
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



  const [gorevler, setGorevler] = useState<any[]>(initialGorevler ?? [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [checklistGorev, setChecklistGorev] = useState<{ id: string; type: 'canli_gorevler'; duzenleme?: boolean } | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDuzenleMode, setBulkDuzenleMode] = useState(false)
  const [bulkDuzenlePopup, setBulkDuzenlePopup] = useState(false)
  const [bulkDuzenleDurum, setBulkDuzenleDurum] = useState('')
  const [bulkDuzenleIds, setBulkDuzenleIds] = useState<Set<string>>(new Set())
  const [bulkDuzenleUyari, setBulkDuzenleUyari] = useState<string[]>([])
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
      .select('id,tanim,parent_id')
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
    setModal('create')
  }

  function openEdit() {
    if (!selected) return
    if (selected.durum === 'ZAMANI_GECMIS') {
      toast({ type: 'error', title: 'İşlem Yapılamaz', message: 'Zamanı geçmiş görevler düzenlenemez.' })
      return
    }
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

    const patch: any = {
      durum: bulkDuzenleDurum,
      durum_degisim_tarihi: nowIso,
      islemi_yapan_id: meId,
    }
    if (bulkDuzenleDurum === 'TAMAMLANDI') {
      patch.tamamlayan_kullanici_id = meId
      patch.tamamlanma_tarihi = nowIso
    } else if (['IPTAL', 'KAPATILDI', 'SILINDI'].includes(bulkDuzenleDurum)) {
      patch.iptal_eden_id = meId
      patch.iptal_tarihi = nowIso
    }
    try {
      const { error } = await supabase
        .from('canli_gorevler')
        .update(patch)
        .in('id', islenecekIds)
        .eq('firma_id', firmaId)
      if (error) throw error
      toast({ type: 'success', title: 'Başarılı', message: `${islenecekIds.length} görevin durumu güncellendi.` })
      setBulkDuzenlePopup(false)
      setBulkDuzenleMode(false)
      setBulkDuzenleIds(new Set())
      setBulkDuzenleDurum('')
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
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [islemFrom, setIslemFrom] = useState('')
  const [islemTo, setIslemTo] = useState('')

  // Seçili lokasyon filtresi (3 seviyeden en derini)
  const lokasyonId = filterLoc3 || filterLoc2 || filterLoc1

  // Filtre lokasyon seçenekleri
  const filterLoc2Options = useMemo(() => filterLoc1 ? (allLocs.filter(l => l.parent_id === filterLoc1).sort((a,b) => a.tanim.localeCompare(b.tanim))) : [], [allLocs, filterLoc1])
  const filterLoc3Options = useMemo(() => filterLoc2 ? (allLocs.filter(l => l.parent_id === filterLoc2).sort((a,b) => a.tanim.localeCompare(b.tanim))) : [], [allLocs, filterLoc2])

  // Arşiv verisi (Uygula'ya basılınca yüklenir)
  const [arsivRows, setArsivRows] = useState<any[]>([])
  const [arsivLoading, setArsivLoading] = useState(false)
  const [arsivAktif, setArsivAktif] = useState(false)

  const SEL_ARSIV = '*,lokasyonlar(id,tanim),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim),olusturan:users!olusturan_id(isim_soyisim),tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim)'

  async function uygula() {
    setArsivLoading(true)
    setArsivAktif(true)
    try {
      const fromISO = from ? new Date(from).toISOString() : null
      const toISO   = to   ? new Date(to).toISOString()   : null
      let q2 = supabase.from('canli_gorevler_arsiv').select(SEL_ARSIV + ',arsiv_tarihi,arsiv_nedeni')
        .eq('firma_id', firmaId).order('arsiv_tarihi', { ascending: false }).limit(500)
      if (projeId) q2 = (q2 as any).eq('proje_id', projeId)
      if (yetkiliLokIds) q2 = q2.in('lokasyon_id', yetkiliLokIds)
      if (lokasyonId) q2 = (q2 as any).eq('lokasyon_id', lokasyonId)
      if (atananId) q2 = (q2 as any).eq('atanan_kullanici_id', atananId)
      if (durum) q2 = (q2 as any).eq('durum', durum)
      if (fromISO) q2 = (q2 as any).gte('arsiv_tarihi', fromISO)
      if (toISO)   q2 = (q2 as any).lte('arsiv_tarihi', toISO)
      const { data } = await q2
      setArsivRows(data ?? [])
    } finally { setArsivLoading(false) }
  }

  const [sortKey, setSortKey] = useState<SortKey>('aktif')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const actorOptions = useMemo(() => {
    const set = new Set<string>()
    ;(gorevler ?? []).forEach((g: any) => {
      const name = getIslemiYapan(g)
      if (name && name !== '—') set.add(name)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'))
  }, [gorevler])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const fromD = from ? new Date(from) : null
    const toD = to ? new Date(to) : null
    const isFromD = islemFrom ? new Date(islemFrom) : null
    const isToD = islemTo ? new Date(islemTo) : null

    return (gorevler ?? []).filter((g: any) => {
      if (s) {
        const hay = [
          g.tanim ?? '',
          g.lokasyonlar?.tanim ?? '',
          g.atanan?.isim_soyisim ?? '',
          getIslemiYapan(g) ?? '',
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(s)) return false
      }

      if (lokasyonId && g.lokasyon_id !== lokasyonId) return false
      if (atananId && g.atanan_kullanici_id !== atananId) return false
      if (durum && g.durum !== durum) return false
      if (actor && getIslemiYapan(g) !== actor) return false

      if (fromD || toD) {
        const d = g.aktif_olma_tarihi ? new Date(g.aktif_olma_tarihi) : null
        if (!d) return false
        if (fromD && d < fromD) return false
        if (toD && d > toD) return false
      }

      if (isFromD || isToD) {
        const d2 = g.durum_degisim_tarihi ? new Date(g.durum_degisim_tarihi) : null
        if (!d2) return false
        if (isFromD && d2 < isFromD) return false
        if (isToD && d2 > isToD) return false
      }

      return true
    })
  }, [q, lokasyonId, atananId, durum, actor, from, to, islemFrom, islemTo, gorevler])

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1
    const getVal = (g: any): any => {
      if (sortKey === 'tanim') return (g.tanim ?? '').toString()
      if (sortKey === 'lokasyon') return (g.lokasyonlar?.tanim ?? '').toString()
      if (sortKey === 'atanan') return (g.atanan?.isim_soyisim ?? '').toString()
      if (sortKey === 'durum') return (CANLI_DURUM_LABEL[g.durum] ?? g.durum ?? '').toString()
      if (sortKey === 'actor') return (getIslemiYapan(g) ?? '').toString()
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
  }, [filtered, sortKey, sortDir, sortDir])

  const combinedRows = useMemo(() => {
    if (!arsivAktif) return sorted.map(r => ({ ...r, _source: 'tablo' as const }))
    const tablo = sorted.map(r => ({ ...r, _source: 'tablo' as const }))

    // Arşiv satırlarına da q ve actor client-side filtrelerini uygula
    const s = q.trim().toLowerCase()
    const filteredArsiv = arsivRows.filter((g: any) => {
      if (s) {
        const hay = [g.tanim ?? '', g.lokasyonlar?.tanim ?? '', g.atanan?.isim_soyisim ?? '', getIslemiYapan(g) ?? ''].join(' ').toLowerCase()
        if (!hay.includes(s)) return false
      }
      if (actor && getIslemiYapan(g) !== actor) return false
      return true
    })

    const arsiv = filteredArsiv.map(r => ({ ...r, _source: 'arsiv' as const }))
    const all = [...tablo, ...arsiv]
    all.sort((a, b) => {
      const da = a._source === 'arsiv' ? (a.arsiv_tarihi ?? a.aktif_olma_tarihi) : a.aktif_olma_tarihi
      const db = b._source === 'arsiv' ? (b.arsiv_tarihi ?? b.aktif_olma_tarihi) : b.aktif_olma_tarihi
      return new Date(db ?? 0).getTime() - new Date(da ?? 0).getTime()
    })
    return all
  }, [arsivAktif, sorted, arsivRows, q, actor])

  // Sayfalama
  const PAGE_SIZE = 50
  const [sayfa, setSayfa] = React.useState(1)
  const toplamSayfa = Math.max(1, Math.ceil(combinedRows.length / PAGE_SIZE))
  const sayfaRows = combinedRows.slice((sayfa - 1) * PAGE_SIZE, sayfa * PAGE_SIZE)
  // Filtre değişince sayfa 1'e dön
  React.useEffect(() => { setSayfa(1) }, [combinedRows.length])

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
    setIslemFrom('')
    setIslemTo('')
    setArsivRows([])
    setArsivAktif(false)
  }

  const thBtn = (label: string, key: SortKey) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontWeight: 800,
        fontSize: 14,
        textTransform: 'uppercase',
        color: '#111827',
      }}
    >
      {label}
      <span style={{ fontSize: 14, opacity: sortKey === key ? 1 : 0.35 }}>
        {sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
      </span>
    </button>
  )

  return (
    <div className="verde-card" style={{ padding: 16, overflowX: 'hidden' }}>

      {/* ── SEKME BAR ── */}
      <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid #f3f4f6', marginBottom: 16 }}>
        {[
          { key: 'gorevler', label: '📋 Görev Listesi' },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setSekme(key as any)} style={{
            padding: '10px 18px', background: 'none', border: 'none',
            borderBottom: sekme === key ? '2.5px solid #374151' : '2.5px solid transparent',
            cursor: 'pointer', fontSize: 13.5,
            fontWeight: sekme === key ? 800 : 500,
            color: sekme === key ? '#111827' : '#6b7280',
            transition: 'all 0.15s', whiteSpace: 'nowrap', marginBottom: -1,
          }}>{label}</button>
        ))}
      </div>

      {/* ── GÖREV LİSTESİ SEKMESİ ── */}
      {sekme === 'gorevler' && (<>

      {/* ── SATIR 1: Başlık + Araçlar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, overflowX: 'auto', whiteSpace: 'nowrap' }}>
        {/* Arama */}
        <input ref={importInputRef} type="file" accept=".xlsx" style={{ display:'none' }} onChange={onImportFile} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ara (görev, lokasyon, kişi...)"
          className="verde-input"
          style={{ width: 240, flexShrink: 0 }}
        />

        {/* Canlı Akış linki — her rol için görünür, belirgin */}
        <a href={`${base}/dashboard/canli-islemler`} style={{ textDecoration: 'none', flexShrink: 0 }}>
          <button type="button" style={{
            height: 36, padding: '0 16px', borderRadius: 8, border: 'none',
            background: '#111827', color: '#fff', fontWeight: 800, fontSize: 13.5,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          }}>📡 Canlı Görev Akışı</button>
        </a>

        {/* Toplu Düzenle — readonly olmayanlara göster */}
        {!readonly && yetki.duzenleyebilir && (
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
        )}

        {/* Import/Export — U göremez */}
        {!isU && (<>
          <div style={{ width: 1, height: 28, background: '#e0ece0', flexShrink: 0 }} />
          <Button className="text-[13.5px]" variant="ghost" onClick={() => downloadExcel('template')} disabled={readonly || saving || (!licenseLoading && licenseExpired)} type="button" style={IMPORT_EXPORT_BUTTON_STYLE}><Download size={14} /> Şablon</Button>
          <Button className="text-[13.5px]" variant="ghost" onClick={() => importInputRef.current?.click()} disabled={readonly || saving || (!licenseLoading && licenseExpired)} type="button" style={IMPORT_EXPORT_BUTTON_STYLE}><Upload size={14} /> İçe Aktar</Button>
          <Button className="text-[13.5px]" variant="ghost" onClick={() => downloadExcel('export')} disabled={readonly || saving} type="button" style={IMPORT_EXPORT_BUTTON_STYLE}><FileSpreadsheet size={14} /> Dışa Aktar</Button>
        </>)}

        {/* CRUD — U sadece Düzenle görebilir, Ekle/Sil/Toplu Sil göremez */}
        <div style={{ width: 1, height: 28, background: '#e0ece0', flexShrink: 0 }} />
        {!isU && yetki.ekleyebilir && (
          <Button className="text-[13.5px]" variant="primary" disabled={readonly || saving || (!licenseLoading && licenseExpired)} onClick={openCreate} type="button" style={IMPORT_EXPORT_BUTTON_STYLE}>+ Ekle</Button>
        )}
        {!readonly && yetki.duzenleyebilir && (
          <Button className="text-[13.5px]" variant="primary" disabled={saving || !selected} onClick={openEdit} type="button" style={IMPORT_EXPORT_BUTTON_STYLE}><Pencil size={14} /> Düzenle</Button>
        )}
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

      {/* ── SATIR 2: Filtreler ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center', padding: '10px 12px', background: '#f8fbf8', borderRadius: 8, border: '1px solid #f3f4f6' }}>
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

        <select className="verde-select" value={atananId} onChange={e => setAtananId(e.target.value)} style={{ width: 148 }}>
          <option value="">Atanan (Tümü)</option>
          {kullanicilar.map(u => <option key={u.id} value={u.id}>{u.isim_soyisim}</option>)}
        </select>

        <select className="verde-select" value={durum} onChange={e => setDurum(e.target.value)} style={{ width: 148 }}>
          <option value="">Durum (Tümü)</option>
          <option value="ACIK">Açık</option>
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
          <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>Aktif:</span>
          <input type="datetime-local" className="verde-input" style={{ width: 155 }} value={from} onChange={e => setFrom(e.target.value)} />
          <span style={{ fontSize: 12, color: '#9a9a9a' }}>—</span>
          <input type="datetime-local" className="verde-input" style={{ width: 155 }} value={to} onChange={e => setTo(e.target.value)} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>İşlem:</span>
          <input type="datetime-local" className="verde-input" style={{ width: 155 }} value={islemFrom} onChange={e => setIslemFrom(e.target.value)} />
          <span style={{ fontSize: 12, color: '#9a9a9a' }}>—</span>
          <input type="datetime-local" className="verde-input" style={{ width: 155 }} value={islemTo} onChange={e => setIslemTo(e.target.value)} />
        </div>

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
              <th>{thBtn('Lokasyon', 'lokasyon')}</th>
              <th>{thBtn('Atanan', 'atanan')}</th>
              <th>{thBtn('Aktif Saat', 'aktif')}</th>
              <th>{thBtn(arsivAktif ? 'İşlem / Arşiv Tarihi' : 'İŞLEM TARİH-SAAT', 'islem')}</th>
              <th>{thBtn('Durum', 'durum')}</th>
              <th>{thBtn('İşlemi Yapan', 'actor')}</th>
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
                <td style={{ fontWeight: 600, color: isArsiv ? '#475569' : g.simule_tamamlandi && !isU ? '#9ca3af' : undefined }}>{g.tanim}</td>
                <td style={{ color: isArsiv ? '#64748b' : '#4b5563' }}>{getLocPath(g.lokasyon_id, g.lokasyonlar?.tanim)}</td>
                <td style={{ color: isArsiv ? '#64748b' : '#4b5563' }}>{g.atanan?.isim_soyisim ?? '—'}</td>
                <td style={{ color: isArsiv ? '#94a3b8' : '#6b7280', whiteSpace: 'nowrap', fontSize: 13 }}>{g.aktif_olma_tarihi ? formatDateTime(g.aktif_olma_tarihi) : '—'}</td>
                <td style={{ color: isArsiv ? '#94a3b8' : '#6b7280', whiteSpace: 'nowrap', fontSize: 13 }}>
                  {isArsiv
                    ? (g.arsiv_tarihi ? formatDateTime(g.arsiv_tarihi) : '—')
                    : (g.durum_degisim_tarihi ? formatDateTime(g.durum_degisim_tarihi) : '—')}
                </td>
                <td>
                  <span className={`verde-badge ${DURUM_RENK[g.durum] ?? ''}`}>{CANLI_DURUM_LABEL[g.durum] ?? g.durum}</span>
                </td>
                <td style={{ color: isArsiv ? '#94a3b8' : '#4b5563' }}>{getIslemiYapan(g)}
                  {!isArsiv && lokasyonlar.find((l: any) => l.id === g.lokasyon_id && (l as any).checklist_sablon_id) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setChecklistGorev({ id: g.id, type: 'canli_gorevler' }) }}
                      style={{ marginLeft: 6, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 4, padding: '2px 7px', cursor: 'pointer', fontSize: 11, color: '#1d4ed8' }}
                    >
                      📋 Çeklist
                    </button>
                  )}
                </td>
              </tr>
              )
            })}
            {!combinedRows.length && (
              <tr>
                <td colSpan={(bulkMode || bulkDuzenleMode) ? (arsivAktif ? 9 : 8) : (arsivAktif ? 8 : 7)} style={{ textAlign: 'center', color: '#6b7280', padding: '26px 0', fontSize: 13 }}>
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
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button variant="ghost" type="button" onClick={() => setBulkDuzenlePopup(false)}>Vazgeç</Button>
              <Button variant="primary" type="button" disabled={!bulkDuzenleDurum} onClick={applyBulkDuzenle}>Tamam</Button>
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
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 14 }}>
              <div>
                {modal === 'edit' && selected && lokasyonlar.find((l: any) => l.id === form.lokasyon_id && (l as any).checklist_sablon_id) && (
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
