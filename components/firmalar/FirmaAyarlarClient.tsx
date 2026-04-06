'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Firma } from '@/types'
import Button from '@/components/ui/Button'
import { XCircle, Clock, AlertTriangle } from 'lucide-react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'

export default function FirmaAyarlarClient({ firma }: { firma: Firma }) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    firma_adi: firma.firma_adi ?? '',
    adres: firma.adres ?? '',
    yetkili_isim: firma.yetkili_isim ?? '',
    yetkili_tel: firma.yetkili_tel ?? '',
    aciklama: firma.aciklama ?? '',
    logo_url: (firma as any).logo_url ?? null,
  })

  const fileRef = useRef<HTMLInputElement | null>(null)

  async function resizePng(file: File, maxW: number, maxH: number) {
    const img = document.createElement('img')
    const url = URL.createObjectURL(file)
    try {
      await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Görsel okunamadı')); img.src = url })
      let w = img.width, h = img.height
      if (w > maxW || h > maxH) {
        const scale = Math.min(maxW / w, maxH / h)
        w = Math.round(w * scale); h = Math.round(h * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas başlatılamadı')
      ctx.drawImage(img, 0, 0, w, h)
      const blob: Blob = await new Promise((resolve, reject) => { canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Görsel dönüştürülemedi'))), 'image/png', 0.92) })
      return blob
    } finally { URL.revokeObjectURL(url) }
  }

  async function uploadLogo(file: File) {
    setLoading(true)
    try {
      const blob = await resizePng(file, 480, 480)
      const resizedFile = new File([blob], 'logo.png', { type: 'image/png' })
      const fd = new FormData()
      fd.append('firmaId', firma.id)
      fd.append('file', resizedFile)
      const res = await fetch('/api/upload/firma-logo', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Logo yüklenemedi')
      const publicUrl = json.publicUrl as string
setForm((p) => ({ ...p, logo_url: publicUrl }))
      toast({ type: 'success', title: 'Başarılı', message: 'Firma logosu güncellendi.' })
      router.refresh()
    } catch (e: any) {
      toast({ type: 'error', title: 'Logo yüklenemedi', message: e?.message ?? 'Logo yüklenemedi' })
    } finally {
      setLoading(false)
    }
  }

  async function removeLogo() {
    const ok = await confirm({
      title: 'Logo Sil',
      message: 'Firma logosu silinsin mi?',
      confirmText: 'Sil',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('firmaId', firma.id)
      fd.append('action', 'delete')
      const res = await fetch('/api/upload/firma-logo', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Logo silinemedi')
setForm((p) => ({ ...p, logo_url: null }))
      toast({ type: 'success', title: 'Başarılı', message: 'Firma logosu silindi.' })
      router.refresh()
    } catch (e: any) {
      toast({ type: 'error', title: 'Silinemedi', message: e?.message ?? 'Logo silinemedi' })
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setLoading(true)
    try {
      const { error } = await supabase
        .from('firmalar')
        .update({
          firma_adi: form.firma_adi.trim() || null,
          adres: form.adres.trim(),
          yetkili_isim: form.yetkili_isim.trim(),
          yetkili_tel: form.yetkili_tel.trim(),
          aciklama: form.aciklama.trim() || null,
        })
        .eq('id', firma.id)
      if (error) throw new Error(error.message)
      toast({ type: 'success', title: 'Başarılı', message: 'Firma bilgileri güncellendi.' })
      router.refresh()
    } catch (e: any) {
      toast({ type: 'error', title: 'Kaydedilemedi', message: e?.message ?? 'Kaydedilemedi' })
    } finally {
      setLoading(false)
    }
  }

  // Firma durum kontrolü
  const firmaDurum = !(firma as any).aktif
    ? 'pasif'
    : (firma as any).lisans_gecerlilik_tarihi && new Date((firma as any).lisans_gecerlilik_tarihi) < new Date()
      ? 'lisans_doldu'
      : null

  return (
    <div style={{ maxWidth: 840, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Durum uyarı kartı */}
      {firmaDurum === 'pasif' && (
        <div style={{ background: '#fef2f2', border: '1.5px solid #fecaca', borderRadius: 12, padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <XCircle size={22} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: '#dc2626', marginBottom: 4 }}>Sistem Pasif Edildi</div>
            <div style={{ fontSize: 13.5, color: '#7f1d1d', lineHeight: 1.6 }}>
              Firmanız sistem yöneticisi tarafından pasif edilmiştir. Sistem işlevleri kısıtlanmıştır.
              Yeniden aktif edilmesi için lütfen sistem yöneticinizle iletişime geçin.
            </div>
          </div>
        </div>
      )}
      {firmaDurum === 'lisans_doldu' && (
        <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 12, padding: '16px 20px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <Clock size={22} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: '#d97706', marginBottom: 4 }}>Lisans Süreniz Doldu</div>
            <div style={{ fontSize: 13.5, color: '#78350f', lineHeight: 1.6 }}>
              Lisans süreniz {(firma as any).lisans_gecerlilik_tarihi
                ? new Date((firma as any).lisans_gecerlilik_tarihi).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' tarihinde'
                : ''} dolmuştur. Sistem işlevleri kısıtlanmıştır.
              Lisansınızı yenilemek için lütfen sistem yöneticinizle iletişime geçin.
            </div>
          </div>
        </div>
      )}

      <div className="verde-card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#3d1c00' }}>Firma Ayarları</div>
          <div style={{ fontSize: 12, color: '#9a7b6a', marginTop: 2 }}>Bazı alanlar (Ticari Ünvan / Vergi) değiştirilemez.</div>
        </div>
        <Button variant="primary" type="button" onClick={save} disabled={loading}>
          Kaydet
        </Button>
      </div>

      <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        <Row label="Logo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadLogo(f)
                if (e.currentTarget) e.currentTarget.value = ''
              }}
            />
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 60, minWidth: 120 }}>
              {(form.logo_url as any) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logo_url as any} alt="Logo" style={{ maxHeight: 56, maxWidth: 200, objectFit: 'contain' }} />
              ) : (
                <div style={{ fontSize: 24, fontWeight: 800, color: '#cbd5e1' }}>
                  {(firma.firma_adi || firma.ticari_unvan)?.[0]?.toUpperCase() ?? '?'}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button variant="ghost" type="button" onClick={() => fileRef.current?.click()} disabled={loading}>
                {form.logo_url ? 'Değiştir' : 'Logo Ekle'}
              </Button>
              {form.logo_url && (
                <Button variant="danger" type="button" onClick={removeLogo} disabled={loading}>Sil</Button>
              )}
            </div>
          </div>
        </Row>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Row label="Ticari Ünvan">
            <input className="verde-input" value={firma.ticari_unvan} disabled />
          </Row>
          <Row label="Vergi Dairesi">
            <input className="verde-input" value={firma.vergi_dairesi} disabled />
          </Row>
        </div>

        <Row label="Vergi No">
          <input className="verde-input" value={firma.vergi_no} disabled />
        </Row>

        <Row label="Firma Adı">
          <div>
            <input
              className="verde-input"
              value={form.firma_adi}
              maxLength={7}
              onChange={(e) => setForm({ ...form, firma_adi: e.target.value.slice(0, 7) })}
            />
            <div style={{ fontSize: 11.5, color: '#9a7b6a', marginTop: 6 }}>{form.firma_adi.length}/7 karakter</div>
          </div>
        </Row>
        <Row label="Adres">
          <input className="verde-input" value={form.adres} onChange={(e) => setForm({ ...form, adres: e.target.value })} />
        </Row>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Row label="Yetkili">
            <input className="verde-input" value={form.yetkili_isim} onChange={(e) => setForm({ ...form, yetkili_isim: e.target.value })} />
          </Row>
          <Row label="Yetkili Tel">
            <input className="verde-input" value={form.yetkili_tel} onChange={(e) => setForm({ ...form, yetkili_tel: e.target.value })} />
          </Row>
        </div>

        <Row label="Açıklama">
          <input className="verde-input" value={form.aciklama} onChange={(e) => setForm({ ...form, aciklama: e.target.value })} />
        </Row>

      </div>
    </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'center' }}>
      <div style={{ fontSize: 12, color: '#9a7b6a' }}>{label}</div>
      <div>{children}</div>
    </div>
  )
}
