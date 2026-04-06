
'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import type { Firma, Lokasyon } from '@/types'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { useFirma } from '@/components/layout/FirmaContext'

type ChecklistItemForm = { id?: string; sira: number; madde: string; zorunlu: boolean }
type ChecklistTemplateRow = {
  id: string
  lokasyon_id: string
  isim: string
  kayit_tarihi?: string | null
  checklist_items?: ChecklistItemForm[]
}

export default function ChecklistYonetimClient({
  base,
  initialFirmaId,
  initialLokasyonlar,
  initialTemplates,
  readonly,
}: {
  base: '/sa' | '/ta'
  initialFirmaId?: string | null
  initialLokasyonlar: Lokasyon[]
  initialTemplates: ChecklistTemplateRow[]
  readonly: boolean
}) {
  const supabase = createClient()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const { firmaId: saFirmaId } = useFirma()
  const [tenantFirmaId] = useState<string | null>(initialFirmaId ?? null)
  const firmaId = base === '/sa' ? saFirmaId : tenantFirmaId
  const [lokasyonlar, setLokasyonlar] = useState<Lokasyon[]>(initialLokasyonlar)
  const [templates, setTemplates] = useState<ChecklistTemplateRow[]>(normalizeTemplates(initialTemplates))
  const [selectedLokasyonId, setSelectedLokasyonId] = useState<string>('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [openForm, setOpenForm] = useState(false)
  const [editing, setEditing] = useState<ChecklistTemplateRow | null>(null)
  const [isim, setIsim] = useState('')
  const [items, setItems] = useState<ChecklistItemForm[]>([{ sira: 1, madde: '', zorunlu: true }])

  useEffect(() => {
    if (!firmaId) return
    void refresh(firmaId)
  }, [firmaId])

  async function refresh(fid: string) {
    setLoading(true)
    try {
      const [locRes, tplRes] = await Promise.all([
        supabase.from('lokasyonlar').select('*').eq('firma_id', fid).order('kayit_tarihi', { ascending: true }),
        supabase
          .from('checklist_templates')
          .select('id,lokasyon_id,isim,kayit_tarihi,checklist_items(id,sira,madde,zorunlu)')
          .order('kayit_tarihi', { ascending: false }),
      ])
      if (locRes.error) throw new Error(locRes.error.message)
      if (tplRes.error) throw new Error(tplRes.error.message)
      setLokasyonlar((locRes.data as any) ?? [])
      setTemplates(normalizeTemplates((tplRes.data as any) ?? []))
    } catch (e: any) {
      toast({ type: 'error', title: 'Yüklenemedi', message: e?.message ?? 'Checklist verileri alınamadı.' })
    } finally {
      setLoading(false)
    }
  }

  const lokasyonMap = useMemo(() => Object.fromEntries(lokasyonlar.map((l) => [l.id, l])), [lokasyonlar])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const all = lokasyonlar.map((lokasyon) => {
      const template = templates.find((t) => t.lokasyon_id === lokasyon.id) ?? null
      return { lokasyon, template }
    })
    if (!needle) return all
    return all.filter(({ lokasyon, template }) => {
      return [lokasyon.tanim, lokasyon.aciklama, template?.isim]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    })
  }, [lokasyonlar, templates, q])

  function openCreate(lokasyonId?: string) {
    setEditing(null)
    setSelectedLokasyonId(lokasyonId ?? '')
    const lokasyon = lokasyonId ? lokasyonMap[lokasyonId] : null
    setIsim(lokasyon ? `${lokasyon.tanim} Checklist` : '')
    setItems([{ sira: 1, madde: '', zorunlu: true }])
    setOpenForm(true)
  }

  function openEdit(template: ChecklistTemplateRow) {
    setEditing(template)
    setSelectedLokasyonId(template.lokasyon_id)
    setIsim(template.isim)
    setItems(
      (template.checklist_items?.length
        ? template.checklist_items
        : [{ sira: 1, madde: '', zorunlu: true }]
      ).map((item, index) => ({
        id: item.id,
        sira: index + 1,
        madde: item.madde,
        zorunlu: !!item.zorunlu,
      }))
    )
    setOpenForm(true)
  }

  function patchItem(index: number, patch: Partial<ChecklistItemForm>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)).map((item, i) => ({ ...item, sira: i + 1 })))
  }

  function addItem() {
    setItems((prev) => [...prev, { sira: prev.length + 1, madde: '', zorunlu: true }])
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, sira: i + 1 })))
  }

  async function save() {
    if (!selectedLokasyonId) {
      toast({ type: 'error', title: 'Eksik alan', message: 'Lokasyon seçmelisiniz.' })
      return
    }
    const cleanName = isim.trim()
    if (!cleanName) {
      toast({ type: 'error', title: 'Eksik alan', message: 'Checklist adı zorunlu.' })
      return
    }
    const cleanItems = items
      .map((item, index) => ({ ...item, sira: index + 1, madde: item.madde.trim() }))
      .filter((item) => item.madde)
    if (!cleanItems.length) {
      toast({ type: 'error', title: 'Eksik alan', message: 'En az bir checklist maddesi gerekli.' })
      return
    }

    setLoading(true)
    try {
      let templateId = editing?.id ?? null
      if (editing) {
        const { error: updateTemplateError } = await supabase
          .from('checklist_templates')
          .update({ isim: cleanName, lokasyon_id: selectedLokasyonId })
          .eq('id', editing.id)
        if (updateTemplateError) throw new Error(updateTemplateError.message)

        const { error: clearItemsError } = await supabase
          .from('checklist_items')
          .delete()
          .eq('template_id', editing.id)
        if (clearItemsError) throw new Error(clearItemsError.message)
      } else {
        const { data: inserted, error: createTemplateError } = await supabase
          .from('checklist_templates')
          .insert({ lokasyon_id: selectedLokasyonId, isim: cleanName })
          .select('id')
          .single()
        if (createTemplateError || !inserted) throw new Error(createTemplateError?.message ?? 'Checklist oluşturulamadı')
        templateId = (inserted as any).id
      }

      const { error: insertItemsError } = await supabase.from('checklist_items').insert(
        cleanItems.map((item) => ({
          template_id: templateId,
          sira: item.sira,
          madde: item.madde,
          zorunlu: item.zorunlu,
        })) as any
      )
      if (insertItemsError) throw new Error(insertItemsError.message)

      const { error: bindLocationError } = await supabase
        .from('lokasyonlar')
        .update({ checklist_template_id: templateId })
        .eq('id', selectedLokasyonId)
      if (bindLocationError) throw new Error(bindLocationError.message)

      toast({ type: 'success', title: 'Başarılı', message: editing ? 'Checklist güncellendi.' : 'Checklist oluşturuldu.' })
      setOpenForm(false)
      await refresh(firmaId!)
    } catch (e: any) {
      toast({ type: 'error', title: 'Kaydedilemedi', message: e?.message ?? 'Checklist kaydedilemedi.' })
    } finally {
      setLoading(false)
    }
  }

  async function removeTemplate(template: ChecklistTemplateRow) {
    const ok = await confirm({
      title: 'Checklist silinsin mi?',
      message: 'Bu işlem checklist maddelerini de kaldırır. Lokasyon bağlantısı temizlenir.',
      confirmText: 'Sil',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return

    setLoading(true)
    try {
      const { error: unbindError } = await supabase
        .from('lokasyonlar')
        .update({ checklist_template_id: null })
        .eq('id', template.lokasyon_id)
      if (unbindError) throw new Error(unbindError.message)

      const { error: deleteError } = await supabase.from('checklist_templates').delete().eq('id', template.id)
      if (deleteError) throw new Error(deleteError.message)

      toast({ type: 'success', title: 'Başarılı', message: 'Checklist silindi.' })
      await refresh(firmaId!)
    } catch (e: any) {
      toast({ type: 'error', title: 'Silinemedi', message: e?.message ?? 'Checklist silinemedi.' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <div className="verde-card">
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #ffe8c8', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="verde-input" placeholder="Lokasyon veya checklist ara..." value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" onClick={() => firmaId && refresh(firmaId)} disabled={loading || !firmaId}>{loading ? 'Yükleniyor…' : '↻ Yenile'}</Button>
            {!readonly ? <Button variant="primary" onClick={() => openCreate() } disabled={!firmaId}>＋ Checklist Ekle</Button> : null}
          </div>
        </div>

        {!firmaId && base === '/sa' ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#9a7b6a' }}>Checklistleri görmek için firma seçin.</div>
        ) : (
          <div style={{ padding: 18, display: 'grid', gap: 12 }}>
            {!rows.length ? (
              <div style={{ color: '#9a7b6a' }}>Bu firmada henüz lokasyon veya checklist bulunamadı.</div>
            ) : rows.map(({ lokasyon, template }) => (
              <div key={lokasyon.id} style={{ border: '1px solid #ffd9a0', borderRadius: 12, padding: 14, background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 800, color: '#3d1c00' }}>{lokasyon.tanim}</div>
                    <div style={{ fontSize: 12, color: '#9a7b6a', marginTop: 4 }}>{template ? `Checklist: ${template.isim}` : 'Checklist bağlı değil'}</div>
                    {template?.checklist_items?.length ? (
                      <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
                        {template.checklist_items.map((item) => (
                          <div key={item.id || `${template.id}-${item.sira}`} style={{ fontSize: 12.5, color: '#234023' }}>
                            {item.sira}. {item.madde} {item.zorunlu ? <span className="verde-badge status-acik">Zorunlu</span> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {!readonly ? (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {template ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(template)}>Düzenle</Button>
                          <Button variant="danger" size="sm" onClick={() => removeTemplate(template)}>Sil</Button>
                        </>
                      ) : (
                        <Button variant="primary" size="sm" onClick={() => openCreate(lokasyon.id)}>Checklist Oluştur</Button>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {openForm ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setOpenForm(false)}>
          <div className="verde-card" style={{ width: 760, maxWidth: 'calc(100vw - 32px)', padding: 0, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #ffe8c8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#3d1c00' }}>{editing ? 'Checklist Düzenle' : 'Checklist Ekle'}</div>
              <Button variant="ghost" size="sm" onClick={() => setOpenForm(false)}>✕</Button>
            </div>
            <div style={{ padding: 18, display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="verde-label">Lokasyon *</label>
                  <select className="verde-input" value={selectedLokasyonId} onChange={(e) => setSelectedLokasyonId(e.target.value)}>
                    <option value="">Lokasyon seçin...</option>
                    {lokasyonlar.map((lokasyon) => (
                      <option key={lokasyon.id} value={lokasyon.id}>{lokasyon.tanim}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="verde-label">Checklist Adı *</label>
                  <input className="verde-input" value={isim} onChange={(e) => setIsim(e.target.value)} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div className="verde-label">Checklist Maddeleri</div>
                  <Button variant="ghost" size="sm" onClick={addItem}>＋ Madde Ekle</Button>
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {items.map((item, index) => (
                    <div key={item.id || index} style={{ border: '1px solid #ffd9a0', borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                        <div style={{ fontSize: 12, color: '#9a7b6a' }}>Madde #{index + 1}</div>
                        <Button variant="danger" size="sm" onClick={() => removeItem(index)} disabled={items.length === 1}>Sil</Button>
                      </div>
                      <input className="verde-input" placeholder="Madde açıklaması" value={item.madde} onChange={(e) => patchItem(index, { madde: e.target.value })} />
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <input type="checkbox" checked={item.zorunlu} onChange={(e) => patchItem(index, { zorunlu: e.target.checked })} />
                        <span>Zorunlu madde</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="ghost" onClick={() => setOpenForm(false)} disabled={loading}>İptal</Button>
                <Button variant="primary" onClick={save} disabled={loading}>{loading ? 'Kaydediliyor...' : 'Kaydet'}</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function normalizeTemplates(data: ChecklistTemplateRow[]) {
  return (data ?? []).map((template: any) => ({
    ...template,
    checklist_items: ((template?.checklist_items as any[]) ?? []).sort((a, b) => (a.sira ?? 0) - (b.sira ?? 0)),
  }))
}
