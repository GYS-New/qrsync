'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { useYetki } from '@/lib/yetki/useYetki'
import { Pencil, Trash2, Plus, Layers } from 'lucide-react'

/** Logo: kare ise kare, dikdörtgen ise dikdörtgen — yükseklik sabit */
function ProjeLogoImg({ src, alt, height = 48 }: { src: string; alt: string; height?: number }) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [w, setW] = useState(height * 1.5) // varsayılan dikdörtgen
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      onLoad={() => {
        const img = imgRef.current
        if (!img) return
        const ratio = img.naturalWidth / img.naturalHeight
        // kare: 0.8-1.2 arası, dikdörtgen: geri kalan
        setW(ratio < 1.2 ? height : height * ratio)
      }}
      style={{
        width: w, height, borderRadius: 8, objectFit: 'contain',
        border: '1px solid #e2e8f0', background: '#fff', flexShrink: 0, padding: 2,
        transition: 'width 0.2s ease',
      }}
    />
  )
}

type Proje = {
  id: string
  firma_id: string
  ad: string
  aciklama?: string | null
  renk: string
  aktif: boolean
  personel_takibi_aktif: boolean
  sureli_gorev_aktif?: boolean
  qr_sistemi_aktif: boolean
  nfc_sistemi_aktif: boolean
  birim_fiyat_aktif: boolean
  kayit_tarihi: string
  logo_url?: string | null
}

const RENKLER = ['#374151', '#1d6fa8', '#9333ea', '#c2410c', '#0e7490', '#be185d', '#374151', '#374151']

const BOSH: Omit<Proje, 'id' | 'firma_id' | 'kayit_tarihi'> = {
  ad: '', aciklama: '', renk: '#374151', aktif: true, personel_takibi_aktif: false, sureli_gorev_aktif: false, qr_sistemi_aktif: true, nfc_sistemi_aktif: true, birim_fiyat_aktif: false
}

