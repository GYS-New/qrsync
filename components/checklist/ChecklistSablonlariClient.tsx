'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import RowActionButton from '@/components/ui/RowActionButton'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { useFirma } from '@/components/layout/FirmaContext'

type SablonOzet = {
  id: string
  firma_id: string
  baslik: string
  tanim: string
  aktif: boolean
  versiyon: number
  kayit_tarihi?: string
  guncelleme_tarihi?: string
  madde_sayisi?: number
  kullanim_sayisi?: number
}

type MaddeForm = {
  id?: string
  localId: string
  sira_no: number
  baslik: string
  zorunlu_cevap: boolean
  aciklama_gerekli_yapilamadi: boolean
  gorsel_gerekli: boolean
  secenekler: { deger: string; aciklama_gerekli: boolean }[]
}

type BaglaAsama = 'secim' | 'lokasyon' | 'grup'

type LokasyonRow = {
  id: string
  tanim: string
  parent_id: string | null
  proje_id: string | null
  checklist_sablon_id: string | null
  aktif: boolean
}

type GrupRow = {
  id: string
  ad: string
  ust_lokasyon_id: string | null
  ust_lokasyon_tanim: string | null
  lokasyon_ids: string[]
}

function emptyMadde(index: number): MaddeForm {
  return {
    localId: `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    sira_no: index,
    baslik: '',
    zorunlu_cevap: true,
    aciklama_gerekli_yapilamadi: true,
    gorsel_gerekli: false,
    secenekler: [{ deger: 'Yapıldı', aciklama_gerekli: false }, { deger: 'Yapılamadı', aciklama_gerekli: true }],
  }
}

export default function ChecklistSablonlariClient({
  base,
  initialFirmaId,
  initialSablonlar,
  readonly,
  projeId,
}: {
  base: '/sa' | '/ta'
  initialFirmaId?: string | null
  initialSablonlar: SablonOzet[]
  readonly: boolean
  projeId?: string | null
}) {
  const supabase = createClient()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const { firmaId: saFirmaId } = useFirma()
  const [taFirmaId] = useState<string | null>(initialFirmaId ?? null)
  const firmaId = base === '/sa' ? saFirmaId : taFirmaId
  const [sablonlar, setSablonlar] = useState<SablonOzet[]>(initialSablonlar)
  const [q, setQ] = useState('')
  const [durum, setDurum] = useState<'tum' | 'aktif' | 'pasif'>('tum')
  const [loading, setLoading] = useState(false)
  const [openForm, setOpenForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ baslik: '', tanim: '', aktif: true })
  const [maddeler, setMaddeler] = useState<MaddeForm[]>([emptyMadde(1)])

  // ── Bağla popup state ─────────────────────────────────────────────────────
  const [baglaInfo,    setBaglaInfo]    = useState<{ sablon: SablonOzet; asama: BaglaAsama } | null>(null)
  const [baglaLokList, setBaglaLokList] = useState<LokasyonRow[]>([])
  const [baglaGrupList, setBaglaGrupList] = useState<GrupRow[]>([])
  const [baglaLoading, setBaglaLoading] = useState(false)
  const [secilenLok,   setSecilenLok]   = useState<Set<string>>(new Set())
  const [secilenGrup,  setSecilenGrup]  = useState<string>('')
  const [lokArama,     setLokArama]     = useState('')
  const [lokUstFiltre, setLokUstFiltre] = useState('')

  function showError(message: string) {
    toast({ type: 'error', title: 'İşlem başarısız', message })
  }

  function showSuccess(message: string) {
    toast({ type: 'success', title: 'Başarılı', message })
  }

  async function refresh(fid: string) {
    setLoading(true)
    let q = supabase
      .from('checklist_sablonlari')
      .select('*')
      .eq('firma_id', fid)
      .order('guncelleme_tarihi', { ascending: false })
    if (projeId) q = (q as any).eq('proje_id', projeId)
    const { data, error } = await q

    if (error) {
      setLoading(false)
      showError(error.message)
      return
    }

    const sablonRows = (data ?? []) as any[]
    const ids = sablonRows.map(x => x.id)

    let maddeRows: any[] = []
    let lokasyonRows: any[] = []
    if (ids.length > 0) {
      const [mRes, lRes] = await Promise.all([
        supabase.from('checklist_sablon_maddeleri').select('id,sablon_id').in('sablon_id', ids),
        supabase.from('lokasyonlar').select('id,checklist_sablon_id').in('checklist_sablon_id', ids),
      ])
      if (mRes.error) showError(mRes.error.message)
      if (lRes.error) showError(lRes.error.message)
      maddeRows = mRes.data ?? []
      lokasyonRows = lRes.data ?? []
    }

    const maddeCount: Record<string, number> = {}
    for (const row of maddeRows) maddeCount[row.sablon_id] = (maddeCount[row.sablon_id] ?? 0) + 1
    const lokasyonCount: Record<string, number> = {}
    for (const row of lokasyonRows) lokasyonCount[row.checklist_sablon_id] = (lokasyonCount[row.checklist_sablon_id] ?? 0) + 1

    setSablonlar(
      sablonRows.map(row => ({
        ...row,
        madde_sayisi:    maddeCount[row.id]    ?? 0,
        kullanim_sayisi: lokasyonCount[row.id] ?? 0,
      }))
    )
    setLoading(false)
  }

  useEffect(() => {
    if (!firmaId) return
    refresh(firmaId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId])

  const filtered = useMemo(() => {
    return sablonlar.filter(item => {
      const matchesText  = !q.trim() || `${item.baslik} ${item.tanim}`.toLowerCase().includes(q.trim().toLowerCase())
      const matchesDurum = durum === 'tum' || (durum === 'aktif' ? item.aktif : !item.aktif)
      return matchesText && matchesDurum
    })
  }, [durum, q, sablonlar])

  // ── Bağla türev veriler ───────────────────────────────────────────────────

  // parent_id → children haritası (lokasyon ekranı için)
  const childrenByParent = useMemo(() => {
    const m: Record<string, LokasyonRow[]> = {}
    for (const l of baglaLokList) {
      if (l.parent_id) {
        if (!m[l.parent_id]) m[l.parent_id] = []
        m[l.parent_id].push(l)
      }
    }
    return m
  }, [baglaLokList])

  // ── LOKASYON EKRANI türevleri ─────────────────────────────────────────────
  // Seçilebilecek lokasyonlar: leaf nodelar (parent_id var, child yok)
  const lokasyonListe = useMemo(() =>
    baglaLokList.filter(l => l.parent_id !== null && (childrenByParent[l.id]?.length ?? 0) === 0),
    [baglaLokList, childrenByParent]
  )

  // Lokasyon ekranı filtre seçenekleri: lokasyonListe'nin benzersiz parent'ları
  const lokasyonUstFiltreler = useMemo(() => {
    const parentIds = new Set(lokasyonListe.map(l => l.parent_id).filter(Boolean) as string[])
    return baglaLokList.filter(l => parentIds.has(l.id))
  }, [baglaLokList, lokasyonListe])

  const filteredLokasyonlar = useMemo(() => lokasyonListe.filter(l => {
    if (lokUstFiltre && l.parent_id !== lokUstFiltre) return false
    if (lokArama && !l.tanim.toLowerCase().includes(lokArama.toLowerCase())) return false
    return true
  }), [lokasyonListe, lokUstFiltre, lokArama])

  // ── GRUP EKRANI türevleri (lokasyon_gruplari tablosundan) ──────────────────
  const grupUstFiltreler = useMemo(() => {
    const map = new Map<string, string>()
    for (const g of baglaGrupList) {
      if (g.ust_lokasyon_id && g.ust_lokasyon_tanim) {
        map.set(g.ust_lokasyon_id, g.ust_lokasyon_tanim)
      }
    }
    return Array.from(map.entries()).map(([id, tanim]) => ({ id, tanim })).sort((a, b) => a.tanim.localeCompare(b.tanim))
  }, [baglaGrupList])

  const filteredGruplar = useMemo(() =>
    baglaGrupList.filter(g => !lokUstFiltre || g.ust_lokasyon_id === lokUstFiltre),
    [baglaGrupList, lokUstFiltre]
  )

  // ── Form yardımcıları ─────────────────────────────────────────────────────
  function resetForm() {
    setEditingId(null)
    setForm({ baslik: '', tanim: '', aktif: true })
    setMaddeler([emptyMadde(1)])
  }

  function openCreate() {
    resetForm()
    setOpenForm(true)
  }

  async function openEdit(id: string) {
    setLoading(true)
    const { data: sablon, error: sErr } = await supabase
      .from('checklist_sablonlari')
      .select('*')
      .eq('id', id)
      .single()

    if (sErr || !sablon) {
      setLoading(false)
      showError(sErr?.message ?? 'Şablon bulunamadı')
      return
    }

    const { data: maddeRows, error: mErr } = await supabase
      .from('checklist_sablon_maddeleri')
      .select('*, checklist_madde_secenekleri(*)')
      .eq('sablon_id', id)
      .order('sira_no', { ascending: true })

    if (mErr) {
      setLoading(false)
      showError(mErr.message)
      return
    }

    setEditingId(id)
    setForm({ baslik: sablon.baslik ?? '', tanim: sablon.tanim ?? '', aktif: !!sablon.aktif })
    const mapped = (((maddeRows as any[]) ?? []).map((row, index) => ({
      id:                          row.id,
      localId:                     row.id,
      sira_no:                     row.sira_no ?? index + 1,
      baslik:                      row.baslik ?? '',
      zorunlu_cevap:               row.zorunlu_cevap !== false,
      aciklama_gerekli_yapilamadi: row.aciklama_gerekli_yapilamadi !== false,
      gorsel_gerekli:              !!row.gorsel_gerekli,
      secenekler: ((row.checklist_madde_secenekleri ?? []) as any[])
        .sort((a, b) => (a.sira_no ?? 0) - (b.sira_no ?? 0))
        .map(opt => ({ deger: opt.deger ?? '', aciklama_gerekli: opt.aciklama_gerekli ?? false }))
        .filter(x => x.deger),
    })) as MaddeForm[])
    setMaddeler(mapped.length ? mapped : [emptyMadde(1)])
    setOpenForm(true)
    setLoading(false)
  }

  function updateMadde(localId: string, patch: Partial<MaddeForm>) {
    setMaddeler(prev => prev.map(item => (item.localId === localId ? { ...item, ...patch } : item)))
  }

  function addMadde() {
    setMaddeler(prev => [...prev, emptyMadde(prev.length + 1)])
  }

  function removeMadde(localId: string) {
    setMaddeler(prev =>
      prev.filter(item => item.localId !== localId).map((item, index) => ({ ...item, sira_no: index + 1 }))
    )
  }

  // ── Kaydet ────────────────────────────────────────────────────────────────
  async function save() {
    if (!firmaId) return showError('Firma seçilmedi')
    if (!form.baslik.trim()) return showError('Başlık zorunludur')
    if (!form.tanim.trim()) return showError('Tanım zorunludur')
    if (maddeler.length === 0) return showError('En az bir madde olmalıdır')

    const temizMaddeler = maddeler.map((item, index) => ({
      ...item,
      sira_no:   index + 1,
      baslik:    item.baslik.trim(),
      secenekler: item.secenekler.map(x => ({ ...x, deger: x.deger.trim() })).filter(x => x.deger),
    }))

    if (!temizMaddeler[0]?.baslik) return showError('Madde 1 zorunludur')
    if (temizMaddeler.some(item => item.baslik.length === 0)) return showError('Boş madde başlığı bırakılamaz')
    if (temizMaddeler.some(item => item.secenekler.length === 0)) return showError('Her madde için en az bir dropdown seçeneği girilmelidir')

    // 15 — Bağlı lokasyonlara güncelleme uyarısı
    if (editingId) {
      const current = sablonlar.find(x => x.id === editingId)
      if ((current?.kullanim_sayisi ?? 0) > 0) {
        const ok = await confirm({
          title: 'Şablonu Güncelle',
          message: `Güncelleme bağlı olan tüm ${current!.kullanim_sayisi} lokasyona uygulanacak. Devam etmek istiyor musunuz?`,
          confirmText: 'Tamam',
          cancelText: 'İptal',
          variant: 'danger',
        })
        if (!ok) return
      }
    }

    setLoading(true)

    let sablonId = editingId
    let nextVersion = 1

    if (editingId) {
      const current = sablonlar.find(x => x.id === editingId)
      nextVersion = (current?.versiyon ?? 1) + 1
      const { error } = await supabase
        .from('checklist_sablonlari')
        .update({
          baslik:             form.baslik.trim(),
          tanim:              form.tanim.trim(),
          aktif:              form.aktif,
          versiyon:           nextVersion,
          guncelleme_tarihi:  new Date().toISOString(),
        })
        .eq('id', editingId)
      if (error) {
        setLoading(false)
        return showError(error.message)
      }

      const { data: mevcutMaddeler } = await supabase.from('checklist_sablon_maddeleri').select('id').eq('sablon_id', editingId)
      const mevcutIds  = new Set(((mevcutMaddeler ?? []) as any[]).map(x => x.id))
      const gelenIds   = new Set(temizMaddeler.map(x => x.id).filter(Boolean) as string[])
      const silinecekler = Array.from(mevcutIds).filter(id => !gelenIds.has(id))

      if (silinecekler.length) {
        await supabase.from('checklist_madde_secenekleri').delete().in('madde_id', silinecekler)
        await supabase.from('checklist_sablon_maddeleri').delete().in('id', silinecekler)
      }
    } else {
      const { data, error } = await supabase
        .from('checklist_sablonlari')
        .insert({
          firma_id: firmaId,
          baslik:   form.baslik.trim(),
          tanim:    form.tanim.trim(),
          aktif:    form.aktif,
          versiyon: 1,
          ...(projeId ? { proje_id: projeId } : {}),
        })
        .select('id')
        .single()
      if (error || !data) {
        setLoading(false)
        return showError(error?.message ?? 'Şablon kaydedilemedi')
      }
      sablonId = data.id
    }

    for (const item of temizMaddeler) {
      let maddeId = item.id
      if (maddeId) {
        const { error } = await supabase
          .from('checklist_sablon_maddeleri')
          .update({
            sira_no:                     item.sira_no,
            baslik:                      item.baslik,
            zorunlu_cevap:               item.zorunlu_cevap,
            aciklama_gerekli_yapilamadi: item.aciklama_gerekli_yapilamadi,
            gorsel_gerekli:              item.gorsel_gerekli,
          })
          .eq('id', maddeId)
        if (error) {
          setLoading(false)
          return showError(error.message)
        }
        await supabase.from('checklist_madde_secenekleri').delete().eq('madde_id', maddeId)
      } else {
        const { data, error } = await supabase
          .from('checklist_sablon_maddeleri')
          .insert({
            sablon_id:                   sablonId,
            sira_no:                     item.sira_no,
            baslik:                      item.baslik,
            zorunlu_cevap:               item.zorunlu_cevap,
            aciklama_gerekli_yapilamadi: item.aciklama_gerekli_yapilamadi,
            gorsel_gerekli:              item.gorsel_gerekli,
          })
          .select('id')
          .single()
        if (error || !data) {
          setLoading(false)
          return showError(error?.message ?? 'Madde eklenemedi')
        }
        maddeId = data.id
      }

      const optionPayload = item.secenekler.map((opt, idx) => ({ madde_id: maddeId, sira_no: idx + 1, deger: opt.deger, aciklama_gerekli: opt.aciklama_gerekli }))
      const { error: oErr } = await supabase.from('checklist_madde_secenekleri').insert(optionPayload)
      if (oErr) {
        setLoading(false)
        return showError(oErr.message)
      }
    }

    setOpenForm(false)
    resetForm()
    showSuccess(editingId ? 'Şablon güncellendi.' : 'Şablon oluşturuldu.')
    await refresh(firmaId)
    setLoading(false)
  }

  // ── Pasife Al / Aktifleştir — 12 ─────────────────────────────────────────
  async function toggleAktif(item: SablonOzet) {
    if (item.aktif) {
      const ok = await confirm({
        title: 'Pasife Al',
        message:
          'Bu işlem şablonu tüm lokasyonlardan temizler. Emin misiniz?\n\n' +
          'Çeklist şablonu aktife alınsa bile bu şablon sıfırlanmış olur. Aktif olmadan da tekrar kullanılamaz.',
        confirmText: 'Pasife Al',
        cancelText: 'İptal',
        variant: 'danger',
      })
      if (!ok) return
      setLoading(true)
      await supabase.from('lokasyonlar').update({ checklist_sablon_id: null }).eq('checklist_sablon_id', item.id)
      const { error } = await supabase
        .from('checklist_sablonlari')
        .update({ aktif: false, guncelleme_tarihi: new Date().toISOString() })
        .eq('id', item.id)
      if (error) showError(error.message)
      else showSuccess('Şablon pasife alındı ve lokasyonlardan temizlendi.')
    } else {
      setLoading(true)
      const { error } = await supabase
        .from('checklist_sablonlari')
        .update({ aktif: true, guncelleme_tarihi: new Date().toISOString() })
        .eq('id', item.id)
      if (error) showError(error.message)
      else showSuccess('Şablon aktifleştirildi.')
    }
    if (firmaId) await refresh(firmaId)
    setLoading(false)
  }

  // ── Kopyala — 16 (projeId fix) ────────────────────────────────────────────
  async function duplicateItem(item: SablonOzet) {
    setLoading(true)
    const { data: maddeRows, error } = await supabase
      .from('checklist_sablon_maddeleri')
      .select('*, checklist_madde_secenekleri(*)')
      .eq('sablon_id', item.id)
      .order('sira_no', { ascending: true })
    if (error) {
      setLoading(false)
      return showError(error.message)
    }

    const { data: yeni, error: yeniErr } = await supabase
      .from('checklist_sablonlari')
      .insert({
        firma_id: firmaId ?? item.firma_id,
        baslik:   `${item.baslik} (Kopya)`,
        tanim:    item.tanim,
        aktif:    false,
        versiyon: 1,
        ...(projeId ? { proje_id: projeId } : {}),
      })
      .select('id')
      .single()

    if (yeniErr || !yeni) {
      setLoading(false)
      return showError(yeniErr?.message ?? 'Kopya oluşturulamadı')
    }

    for (const row of (maddeRows as any[]) ?? []) {
      const { data: newItem, error: mErr } = await supabase
        .from('checklist_sablon_maddeleri')
        .insert({
          sablon_id:                   yeni.id,
          sira_no:                     row.sira_no,
          baslik:                      row.baslik,
          aciklama:                    null,
          zorunlu_cevap:               row.zorunlu_cevap,
          aciklama_gerekli_yapilamadi: row.aciklama_gerekli_yapilamadi,
          gorsel_gerekli:              row.gorsel_gerekli,
        })
        .select('id')
        .single()
      if (mErr || !newItem) {
        setLoading(false)
        return showError(mErr?.message ?? 'Madde kopyalanamadı')
      }
      const options = ((row.checklist_madde_secenekleri ?? []) as any[]).map((opt, index) => ({
        madde_id: newItem.id,
        sira_no:  index + 1,
        deger:    opt.deger,
        aciklama_gerekli: opt.aciklama_gerekli,
      }))
      if (options.length) {
        const { error: oErr } = await supabase.from('checklist_madde_secenekleri').insert(options)
        if (oErr) {
          setLoading(false)
          return showError(oErr.message)
        }
      }
    }

    showSuccess('Şablon kopyalandı.')
    if (firmaId) await refresh(firmaId)
    setLoading(false)
  }

  // ── Sil — 14 ─────────────────────────────────────────────────────────────
  async function deleteItem(item: SablonOzet) {
    const ok = await confirm({
      title:       'Şablon Sil',
      message:     'Bu çeklist tüm lokasyonlardan temizlenecek ve kalıcı olarak silinecek. Emin misiniz?',
      confirmText: 'Sil',
      cancelText:  'İptal',
      variant:     'danger',
    })
    if (!ok) return

    setLoading(true)
    const res = await fetch(`/api/checklist/sablon?id=${item.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!json.ok) showError(json.error ?? 'Şablon silinemedi.')
    else showSuccess('Şablon silindi.')
    if (firmaId) await refresh(firmaId)
    setLoading(false)
  }

  // ── Bağla — 13 ───────────────────────────────────────────────────────────
  async function openBagla(sablon: SablonOzet) {
    if (!sablon.aktif) {
      confirm({
        title: 'Bağlama Yapılamaz',
        message: 'Pasif şablona lokasyon bağlanamaz. Şablonu önce aktifleştirin.',
        confirmText: 'Anladım',
      })
      return
    }
    setBaglaLoading(true)
    setBaglaInfo({ sablon, asama: 'secim' })
    setSecilenLok(new Set())
    setSecilenGrup('')
    setLokArama('')
    setLokUstFiltre('')
    setBaglaLokList([])
    setBaglaGrupList([])
    const fid = firmaId ?? sablon.firma_id

    // ── Lokasyon ekranı verisi (projeye özgü, hiyerarşiyle) ─────────────────
    const LOK_SELECT = 'id, tanim, parent_id, proje_id, checklist_sablon_id, aktif'
    let leafQ = supabase.from('lokasyonlar').select(LOK_SELECT).eq('firma_id', fid).eq('aktif', true).order('tanim')
    if (projeId) leafQ = (leafQ as any).eq('proje_id', projeId)
    const { data: leafData } = await leafQ
    const leaves = (leafData ?? []) as LokasyonRow[]

    // Parent ve grandparent'ları çek (filtre için)
    const existingIds = new Set(leaves.map(l => l.id))
    const parentIds = [...new Set(leaves.map(l => l.parent_id).filter(Boolean) as string[])].filter(id => !existingIds.has(id))
    let parents: LokasyonRow[] = []
    if (parentIds.length > 0) {
      const { data: pData } = await supabase.from('lokasyonlar').select(LOK_SELECT).in('id', parentIds)
      parents = (pData ?? []) as LokasyonRow[]
    }
    const parentIdSet = new Set(parents.map(l => l.id))
    const gpIds = [...new Set(parents.map(l => l.parent_id).filter(Boolean) as string[])].filter(id => !existingIds.has(id) && !parentIdSet.has(id))
    let grandParents: LokasyonRow[] = []
    if (gpIds.length > 0) {
      const { data: gpData } = await supabase.from('lokasyonlar').select(LOK_SELECT).in('id', gpIds)
      grandParents = (gpData ?? []) as LokasyonRow[]
    }
    setBaglaLokList([...grandParents, ...parents, ...leaves])

    // ── Grup ekranı verisi (lokasyon_gruplari tablosundan) ───────────────────
    let grupQ = supabase.from('lokasyon_gruplari').select('id, ad, ust_lokasyon_id').eq('firma_id', fid).eq('aktif', true).order('ad')
    if (projeId) grupQ = (grupQ as any).eq('proje_id', projeId)
    const { data: grupData } = await grupQ
    const gruplar = (grupData ?? []) as { id: string; ad: string; ust_lokasyon_id: string | null }[]

    // Üye lokasyonlar
    const grupIds = gruplar.map(g => g.id)
    let uyeler: { grup_id: string; lokasyon_id: string }[] = []
    if (grupIds.length > 0) {
      const { data: uyeData } = await supabase.from('lokasyon_grup_uyeleri').select('grup_id, lokasyon_id').in('grup_id', grupIds)
      uyeler = (uyeData ?? []) as { grup_id: string; lokasyon_id: string }[]
    }

    // Üst lokasyon adlarını çek
    const ustIds = [...new Set(gruplar.map(g => g.ust_lokasyon_id).filter(Boolean) as string[])]
    let ustLokMap: Record<string, string> = {}
    if (ustIds.length > 0) {
      const { data: ustData } = await supabase.from('lokasyonlar').select('id, tanim').in('id', ustIds)
      for (const u of ustData ?? []) ustLokMap[(u as any).id] = (u as any).tanim
    }

    // grup_id → lokasyon_ids map
    const uyeMap: Record<string, string[]> = {}
    for (const u of uyeler) {
      if (!uyeMap[u.grup_id]) uyeMap[u.grup_id] = []
      uyeMap[u.grup_id].push(u.lokasyon_id)
    }

    setBaglaGrupList(gruplar.map(g => ({
      id:                g.id,
      ad:                g.ad,
      ust_lokasyon_id:   g.ust_lokasyon_id,
      ust_lokasyon_tanim: g.ust_lokasyon_id ? (ustLokMap[g.ust_lokasyon_id] ?? null) : null,
      lokasyon_ids:      uyeMap[g.id] ?? [],
    })))
    setBaglaLoading(false)
  }

  async function baglayiKaydet() {
    if (!baglaInfo) return
    if (baglaInfo.asama === 'lokasyon') {
      const ids = Array.from(secilenLok)
      if (ids.length === 0) return showError('En az bir lokasyon seçin')
      setLoading(true)
      const { error } = await supabase
        .from('lokasyonlar')
        .update({ checklist_sablon_id: baglaInfo.sablon.id })
        .in('id', ids)
      if (error) showError(error.message)
      else showSuccess(`${ids.length} lokasyona bağlandı.`)
    } else if (baglaInfo.asama === 'grup') {
      if (!secilenGrup) return showError('Bir grup seçin')
      const grup = baglaGrupList.find(g => g.id === secilenGrup)
      if (!grup || grup.lokasyon_ids.length === 0) return showError('Bu grubun lokasyonu yok')
      setLoading(true)
      const { error } = await supabase
        .from('lokasyonlar')
        .update({ checklist_sablon_id: baglaInfo.sablon.id })
        .in('id', grup.lokasyon_ids)
      if (error) showError(error.message)
      else showSuccess(`${grup.lokasyon_ids.length} lokasyona bağlandı.`)
    }
    setBaglaInfo(null)
    setSecilenLok(new Set())
    setSecilenGrup('')
    if (firmaId) await refresh(firmaId)
    setLoading(false)
  }

  function toggleLokSec(id: string) {
    setSecilenLok(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '24px 28px' }}>
      <div className="verde-card">
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #ffe8c8', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="verde-input" placeholder="Şablon ara..." value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 240 }} />
          <select className="verde-input" value={durum} onChange={e => setDurum(e.target.value as any)} style={{ maxWidth: 180 }}>
            <option value="tum">Tüm Durumlar</option>
            <option value="aktif">Aktif</option>
            <option value="pasif">Pasif</option>
          </select>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => firmaId && refresh(firmaId)} disabled={!firmaId || loading}>↻ Yenile</Button>
            {!readonly && <Button variant="primary" onClick={openCreate} disabled={!firmaId}>＋ Yeni Şablon</Button>}
          </div>
        </div>

        {!firmaId ? (
          <div style={{ padding: 42, textAlign: 'center', color: '#6b7f6b' }}>Şablonları görmek için firma seçin.</div>
        ) : (
          <div style={{ padding: 18 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #ffe8c8', color: '#557055' }}>
                    <th style={{ padding: '10px 8px' }}>Şablon</th>
                    <th style={{ padding: '10px 8px' }}>Madde</th>
                    <th style={{ padding: '10px 8px' }}>Lokasyon</th>
                    <th style={{ padding: '10px 8px' }}>Versiyon</th>
                    <th style={{ padding: '10px 8px' }}>Durum</th>
                    <th style={{ padding: '10px 8px' }}>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id} style={{ borderBottom: '1px solid #edf3ed' }}>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ fontWeight: 700, color: '#102110' }}>{item.baslik}</div>
                        <div style={{ fontSize: 12, color: '#8b7355', marginTop: 4 }}>{item.tanim}</div>
                      </td>
                      <td style={{ padding: '12px 8px' }}>{item.madde_sayisi ?? 0}</td>
                      <td style={{ padding: '12px 8px' }}>{item.kullanim_sayisi ?? 0}</td>
                      <td style={{ padding: '12px 8px' }}>v{item.versiyon ?? 1}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{
                          display: 'inline-flex', padding: '4px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700,
                          background: item.aktif ? '#ecfdf3' : '#fff7ed',
                          color:      item.aktif ? '#166534'  : '#b45309',
                          border:     item.aktif ? '1px solid #bbf7d0' : '1px solid #fed7aa',
                        }}>{item.aktif ? 'Aktif' : 'Pasif'}</span>
                      </td>
                      <td style={{ padding: '12px 8px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <RowActionButton onClick={() => openEdit(item.id)}>Düzenle</RowActionButton>
                          <RowActionButton variant="success" onClick={() => duplicateItem(item)}>Kopyala</RowActionButton>
                          {!readonly && (
                            <RowActionButton onClick={() => openBagla(item)}>Bağla</RowActionButton>
                          )}
                          <RowActionButton variant="warning" onClick={() => toggleAktif(item)}>
                            {item.aktif ? 'Pasife Al' : 'Aktifleştir'}
                          </RowActionButton>
                          {!readonly && (
                            <RowActionButton variant="danger" onClick={() => deleteItem(item)}>Sil</RowActionButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr><td colSpan={6} style={{ padding: 28, textAlign: 'center', color: '#718571' }}>Kayıt bulunamadı.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Şablon Form Modalı ── */}
      {openForm && !readonly && (
        <div onClick={() => setOpenForm(false)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.42)', overflowY: 'auto', padding: '40px 20px' }}>
          <div className="verde-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 980, margin: '0 auto', overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #ffe8c8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#102110' }}>{editingId ? 'Şablon Düzenle' : 'Yeni Checklist Şablonu'}</div>
                <div style={{ fontSize: 12, color: '#6b7f6b', marginTop: 4 }}>Başlık ve tanım zorunludur. İlk madde zorunludur. Her madde için dropdown seçenekleri yöneticiler tarafından tanımlanır.</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setOpenForm(false)}>✕</Button>
            </div>

            <div style={{ padding: 18, display: 'grid', gap: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label className="verde-label">Başlık *</label>
                  <input className="verde-input" value={form.baslik} onChange={e => setForm(prev => ({ ...prev, baslik: e.target.value }))} />
                </div>
                <div>
                  <label className="verde-label">Durum</label>
                  <select className="verde-input" value={form.aktif ? 'aktif' : 'pasif'} onChange={e => setForm(prev => ({ ...prev, aktif: e.target.value === 'aktif' }))}>
                    <option value="aktif">Aktif</option>
                    <option value="pasif">Pasif</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="verde-label">Tanım *</label>
                  <textarea className="verde-input" value={form.tanim} onChange={e => setForm(prev => ({ ...prev, tanim: e.target.value }))} rows={3} style={{ minHeight: 88 }} />
                </div>
              </div>

              <div className="verde-card" style={{ border: '1px solid #ffe8c8' }}>
                <div style={{ padding: '14px 16px', borderBottom: '1px solid #eef4ee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>Şablon Maddeleri</div>
                    <div style={{ fontSize: 12, color: '#708470', marginTop: 4 }}>Madde 1 zorunludur. Diğer maddeler isteğe bağlı olarak eklenebilir.</div>
                  </div>
                  <Button variant="primary" size="sm" onClick={addMadde}>＋ Madde Ekle</Button>
                </div>
                <div style={{ padding: 16, display: 'grid', gap: 16 }}>
                  {maddeler.map((madde, index) => (
                    <div key={madde.localId} style={{ border: '1px solid #e3ece3', borderRadius: 10, padding: 14, background: '#fbfdfb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <div style={{ fontWeight: 800 }}>Madde {index + 1}{index === 0 ? ' *' : ''}</div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <RowActionButton onClick={() => {
                            if (index === 0) return
                            setMaddeler(prev => { const arr = [...prev]; [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]]; return arr.map((item, i) => ({ ...item, sira_no: i + 1 })) })
                          }} disabled={index === 0}>↑</RowActionButton>
                          <RowActionButton onClick={() => {
                            if (index === maddeler.length - 1) return
                            setMaddeler(prev => { const arr = [...prev]; [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]]; return arr.map((item, i) => ({ ...item, sira_no: i + 1 })) })
                          }} disabled={index === maddeler.length - 1}>↓</RowActionButton>
                          <RowActionButton variant="danger" onClick={() => removeMadde(madde.localId)} disabled={index === 0 && maddeler.length === 1}>Sil</RowActionButton>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <label className="verde-label">Başlık {index === 0 ? '*' : ''}</label>
                          <input className="verde-input" value={madde.baslik} onChange={e => updateMadde(madde.localId, { baslik: e.target.value })} />
                        </div>
                        <div>
                          <label className="verde-label">Cevap Zorunluluğu</label>
                          <select className="verde-input" value={madde.zorunlu_cevap ? 'zorunlu' : 'opsiyonel'} onChange={e => updateMadde(madde.localId, { zorunlu_cevap: e.target.value === 'zorunlu' })}>
                            <option value="zorunlu">Zorunlu</option>
                            <option value="opsiyonel">İsteğe Bağlı</option>
                          </select>
                        </div>
                        <div>
                          <label className="verde-label">Görüntü Ekle</label>
                          <select className="verde-input" value={madde.gorsel_gerekli ? 'zorunlu' : 'opsiyonel'} onChange={e => updateMadde(madde.localId, { gorsel_gerekli: e.target.value === 'zorunlu' })}>
                            <option value="opsiyonel">İsteğe Bağlı</option>
                            <option value="zorunlu">Zorunlu</option>
                          </select>
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label className="verde-label">Dropdown Cevap Seçenekleri</label>
                          <div style={{ display: 'grid', gap: 8 }}>
                            {madde.secenekler.map((secenek, secenekIndex) => (
                              <div key={`${madde.localId}-opt-${secenekIndex}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                  className="verde-input"
                                  placeholder={`Seçenek ${secenekIndex + 1}`}
                                  value={secenek.deger}
                                  style={{ flex: 1 }}
                                  onChange={e => {
                                    const next = madde.secenekler.map((s, i) => i === secenekIndex ? { ...s, deger: e.target.value } : s)
                                    updateMadde(madde.localId, { secenekler: next })
                                  }}
                                />
                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#475569', whiteSpace: 'nowrap', cursor: 'pointer' }}>
                                  <input
                                    type="checkbox"
                                    checked={secenek.aciklama_gerekli}
                                    onChange={e => {
                                      const next = madde.secenekler.map((s, i) => i === secenekIndex ? { ...s, aciklama_gerekli: e.target.checked } : s)
                                      updateMadde(madde.localId, { secenekler: next })
                                    }}
                                  />
                                  Açıklama zorunlu
                                </label>
                                <RowActionButton variant="danger" disabled={madde.secenekler.length === 1} onClick={() => {
                                  const next = madde.secenekler.filter((_, i) => i !== secenekIndex)
                                  updateMadde(madde.localId, { secenekler: next.length ? next : [{ deger: 'Yapıldı', aciklama_gerekli: false }] })
                                }}>Sil</RowActionButton>
                              </div>
                            ))}
                            <div><Button variant="ghost" size="sm" onClick={() => updateMadde(madde.localId, { secenekler: [...madde.secenekler, { deger: '', aciklama_gerekli: false }] })}>＋ Seçenek Ekle</Button></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <Button variant="ghost" onClick={() => setOpenForm(false)}>İptal</Button>
                <Button variant="primary" onClick={save} disabled={loading}>{loading ? 'Kaydediliyor…' : 'Kaydet'}</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Bağla Modalı ── */}
      {baglaInfo && (
        <div
          onClick={() => setBaglaInfo(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div
            className="verde-card"
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Modal başlık */}
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #ffe8c8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#102110' }}>
                  {baglaInfo.asama === 'secim'   && 'Şablonu Bağla'}
                  {baglaInfo.asama === 'lokasyon' && 'Lokasyon Seç'}
                  {baglaInfo.asama === 'grup'     && 'Lokasyon Grubu Seç'}
                </div>
                <div style={{ fontSize: 12, color: '#6b7f6b', marginTop: 2 }}>{baglaInfo.sablon.baslik}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setBaglaInfo(null)}>✕</Button>
            </div>

            {baglaLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Lokasyonlar yükleniyor…</div>
            ) : (
              <>
                {/* ── Seçim aşaması ── */}
                {baglaInfo.asama === 'secim' && (
                  <div style={{ padding: 28, display: 'flex', gap: 16 }}>
                    <button
                      onClick={() => { setBaglaInfo(prev => prev ? { ...prev, asama: 'lokasyon' } : null); setLokUstFiltre(''); setLokArama('') }}
                      style={{ flex: 1, padding: '20px 14px', borderRadius: 12, border: '2px solid #ffd9a0', background: '#fff7ed', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#c45200', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 30 }}>📍</span>
                      Lokasyona Bağla
                      <span style={{ fontSize: 11, fontWeight: 400, color: '#6b7f6b', textAlign: 'center' }}>Birden fazla lokasyon seçin</span>
                    </button>
                    <button
                      onClick={() => { setBaglaInfo(prev => prev ? { ...prev, asama: 'grup' } : null); setLokUstFiltre('') }}
                      style={{ flex: 1, padding: '20px 14px', borderRadius: 12, border: '2px solid #ffd9a0', background: '#fff7ed', cursor: 'pointer', fontWeight: 700, fontSize: 14, color: '#c45200', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 30 }}>🗂️</span>
                      Lokasyon Grubuna Bağla
                      <span style={{ fontSize: 11, fontWeight: 400, color: '#6b7f6b', textAlign: 'center' }}>Grup altındaki tüm lokasyonlar</span>
                    </button>
                  </div>
                )}

                {/* ── Lokasyon seçim aşaması ── */}
                {baglaInfo.asama === 'lokasyon' && (
                  <>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid #ffe8c8', display: 'flex', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
                      <select
                        value={lokUstFiltre}
                        onChange={e => { setLokUstFiltre(e.target.value); setSecilenLok(new Set()) }}
                        style={{ height: 32, padding: '0 8px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, minWidth: 140 }}>
                        <option value="">Tüm Üst Lokasyonlar</option>
                        {lokasyonUstFiltreler.map(l => (
                          <option key={l.id} value={l.id}>{l.tanim}</option>
                        ))}
                      </select>
                      <input
                        placeholder="Lokasyon ara…"
                        value={lokArama}
                        onChange={e => setLokArama(e.target.value)}
                        style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, flex: 1, minWidth: 120 }}
                      />
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                      {filteredLokasyonlar.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Lokasyon bulunamadı</div>
                      ) : filteredLokasyonlar.map(l => {
                        const ustAdi     = l.parent_id ? baglaLokList.find(x => x.id === l.parent_id)?.tanim : null
                        const zatenBagli = l.checklist_sablon_id === baglaInfo.sablon.id
                        const baskaBagli = !!l.checklist_sablon_id && l.checklist_sablon_id !== baglaInfo.sablon.id
                        return (
                          <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 18px', cursor: 'pointer', background: secilenLok.has(l.id) ? '#fff7ed' : 'transparent', borderBottom: '1px solid #f1f5f1' }}>
                            <input type="checkbox" checked={secilenLok.has(l.id)} onChange={() => toggleLokSec(l.id)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#102110' }}>
                                {ustAdi ? <span style={{ color: '#6b7f6b' }}>{ustAdi} / </span> : null}{l.tanim}
                              </div>
                              {zatenBagli && <div style={{ fontSize: 11, color: '#16a34a', marginTop: 2 }}>✓ Bu şablona zaten bağlı</div>}
                              {baskaBagli && <div style={{ fontSize: 11, color: '#f59e0b', marginTop: 2 }}>⚠ Başka bir şablona bağlı</div>}
                            </div>
                          </label>
                        )
                      })}
                    </div>
                    <div style={{ padding: '12px 18px', borderTop: '1px solid #ffe8c8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: '#64748b' }}>{secilenLok.size} lokasyon seçili</span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button variant="ghost" size="sm" onClick={() => setBaglaInfo(prev => prev ? { ...prev, asama: 'secim' } : null)}>← Geri</Button>
                        <Button variant="primary" size="sm" onClick={baglayiKaydet} disabled={secilenLok.size === 0 || loading}>
                          {loading ? 'Bağlanıyor…' : `Bağla (${secilenLok.size})`}
                        </Button>
                      </div>
                    </div>
                  </>
                )}

                {/* ── Grup seçim aşaması ── */}
                {baglaInfo.asama === 'grup' && (
                  <>
                    <div style={{ padding: '12px 18px', borderBottom: '1px solid #ffe8c8', flexShrink: 0 }}>
                      <select
                        value={lokUstFiltre}
                        onChange={e => { setLokUstFiltre(e.target.value); setSecilenGrup('') }}
                        style={{ height: 32, padding: '0 8px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, width: '100%' }}>
                        <option value="">Tüm Üst Lokasyonlar</option>
                        {grupUstFiltreler.map(l => (
                          <option key={l.id} value={l.id}>{l.tanim}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{ overflowY: 'auto', flex: 1 }}>
                      {filteredGruplar.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Grup bulunamadı</div>
                      ) : filteredGruplar.map(g => (
                        <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', cursor: 'pointer', background: secilenGrup === g.id ? '#fff7ed' : 'transparent', borderBottom: '1px solid #f1f5f1' }}>
                          <input type="radio" name="grup" checked={secilenGrup === g.id} onChange={() => setSecilenGrup(g.id)} style={{ width: 16, height: 16, flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#102110' }}>{g.ad}</div>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{g.lokasyon_ids.length} lokasyon</div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div style={{ padding: '12px 18px', borderTop: '1px solid #ffe8c8', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: '#64748b' }}>
                        {secilenGrup
                          ? `${baglaGrupList.find(g => g.id === secilenGrup)?.lokasyon_ids.length ?? 0} lokasyon bağlanacak`
                          : 'Bir grup seçin'}
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button variant="ghost" size="sm" onClick={() => setBaglaInfo(prev => prev ? { ...prev, asama: 'secim' } : null)}>← Geri</Button>
                        <Button variant="primary" size="sm" onClick={baglayiKaydet} disabled={!secilenGrup || loading}>
                          {loading ? 'Bağlanıyor…' : 'Bağla'}
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
