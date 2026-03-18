'use client'

import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Pencil, Trash2, Plus, Layers } from 'lucide-react'

type Proje = {
  id: string
  firma_id: string
  ad: string
  aciklama?: string | null
  renk: string
  aktif: boolean
  kayit_tarihi: string
}

const RENKLER = ['#2e8b2e', '#1d6fa8', '#9333ea', '#c2410c', '#0e7490', '#be185d', '#b45309', '#374151']

const BOSH: Omit<Proje, 'id' | 'firma_id' | 'kayit_tarihi'> = {
  ad: '', aciklama: '', renk: '#2e8b2e', aktif: true
}

export default function ProjelerClient({
  firmaId,
  readonly = false,
  isSA = false,
}: {
  firmaId: string | null
  readonly?: boolean
  isSA?: boolean
}) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [projeler, setProjeler] = useState<Proje[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...BOSH })

  const fetchProjeler = useCallback(async () => {
    if (!firmaId) { setLoading(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/projeler?firma_id=${firmaId}`)
      const data = await res.json()
      setProjeler(Array.isArray(data) ? data : [])
    } catch {
      toast({ type: 'error', title: 'Hata', message: 'Projeler yüklenemedi' })
    } finally {
      setLoading(false)
    }
  }, [firmaId])

  useEffect(() => { fetchProjeler() }, [fetchProjeler])

  function openCreate() {
    setForm({ ...BOSH })
    setEditId(null)
    setModal('create')
  }

  function openEdit(p: Proje) {
    setForm({ ad: p.ad, aciklama: p.aciklama ?? '', renk: p.renk, aktif: p.aktif })
    setEditId(p.id)
    setModal('edit')
  }

  async function save() {
    if (!form.ad.trim()) return toast({ type: 'error', title: 'Hata', message: 'Proje adı zorunlu' })
    setSaving(true)
    try {
      const url = modal === 'edit' && editId ? `/api/projeler/${editId}` : '/api/projeler'
      const method = modal === 'edit' ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, firma_id: firmaId }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Kayıt başarısız')
      }
      toast({ type: 'success', title: 'Kaydedildi', message: modal === 'edit' ? 'Proje güncellendi' : 'Proje oluşturuldu' })
      setModal(null)
      fetchProjeler()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setSaving(false)
    }
  }

  async function del(p: Proje) {
    const ok = await confirm({
      title: 'Projeyi Sil',
      message: `"${p.ad}" projesi silinecek. Projeye bağlı tüm kayıtlar (lokasyon, görev vb.) projesiz kalır, silinmez. Devam edilsin mi?`,
     confirmText: 'Sil',
cancelText: 'Vazgeç',
variant: 'danger'
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/projeler/${p.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      toast({ type: 'success', title: 'Silindi', message: `"${p.ad}" projesi silindi` })
      fetchProjeler()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
  }

  async function toggleAktif(p: Proje) {
    try {
      await fetch(`/api/projeler/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aktif: !p.aktif }),
      })
      fetchProjeler()
    } catch {
      toast({ type: 'error', title: 'Hata', message: 'Güncellenemedi' })
    }
  }

  const aktifler = projeler.filter(p => p.aktif)
  const pasifler = projeler.filter(p => !p.aktif)

  return (
    <div className="verde-card" style={{ padding: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f0f9f0', border: '1px solid #d6e4d6', display: 'grid', placeItems: 'center', color: '#1f6b1f' }}>
          <Layers size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#0f1a0f' }}>PROJELER</div>
          <div style={{ fontSize: 13, color: '#7a907a', marginTop: 1 }}>
            {aktifler.length} aktif • {pasifler.length} pasif
          </div>
        </div>
        {!readonly && (
          <button
            onClick={openCreate}
            className="verde-btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={16} /> Yeni Proje
          </button>
        )}
      </div>

      {/* Liste */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#7a907a' }}>
          <span className="verde-spinner" style={{ display: 'inline-block', marginBottom: 8 }} />
          <div>Yükleniyor…</div>
        </div>
      ) : projeler.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#7a907a' }}>
          <Layers size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
          <div style={{ fontSize: 15, fontWeight: 600 }}>Henüz proje yok</div>
          {!readonly && <div style={{ fontSize: 13, marginTop: 6 }}>İlk projeyi oluşturmak için "Yeni Proje" butonuna tıklayın</div>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {projeler.map(p => (
            <div key={p.id} style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr auto',
              alignItems: 'center', gap: 14, padding: '12px 16px',
              borderRadius: 10, border: `1px solid ${p.aktif ? '#d6e4d6' : '#e8e8e8'}`,
              background: p.aktif ? '#fff' : '#fafafa',
              opacity: p.aktif ? 1 : 0.7,
            }}>
              {/* Renk + ikon */}
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${p.renk}18`, border: `2px solid ${p.renk}40`, display: 'grid', placeItems: 'center' }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: p.renk }} />
              </div>

              {/* Bilgi */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#0f1a0f' }}>{p.ad}</span>
                  {!p.aktif && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#f3f4f6', color: '#6b7280', fontWeight: 600 }}>Pasif</span>
                  )}
                </div>
                {p.aciklama && <div style={{ fontSize: 12.5, color: '#7a907a', marginTop: 2 }}>{p.aciklama}</div>}
                <div style={{ fontSize: 11.5, color: '#a0b4a0', marginTop: 3 }}>
                  {new Date(p.kayit_tarihi).toLocaleDateString('tr-TR')} tarihinde oluşturuldu
                </div>
              </div>

              {/* İşlemler */}
              {!readonly && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Aktif/Pasif toggle */}
                  <button
                    onClick={() => toggleAktif(p)}
                    style={{
                      padding: '5px 12px', borderRadius: 6, border: '1px solid #d6e4d6',
                      background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      color: p.aktif ? '#b45309' : '#2e8b2e',
                    }}
                  >
                    {p.aktif ? 'Pasife Al' : 'Aktife Al'}
                  </button>
                  <button onClick={() => openEdit(p)} style={{ padding: '6px', borderRadius: 6, border: '1px solid #d6e4d6', background: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                    <Pencil size={14} style={{ color: '#506050' }} />
                  </button>
                  <button onClick={() => del(p)} style={{ padding: '6px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                    <Trash2 size={14} style={{ color: '#dc2626' }} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setModal(null)}>
          <div onClick={e => e.stopPropagation()} className="verde-card"
            style={{ width: 'min(480px, 96vw)', padding: 24 }}>

            <div style={{ fontSize: 16, fontWeight: 800, color: '#0f1a0f', marginBottom: 20 }}>
              {modal === 'edit' ? 'Projeyi Düzenle' : 'Yeni Proje'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#506050', marginBottom: 5 }}>Proje Adı *</label>
                <input className="verde-input" value={form.ad} onChange={e => setForm(p => ({ ...p, ad: e.target.value }))} placeholder="Proje adını girin" />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#506050', marginBottom: 5 }}>Açıklama</label>
                <textarea className="verde-input" value={form.aciklama ?? ''} onChange={e => setForm(p => ({ ...p, aciklama: e.target.value }))}
                  placeholder="Kısa açıklama (opsiyonel)" rows={2} style={{ resize: 'vertical' }} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#506050', marginBottom: 8 }}>Renk</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {RENKLER.map(r => (
                    <button key={r} onClick={() => setForm(p => ({ ...p, renk: r }))} style={{
                      width: 32, height: 32, borderRadius: 8, background: r, border: form.renk === r ? '3px solid #0f1a0f' : '2px solid transparent',
                      cursor: 'pointer', transition: 'border .1s',
                    }} />
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} className="verde-btn-ghost" disabled={saving}>Vazgeç</button>
              <button onClick={save} className="verde-btn-primary" disabled={saving}>
                {saving ? 'Kaydediliyor…' : modal === 'edit' ? 'Kaydet' : 'Oluştur'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