export default function ProjelerClient({
  firmaId,
  readonly = false,
  isSA = false,
  firmaBirimFiyatAktif = true,
}: {
  firmaId: string | null
  readonly?: boolean
  isSA?: boolean
  firmaBirimFiyatAktif?: boolean
}) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const yetki = useYetki('projeler')
  const [projeler, setProjeler] = useState<Proje[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modal, setModal] = useState<'create' | 'edit' | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...BOSH })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [silModal, setSilModal] = useState<Proje | null>(null)
  const [silSifre, setSilSifre] = useState('')
  const [silLoading, setSilLoading] = useState(false)
  const [silHata, setSilHata] = useState('')

  const fetchProjeler = useCallback(async () => {
    if (!firmaId) { setLoading(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/projeler?firma_id=${firmaId}`)
      const data = await res.json()
      const list: Proje[] = Array.isArray(data) ? data : []

      // Her proje için sureli_gorev_aktif özetini lokasyonlardan hesapla
      if (list.length > 0) {
        const supabase = (await import('@/lib/supabase/client')).createClient()
        const { data: loks } = await supabase
          .from('lokasyonlar')
          .select('proje_id, sureli_gorev_aktif')
          .eq('firma_id', firmaId)
          .eq('aktif', true)

        if (loks) {
          const sureliMap: Record<string, boolean> = {}
          for (const lok of loks) {
            if (!lok.proje_id) continue
            if (lok.sureli_gorev_aktif) sureliMap[lok.proje_id] = true
          }
          setProjeler(list.map(p => ({ ...p, sureli_gorev_aktif: !!sureliMap[p.id] })))
        } else {
          setProjeler(list)
        }
      } else {
        setProjeler(list)
      }
    } catch {
      toast({ type: 'error', title: 'Hata', message: 'Projeler yüklenemedi' })
    } finally {
      setLoading(false)
    }
  }, [firmaId])

  useEffect(() => { fetchProjeler() }, [fetchProjeler])

  function openCreate() {
    setForm({ ...BOSH }); setLogoFile(null); setLogoPreview(null)
    setEditId(null)
    setModal('create')
  }

  function openEdit(p: Proje) {
    setForm({ ad: p.ad, aciklama: p.aciklama ?? '', renk: p.renk, aktif: p.aktif, personel_takibi_aktif: p.personel_takibi_aktif ?? false, qr_sistemi_aktif: p.qr_sistemi_aktif ?? true, nfc_sistemi_aktif: p.nfc_sistemi_aktif ?? true, birim_fiyat_aktif: p.birim_fiyat_aktif ?? false })
    setLogoFile(null); setLogoPreview(p.logo_url ?? null)
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
      const result = await res.json()
      // Logo upload (oluşturma sonrası veya düzenleme)
      const targetId = modal === 'edit' ? editId : result?.id
      if (logoFile && targetId) {
        const fd = new FormData()
        fd.append('projeId', targetId)
        fd.append('file', logoFile)
        await fetch('/api/upload/proje-logo', { method: 'POST', body: fd })
      }
      toast({ type: 'success', title: 'Kaydedildi', message: modal === 'edit' ? 'Proje güncellendi' : 'Proje oluşturuldu' })
      setModal(null); setLogoFile(null); setLogoPreview(null)
      fetchProjeler()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    } finally {
      setSaving(false)
    }
  }

  async function del(p: Proje) {
    const ok = await confirm({
      title: '⚠️ PROJEYİ KALICI OLARAK SİL',
      message: `"${p.ad}" projesi ve altındaki TÜM VERİLER veritabanından kalıcı olarak silinecektir:\n\n• Tüm personel hesapları\n• Tüm lokasyonlar ve lokasyon grupları\n• Tüm frekansiyel görevler (aktif + arşiv)\n• Tüm spesifik görevler (aktif + arşiv)\n• Tüm çeklist sonuçları (aktif + arşiv)\n• Tüm görev kuralları\n• Müşteri değerlendirmeleri ve mesai kayıtları\n\nBu işlem GERİ ALINAMAZ.\nDevam etmek için şifrenizi girmeniz gerekecektir.`,
      confirmText: 'Devam Et',
      cancelText: 'Vazgeç',
      variant: 'danger',
    })
    if (!ok) return
    // Şifre doğrulama modalını aç
    setSilSifre('')
    setSilHata('')
    setSilModal(p)
  }

  async function silOnayla() {
    if (!silModal) return
    if (!silSifre) { setSilHata('Şifre boş olamaz.'); return }
    setSilLoading(true)
    setSilHata('')
    try {
      const vRes = await fetch('/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: silSifre }),
      })
      const vJson = await vRes.json()
      if (!vJson.ok) { setSilHata('Şifre hatalı. Lütfen tekrar deneyin.'); setSilLoading(false); return }

      const res = await fetch(`/api/projeler/${silModal.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      toast({ type: 'success', title: 'Silindi', message: `"${silModal.ad}" projesi kalıcı olarak silindi.` })
      setSilModal(null)
      fetchProjeler()
    } catch (e: any) {
      setSilHata(e.message)
    } finally {
      setSilLoading(false)
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

  async function togglePersonelTakibi(p: Proje) {
    const yeniDurum = !p.personel_takibi_aktif
    try {
      const res = await fetch(`/api/projeler/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personel_takibi_aktif: yeniDurum }),
      })
      if (!res.ok) throw new Error('Güncellenemedi')
      setProjeler(prev => prev.map(x => x.id === p.id ? { ...x, personel_takibi_aktif: yeniDurum } : x))
      toast({ type: 'success', title: 'Güncellendi', message: yeniDurum ? 'Personel Takibi açıldı.' : 'Personel Takibi kapatıldı.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
  }

  async function toggleQrSistemi(p: Proje) {
    const yeniDurum = !p.qr_sistemi_aktif
    try {
      const res = await fetch(`/api/projeler/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qr_sistemi_aktif: yeniDurum }),
      })
      if (!res.ok) throw new Error('Güncellenemedi')
      setProjeler(prev => prev.map(x => x.id === p.id ? { ...x, qr_sistemi_aktif: yeniDurum } : x))
      toast({ type: 'success', title: 'Güncellendi', message: yeniDurum ? 'QR Sistemi açıldı.' : 'QR Sistemi kapatıldı.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
  }

  async function toggleNfcSistemi(p: Proje) {
    const yeniDurum = !p.nfc_sistemi_aktif
    try {
      const res = await fetch(`/api/projeler/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nfc_sistemi_aktif: yeniDurum }),
      })
      if (!res.ok) throw new Error('Güncellenemedi')
      setProjeler(prev => prev.map(x => x.id === p.id ? { ...x, nfc_sistemi_aktif: yeniDurum } : x))
      toast({ type: 'success', title: 'Güncellendi', message: yeniDurum ? 'NFC Sistemi açıldı.' : 'NFC Sistemi kapatıldı.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
  }

  async function toggleBirimFiyat(p: Proje) {
    const yeniDurum = !p.birim_fiyat_aktif
    try {
      const res = await fetch(`/api/projeler/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birim_fiyat_aktif: yeniDurum }),
      })
      if (!res.ok) throw new Error('Güncellenemedi')
      setProjeler(prev => prev.map(x => x.id === p.id ? { ...x, birim_fiyat_aktif: yeniDurum } : x))
      toast({ type: 'success', title: 'Güncellendi', message: yeniDurum ? 'Birim Fiyatlar açıldı.' : 'Birim Fiyatlar kapatıldı.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
  }

  async function toggleSureliGorevler(p: Proje) {
    const ok = await confirm({
      title: 'Süreli Görevleri Değiştir',
      message: `"${p.ad}" projesindeki tüm lokasyonların süreli görev durumu toplu olarak değiştirilecek. Devam edilsin mi?`,
      confirmText: 'Devam Et',
      cancelText: 'Vazgeç',
      variant: 'danger',
    })
    if (!ok) return
    try {
      const res = await fetch(`/api/projeler/${p.id}/toggle-sureli-gorev`, { method: 'POST' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'İşlem başarısız')
      const yeniSureli = j.sureli_aktif ?? !p.sureli_gorev_aktif
      setProjeler(prev => prev.map(x => x.id === p.id ? { ...x, sureli_gorev_aktif: yeniSureli } : x))
      toast({ type: 'success', title: 'Tamamlandı', message: j.message ?? 'Güncellendi' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
  }

  const aktifler = projeler.filter(p => p.aktif)
  const pasifler = projeler.filter(p => !p.aktif)

  return (
    <div className="verde-card" style={{ padding: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f9fafb', border: '1px solid #e5e7eb', display: 'grid', placeItems: 'center', color: '#1f2937' }}>
          <Layers size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#111827' }}>PROJELER</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginTop: 1 }}>
            {aktifler.length} aktif • {pasifler.length} pasif
          </div>
        </div>
        {!readonly && yetki.ekleyebilir && (
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
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
          <span className="verde-spinner" style={{ display: 'inline-block', marginBottom: 8 }} />
          <div>Yükleniyor…</div>
        </div>
      ) : projeler.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#6b7280' }}>
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
              borderRadius: 10, border: `1px solid ${p.aktif ? '#e5e7eb' : '#e8e8e8'}`,
              background: p.aktif ? '#fff' : '#fafafa',
              opacity: p.aktif ? 1 : 0.7,
            }}>
              {/* Logo veya renk ikon */}
              {p.logo_url ? (
                <ProjeLogoImg src={p.logo_url} alt={p.ad} height={48} />
              ) : (
                <div style={{ width: 48, height: 48, borderRadius: 10, background: `${p.renk}18`, border: `2px solid ${p.renk}40`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <div style={{ width: 14, height: 14, borderRadius: '50%', background: p.renk }} />
                </div>
              )}

              {/* Bilgi */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{p.ad}</span>
                  {!p.aktif && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: '#f3f4f6', color: '#6b7280', fontWeight: 600 }}>Pasif</span>
                  )}
                  {p.personel_takibi_aktif && (
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: '#dbeafe', color: '#1d4ed8', fontWeight: 700 }}>👷 Personel Takibi</span>
                  )}
                  {p.sureli_gorev_aktif && (
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: '#f3e8ff', color: '#7c3aed', fontWeight: 700 }}>⚡ Süreli Görev</span>
                  )}
                  {p.qr_sistemi_aktif && (
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: '#dcfce7', color: '#15803d', fontWeight: 700 }}>📷 QR Aktif</span>
                  )}
                  {p.nfc_sistemi_aktif && (
                    <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 8, background: '#e0f2fe', color: '#0369a1', fontWeight: 700 }}>📶 NFC Aktif</span>
                  )}
                </div>
                {p.aciklama && <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 2 }}>{p.aciklama}</div>}
                <div style={{ fontSize: 11.5, color: '#9ca3af', marginTop: 3 }}>
                  {new Date(p.kayit_tarihi).toLocaleDateString('tr-TR')} tarihinde oluşturuldu
                </div>
              </div>

              {/* İşlemler */}
              {!readonly && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {yetki.duzenleyebilir && (
                    <button onClick={() => openEdit(p)} style={{ padding: '6px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                      <Pencil size={14} style={{ color: '#4b5563' }} />
                    </button>
                  )}
                  {yetki.silebilir && (
                    <button onClick={() => del(p)} style={{ padding: '6px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                      <Trash2 size={14} style={{ color: '#dc2626' }} />
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Şifre Doğrulama Modalı */}
      {silModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="verde-card" style={{ width: 'min(440px, 96vw)', padding: 28, borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ fontSize: 28 }}>🔐</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#991b1b' }}>Şifre Doğrulama</div>
                <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 2 }}>"{silModal.ad}" projesini kalıcı silmek için şifrenizi girin</div>
              </div>
            </div>
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 12.5, color: '#991b1b', fontWeight: 600 }}>
              ⚠️ Bu işlem geri alınamaz. Proje altındaki tüm veriler ve personeller kalıcı olarak silinecektir.
            </div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 6 }}>Şifreniz</label>
            <input
              type="password"
              className="verde-input"
              value={silSifre}
              onChange={e => { setSilSifre(e.target.value); setSilHata('') }}
              onKeyDown={e => { if (e.key === 'Enter') silOnayla() }}
              placeholder="Giriş şifrenizi girin"
              autoFocus
              disabled={silLoading}
            />
            {silHata && (
              <div style={{ marginTop: 8, fontSize: 12.5, color: '#dc2626', fontWeight: 600 }}>⛔ {silHata}</div>
            )}
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setSilModal(null); setSilSifre(''); setSilHata('') }}
                className="verde-btn-ghost"
                disabled={silLoading}
              >
                Vazgeç
              </button>
              <button
                onClick={silOnayla}
                disabled={silLoading || !silSifre}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none', cursor: silLoading || !silSifre ? 'not-allowed' : 'pointer',
                  background: silLoading || !silSifre ? '#fca5a5' : '#dc2626', color: '#fff',
                  fontWeight: 700, fontSize: 13,
                }}
              >
                {silLoading ? 'Siliniyor…' : '🗑️ Kalıcı Olarak Sil'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setModal(null)}>
          <div onClick={e => e.stopPropagation()} className="verde-card"
            style={{ width: 'min(480px, 96vw)', padding: 24 }}>

            <div style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 20 }}>
              {modal === 'edit' ? 'Projeyi Düzenle' : 'Yeni Proje'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Proje Logosu */}
              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#4b5563', marginBottom: 5 }}>Proje Logosu</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {logoPreview ? (
                    <ProjeLogoImg src={logoPreview} alt="Logo" height={64} />
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: 8, background: form.renk + '20', border: '1px dashed #e5e7eb', display: 'grid', placeItems: 'center', fontSize: 18, color: form.renk, fontWeight: 800 }}>
                      {form.ad?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <label style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12.5, fontWeight: 600, color: '#4b5563', cursor: 'pointer' }}>
                      {logoPreview ? 'Değiştir' : 'Logo Ekle'}
                      <input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) { setLogoFile(f); setLogoPreview(URL.createObjectURL(f)) }
                      }} />
                    </label>
                    {logoPreview && (
                      <button onClick={async () => {
                        if (modal === 'edit' && editId) {
                          const fd = new FormData(); fd.append('projeId', editId); fd.append('action', 'delete')
                          await fetch('/api/upload/proje-logo', { method: 'POST', body: fd })
                        }
                        setLogoFile(null); setLogoPreview(null)
                      }} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #fca5a5', background: '#fff', fontSize: 12.5, fontWeight: 600, color: '#dc2626', cursor: 'pointer' }}>
                        Sil
                      </button>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: 11, color: '#6b7280', marginTop: 4, display: 'block' }}>PNG veya JPEG, arka plansız logo önerilir. Otomatik boyutlandırılır.</span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#4b5563', marginBottom: 5 }}>Proje Adı *</label>
                <input className="verde-input" value={form.ad} onChange={e => setForm(p => ({ ...p, ad: e.target.value }))} placeholder="Proje adını girin" />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#4b5563', marginBottom: 5 }}>Açıklama</label>
                <textarea className="verde-input" value={form.aciklama ?? ''} onChange={e => setForm(p => ({ ...p, aciklama: e.target.value }))}
                  placeholder="Kısa açıklama (opsiyonel)" rows={2} style={{ resize: 'vertical' }} />
              </div>

              {/* Renk seçici kaldırıldı — logo kullanılıyor */}

              {/* Birim Fiyat Sistemi — Sistem Ayarları üzerinden yönetilir */}
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
