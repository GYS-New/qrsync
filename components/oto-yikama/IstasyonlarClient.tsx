'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { RefreshCw, Plus, Pencil, Trash2, MapPin } from 'lucide-react'

type Istasyon = {
  id: string
  firma_id: string
  lokasyon_id: string
  ad: string
  aktif: boolean
  notlar: string | null
  olusturma_tarihi: string
  guncelleme_tarihi: string
  lokasyon: { id: string; tanim: string; parent_id: string | null } | null
}

type Lokasyon = {
  id: string
  tanim: string
  parent_id: string | null
  aktif: boolean
  is_istasyon: boolean
}

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fee2e2',
  amber: '#d97706',
}

const BOS_FORM = { lokasyon_id: '', ad: '', notlar: '' }

export default function IstasyonlarClient({ firmaId }: { firmaId: string }) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [istasyonlar, setIstasyonlar] = useState<Istasyon[]>([])
  const [lokasyonlar, setLokasyonlar] = useState<Lokasyon[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [filterAktif, setFilterAktif] = useState<'aktif' | 'pasif' | 'all'>('aktif')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Istasyon | null>(null)
  const [form, setForm] = useState(BOS_FORM)
  const [kaydetLoading, setKaydetLoading] = useState(false)

  async function yukle() {
    setYukleniyor(true)
    try {
      const aktifQp = filterAktif === 'all' ? 'all' : filterAktif === 'aktif' ? 'true' : 'false'
      const [istRes, lokRes] = await Promise.all([
        fetch(`/api/oto-yikama/istasyonlar?firma_id=${firmaId}&aktif=${aktifQp}`, { cache: 'no-store' }),
        fetch(`/api/oto-yikama/lokasyonlar?firma_id=${firmaId}`, { cache: 'no-store' }),
      ])
      const istJ = await istRes.json()
      const lokJ = await lokRes.json()
      if (!istJ.ok) throw new Error(istJ.error)
      if (!lokJ.ok) throw new Error(lokJ.error)
      setIstasyonlar(istJ.data)
      setLokasyonlar(lokJ.data)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setYukleniyor(false)
    }
  }

  useEffect(() => { yukle() }, [firmaId, filterAktif])

  const lokasyonMap = useMemo(() => {
    const m = new Map<string, Lokasyon>()
    for (const l of lokasyonlar) m.set(l.id, l)
    return m
  }, [lokasyonlar])

  function openCreate() {
    setEditing(null)
    setForm(BOS_FORM)
    setModalOpen(true)
  }

  function openEdit(i: Istasyon) {
    setEditing(i)
    setForm({ lokasyon_id: i.lokasyon_id, ad: i.ad, notlar: i.notlar ?? '' })
    setModalOpen(true)
  }

  async function kaydet() {
    if (!editing && !form.lokasyon_id) {
      toast({ type: 'error', title: 'Hata', message: 'Lokasyon seçin' }); return
    }
    if (!form.ad.trim()) {
      toast({ type: 'error', title: 'Hata', message: 'İstasyon adı gerekli' }); return
    }
    setKaydetLoading(true)
    try {
      const url = editing ? `/api/oto-yikama/istasyonlar/${editing.id}` : `/api/oto-yikama/istasyonlar`
      const method = editing ? 'PATCH' : 'POST'
      const body: any = editing
        ? { ad: form.ad.trim(), notlar: form.notlar.trim() || null }
        : { firma_id: firmaId, lokasyon_id: form.lokasyon_id, ad: form.ad.trim(), notlar: form.notlar.trim() || null }
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error)
      toast({ type: 'success', title: editing ? 'Güncellendi' : 'Eklendi', message: form.ad })
      setModalOpen(false)
      yukle()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setKaydetLoading(false)
    }
  }

  async function sil(i: Istasyon) {
    const ok = await confirm({
      title: 'İstasyonu Pasif Yap',
      message: `"${i.ad}" istasyonu pasif yapılacak. Geçmiş yıkama görevleri etkilenmez. Onaylıyor musunuz?`,
      confirmText: 'Pasif Yap',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/oto-yikama/istasyonlar/${i.id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!j.ok) throw new Error(j.error)
      toast({ type: 'success', title: 'Pasif yapıldı', message: i.ad })
      yukle()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <div className="verde-card" style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <select className="verde-select" value={filterAktif} onChange={e => setFilterAktif(e.target.value as any)} style={{ width: 120 }}>
          <option value="aktif">Aktif</option>
          <option value="pasif">Pasif</option>
          <option value="all">Tümü</option>
        </select>
        <span style={{ fontSize: 12, color: T.textSoft }}>{istasyonlar.length} istasyon</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={yukle}
            style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
            <RefreshCw size={13} style={yukleniyor ? { animation: 'spin 0.9s linear infinite' } : undefined} /> Yenile
          </button>
          <button onClick={openCreate}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: T.text, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
            <Plus size={13} /> Yeni İstasyon
          </button>
        </div>
      </div>

      {/* Bilgi notu */}
      <div style={{ padding: 12, background: '#eff6ff', border: `1px solid #bfdbfe`, borderRadius: 8, marginBottom: 12, fontSize: 13, color: '#1e3a8a', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <MapPin size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <strong>İstasyon kavramı:</strong> Bir istasyon, mevcut bir lokasyonu (örn. "OTO YIKAMA &gt; İSTASYON-1") Oto Yıkama
          modülüne bağlar. Personel o lokasyonun QR'ını okuttuğunda o istasyona atanmış yıkama görevlerini görür.
          Lokasyonu önce <strong>Lokasyonlar</strong> sayfasından oluşturmanız gerekir.
        </div>
      </div>

      <div className="verde-card" style={{ overflow: 'hidden' }}>
        <div className="verde-table-wrap">
          <table className="verde-table">
            <thead>
              <tr>
                <th>İstasyon Adı</th>
                <th>Lokasyon</th>
                <th>Notlar</th>
                <th>Durum</th>
                <th style={{ width: 110, textAlign: 'right' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {yukleniyor ? (
                <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: T.textSoft }}>Yükleniyor…</td></tr>
              ) : istasyonlar.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 30, textAlign: 'center', color: T.textSoft }}>İstasyon yok. "Yeni İstasyon" ile ekleyin.</td></tr>
              ) : istasyonlar.map(i => (
                <tr key={i.id} style={{ opacity: i.aktif ? 1 : 0.55 }}>
                  <td style={{ fontWeight: 700, color: T.text }}>{i.ad}</td>
                  <td style={{ color: T.textSoft }}>{i.lokasyon?.tanim ?? '—'}</td>
                  <td style={{ color: T.textSoft, fontSize: 12 }}>{i.notlar ?? '—'}</td>
                  <td>
                    {i.aktif
                      ? <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: T.greenLight, color: T.green }}>AKTİF</span>
                      : <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#f1f5f9', color: T.textSoft }}>PASİF</span>}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button onClick={() => openEdit(i)} title="Düzenle"
                      style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: T.text }}>
                      <Pencil size={14} />
                    </button>
                    {i.aktif && (
                      <button onClick={() => sil(i)} title="Pasif yap"
                        style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: T.red }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <div onClick={() => !kaydetLoading && setModalOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} className="verde-card" style={{ width: 'min(480px, 96vw)', padding: 20 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 16 }}>
              {editing ? 'İstasyonu Düzenle' : 'Yeni İstasyon'}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!editing && (
                <div>
                  <label style={{ fontSize: 12, color: T.red, fontWeight: 600 }}>Lokasyon *</label>
                  <select
                    className="verde-select"
                    value={form.lokasyon_id}
                    onChange={e => {
                      const id = e.target.value
                      const lok = lokasyonMap.get(id)
                      setForm({ ...form, lokasyon_id: id, ad: form.ad || (lok?.tanim ?? '') })
                    }}
                    style={{ width: '100%', marginTop: 4 }}
                  >
                    <option value="">— Lokasyon seçin —</option>
                    {lokasyonlar.map(l => (
                      <option key={l.id} value={l.id} disabled={l.is_istasyon}>
                        {l.tanim}{l.is_istasyon ? ' (zaten istasyon)' : ''}
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: 11, color: T.textSoft, marginTop: 4 }}>
                    Bir lokasyon sadece bir kez istasyon olabilir. Lokasyonu önce Lokasyonlar sayfasından oluşturun.
                  </div>
                </div>
              )}
              <div>
                <label style={{ fontSize: 12, color: T.red, fontWeight: 600 }}>İstasyon Adı *</label>
                <input className="verde-input" value={form.ad} onChange={e => setForm({ ...form, ad: e.target.value })} style={{ width: '100%', marginTop: 4 }} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: T.textSoft, fontWeight: 600 }}>Notlar</label>
                <textarea className="verde-input" value={form.notlar} onChange={e => setForm({ ...form, notlar: e.target.value })} style={{ width: '100%', marginTop: 4, minHeight: 60 }} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setModalOpen(false)} disabled={kaydetLoading}
                style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                İptal
              </button>
              <button onClick={kaydet} disabled={kaydetLoading}
                style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: T.text, color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                {kaydetLoading ? 'Kaydediliyor…' : (editing ? 'Güncelle' : 'Ekle')}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
