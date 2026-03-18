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
  secenekler: string[]
}

function emptyMadde(index: number): MaddeForm {
  return {
    localId: `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    sira_no: index,
    baslik: '',
    zorunlu_cevap: true,
    aciklama_gerekli_yapilamadi: true,
    gorsel_gerekli: false,
    secenekler: ['Yapıldı', 'Yapılamadı'],
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
        madde_sayisi: maddeCount[row.id] ?? 0,
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
      const matchesText = !q.trim() || `${item.baslik} ${item.tanim}`.toLowerCase().includes(q.trim().toLowerCase())
      const matchesDurum = durum === 'tum' || (durum === 'aktif' ? item.aktif : !item.aktif)
      return matchesText && matchesDurum
    })
  }, [durum, q, sablonlar])

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
      id: row.id,
      localId: row.id,
      sira_no: row.sira_no ?? index + 1,
      baslik: row.baslik ?? '',
      zorunlu_cevap: row.zorunlu_cevap !== false,
      aciklama_gerekli_yapilamadi: row.aciklama_gerekli_yapilamadi !== false,
      gorsel_gerekli: !!row.gorsel_gerekli,
      secenekler: ((row.checklist_madde_secenekleri ?? []) as any[])
        .sort((a, b) => (a.sira_no ?? 0) - (b.sira_no ?? 0))
        .map(opt => opt.deger)
        .filter(Boolean),
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
    setMaddeler(prev => prev.filter(item => item.localId !== localId).map((item, index) => ({ ...item, sira_no: index + 1 })))
  }

  async function save() {
    if (!firmaId) return showError('Firma seçilmedi')
    if (!form.baslik.trim()) return showError('Başlık zorunludur')
    if (!form.tanim.trim()) return showError('Tanım zorunludur')
    if (maddeler.length === 0) return showError('En az bir madde olmalıdır')

    const temizMaddeler = maddeler.map((item, index) => ({
      ...item,
      sira_no: index + 1,
      baslik: item.baslik.trim(),
      secenekler: item.secenekler.map(x => x.trim()).filter(Boolean),
    }))

    if (!temizMaddeler[0]?.baslik) return showError('Madde 1 zorunludur')
    if (temizMaddeler.some(item => item.baslik.length === 0)) return showError('Boş madde başlığı bırakılamaz')
    if (temizMaddeler.some(item => item.secenekler.length === 0)) return showError('Her madde için en az bir dropdown seçeneği girilmelidir')

    setLoading(true)

    let sablonId = editingId
    let nextVersion = 1

    if (editingId) {
      const current = sablonlar.find(x => x.id === editingId)
      nextVersion = (current?.versiyon ?? 1) + 1
      const { error } = await supabase
        .from('checklist_sablonlari')
        .update({
          baslik: form.baslik.trim(),
          tanim: form.tanim.trim(),
          aktif: form.aktif,
          versiyon: nextVersion,
          guncelleme_tarihi: new Date().toISOString(),
        })
        .eq('id', editingId)
      if (error) {
        setLoading(false)
        return showError(error.message)
      }

      const { data: mevcutMaddeler } = await supabase.from('checklist_sablon_maddeleri').select('id').eq('sablon_id', editingId)
      const mevcutIds = new Set(((mevcutMaddeler ?? []) as any[]).map(x => x.id))
      const gelenIds = new Set(temizMaddeler.map(x => x.id).filter(Boolean) as string[])
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
          baslik: form.baslik.trim(),
          tanim: form.tanim.trim(),
          aktif: form.aktif,
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
            sira_no: item.sira_no,
            baslik: item.baslik,
            zorunlu_cevap: item.zorunlu_cevap,
            aciklama_gerekli_yapilamadi: item.aciklama_gerekli_yapilamadi,
            gorsel_gerekli: item.gorsel_gerekli,
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
            sablon_id: sablonId,
            sira_no: item.sira_no,
            baslik: item.baslik,
            zorunlu_cevap: item.zorunlu_cevap,
            aciklama_gerekli_yapilamadi: item.aciklama_gerekli_yapilamadi,
            gorsel_gerekli: item.gorsel_gerekli,
          })
          .select('id')
          .single()
        if (error || !data) {
          setLoading(false)
          return showError(error?.message ?? 'Madde eklenemedi')
        }
        maddeId = data.id
      }

      const optionPayload = item.secenekler.map((deger, idx) => ({ madde_id: maddeId, sira_no: idx + 1, deger }))
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

  async function toggleAktif(item: SablonOzet) {
    setLoading(true)
    const { error } = await supabase
      .from('checklist_sablonlari')
      .update({ aktif: !item.aktif, guncelleme_tarihi: new Date().toISOString() })
      .eq('id', item.id)
    if (error) showError(error.message)
    else showSuccess(item.aktif ? 'Şablon pasife alındı.' : 'Şablon aktifleştirildi.')
    if (firmaId) await refresh(firmaId)
    setLoading(false)
  }

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
        firma_id: item.firma_id,
        baslik: `${item.baslik} (Kopya)`,
        tanim: item.tanim,
        aktif: false,
        versiyon: 1,
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
          sablon_id: yeni.id,
          sira_no: row.sira_no,
          baslik: row.baslik,
          aciklama: null,
          zorunlu_cevap: row.zorunlu_cevap,
          aciklama_gerekli_yapilamadi: row.aciklama_gerekli_yapilamadi,
          gorsel_gerekli: row.gorsel_gerekli,
        })
        .select('id')
        .single()
      if (mErr || !newItem) {
        setLoading(false)
        return showError(mErr?.message ?? 'Madde kopyalanamadı')
      }
      const options = ((row.checklist_madde_secenekleri ?? []) as any[]).map((opt, index) => ({
        madde_id: newItem.id,
        sira_no: index + 1,
        deger: opt.deger,
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

  async function deleteItem(item: SablonOzet) {
    if ((item.kullanim_sayisi ?? 0) > 0) {
      return showError('Bu şablon lokasyonlarda kullanılıyor. Önce pasife alın veya lokasyonlardan kaldırın.')
    }
    const ok = await confirm({
      title: 'Şablon Sil',
      message: 'Bu şablon kalıcı olarak silinecek. Emin misiniz?',
      confirmText: 'Sil',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return

    setLoading(true)
    const { data: itemRows } = await supabase.from('checklist_sablon_maddeleri').select('id').eq('sablon_id', item.id)
    const ids = ((itemRows ?? []) as any[]).map(x => x.id)
    if (ids.length) {
      await supabase.from('checklist_madde_secenekleri').delete().in('madde_id', ids)
      await supabase.from('checklist_sablon_maddeleri').delete().in('id', ids)
    }
    const { error } = await supabase.from('checklist_sablonlari').delete().eq('id', item.id)
    if (error) showError(error.message)
    else showSuccess('Şablon silindi.')
    if (firmaId) await refresh(firmaId)
    setLoading(false)
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <div className="verde-card">
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e8f0e8', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid #e8f0e8', color: '#557055' }}>
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
                        <div style={{ fontSize: 12, color: '#6f846f', marginTop: 4 }}>{item.tanim}</div>
                      </td>
                      <td style={{ padding: '12px 8px' }}>{item.madde_sayisi ?? 0}</td>
                      <td style={{ padding: '12px 8px' }}>{item.kullanim_sayisi ?? 0}</td>
                      <td style={{ padding: '12px 8px' }}>v{item.versiyon ?? 1}</td>
                      <td style={{ padding: '12px 8px' }}>
                        <span style={{ display: 'inline-flex', padding: '4px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: item.aktif ? '#ecfdf3' : '#fff7ed', color: item.aktif ? '#166534' : '#b45309', border: item.aktif ? '1px solid #bbf7d0' : '1px solid #fed7aa' }}>{item.aktif ? 'Aktif' : 'Pasif'}</span>
                      </td>
                      <td style={{ padding: '12px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <RowActionButton onClick={() => openEdit(item.id)}>Düzenle</RowActionButton>
                        <RowActionButton variant="success" onClick={() => duplicateItem(item)}>Kopyala</RowActionButton>
                        <RowActionButton variant="warning" onClick={() => toggleAktif(item)}>{item.aktif ? 'Pasife Al' : 'Aktifleştir'}</RowActionButton>
                        <RowActionButton variant="danger" onClick={() => deleteItem(item)}>Sil</RowActionButton>
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

      {openForm && !readonly && (
        <div onClick={() => setOpenForm(false)} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.42)', overflowY: 'auto', padding: '40px 20px' }}>
          <div className="verde-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 980, margin: '0 auto', overflow: 'hidden' }}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #e8f0e8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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

              <div className="verde-card" style={{ border: '1px solid #e8f0e8' }}>
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
                          <label className="verde-label">“Yapılamadı” seçilince açıklama</label>
                          <select className="verde-input" value={madde.aciklama_gerekli_yapilamadi ? 'zorunlu' : 'opsiyonel'} onChange={e => updateMadde(madde.localId, { aciklama_gerekli_yapilamadi: e.target.value === 'zorunlu' })}>
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
                              <div key={`${madde.localId}-opt-${secenekIndex}`} style={{ display: 'flex', gap: 8 }}>
                                <input className="verde-input" placeholder={`Seçenek ${secenekIndex + 1}`} value={secenek} onChange={e => {
                                  const next = [...madde.secenekler]
                                  next[secenekIndex] = e.target.value
                                  updateMadde(madde.localId, { secenekler: next })
                                }} />
                                <RowActionButton variant="danger" disabled={madde.secenekler.length === 1} onClick={() => {
                                  const next = madde.secenekler.filter((_, i) => i !== secenekIndex)
                                  updateMadde(madde.localId, { secenekler: next.length ? next : ['Yapıldı'] })
                                }}>Sil</RowActionButton>
                              </div>
                            ))}
                            <div><Button variant="ghost" size="sm" onClick={() => updateMadde(madde.localId, { secenekler: [...madde.secenekler, ''] })}>＋ Seçenek Ekle</Button></div>
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
    </div>
  )
}
