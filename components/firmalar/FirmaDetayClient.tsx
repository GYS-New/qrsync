'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Firma } from '@/types'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'

export default function FirmaDetayClient({ firma }: { firma: Firma }) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [edit, setEdit] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({
    ticari_unvan: firma.ticari_unvan ?? '',
    firma_adi: firma.firma_adi ?? '',
    adres: firma.adres ?? '',
    vergi_dairesi: firma.vergi_dairesi ?? '',
    vergi_no: firma.vergi_no ?? '',
    yetkili_isim: firma.yetkili_isim ?? '',
    yetkili_tel: firma.yetkili_tel ?? '',
    aciklama: firma.aciklama ?? '',
    aktif: !!firma.aktif,
    qr_sablon_aktif: (firma as any).qr_sablon_aktif !== false,
    rapor_ozellestir_aktif: (firma as any).rapor_ozellestir_aktif !== false,
    personel_takibi_aktif: (firma as any).personel_takibi_aktif === true,
    logo_url: (firma as any).logo_url ?? null,
    lisans_gecerlilik_tarihi: (firma as any).lisans_gecerlilik_tarihi
      ? new Date((firma as any).lisans_gecerlilik_tarihi).toISOString().slice(0, 10)
      : '',
  })

  const fileRef = useRef<HTMLInputElement | null>(null)

  async function resizeToSquarePng(file: File, size: number) {
    const img = document.createElement('img')
    const url = URL.createObjectURL(file)
    try {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Görsel okunamadı'))
        img.src = url
      })
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Canvas başlatılamadı')
      const scale = Math.max(size / img.width, size / img.height)
      const w = img.width * scale
      const h = img.height * scale
      const x = (size - w) / 2
      const y = (size - h) / 2
      ctx.drawImage(img, x, y, w, h)
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Görsel dönüştürülemedi'))), 'image/png', 0.92)
      })
      return blob
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  async function uploadLogo(file: File) {
    setLoading(true)
    setErr('')
    try {
      const blob = await resizeToSquarePng(file, 320)
      const resizedFile = new File([blob], 'logo.png', { type: 'image/png' })
      const fd = new FormData()
      fd.append('firmaId', firma.id)
      fd.append('file', resizedFile)
      const res = await fetch('/api/upload/firma-logo', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Logo yüklenemedi')
      const publicUrl = json.publicUrl as string
toast({ type: 'success', title: 'Başarılı', message: 'Logo güncellendi.' })
      router.refresh()
      setForm((p) => ({ ...p, logo_url: publicUrl }))
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
    setErr('')
    try {
      const fd = new FormData()
      fd.append('firmaId', firma.id)
      fd.append('action', 'delete')
      const res = await fetch('/api/upload/firma-logo', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Logo silinemedi')
      toast({ type: 'success', title: 'Başarılı', message: 'Logo silindi.' })
      router.refresh()
      setForm((p) => ({ ...p, logo_url: null }))
} catch (e: any) {
      toast({ type: 'error', title: 'Silinemedi', message: e?.message ?? 'Logo silinemedi' })
    } finally {
      setLoading(false)
    }
  }

  async function save() {
    setLoading(true)
    setErr('')
    const { error } = await supabase
      .from('firmalar')
      .update({
        ticari_unvan: form.ticari_unvan.trim(),
        firma_adi: form.firma_adi.trim() || null,
        adres: form.adres.trim(),
        vergi_dairesi: form.vergi_dairesi.trim(),
        vergi_no: form.vergi_no.trim(),
        yetkili_isim: form.yetkili_isim.trim(),
        yetkili_tel: form.yetkili_tel.trim(),
        aciklama: form.aciklama.trim() || null,
        aktif: form.aktif,
        qr_sablon_aktif: form.qr_sablon_aktif,
        rapor_ozellestir_aktif: form.rapor_ozellestir_aktif,
        personel_takibi_aktif: form.personel_takibi_aktif,
        lisans_gecerlilik_tarihi: form.lisans_gecerlilik_tarihi
          ? new Date(form.lisans_gecerlilik_tarihi + 'T23:59:59').toISOString()
          : null,
        // Firma pasife alınırsa QR/NFC sistemleri otomatik kapat
        // Aktif edilince DB'deki mevcut değer korunur (TA kendi ayarını geri alır)
        ...(form.aktif === false ? { qr_sistemi_aktif: false, nfc_sistemi_aktif: false } : {}),
      })
      .eq('id', firma.id)

    setLoading(false)
    if (error) {
      setErr(error.message)
      toast({ type: 'error', title: 'Kaydedilemedi', message: error.message })
      return
    }
    setEdit(false)
    toast({ type: 'success', title: 'Başarılı', message: 'Firma güncellendi.' })
    router.refresh()
  }

  async function remove() {
    const ok = await confirm({
      title: 'Firma Sil',
      message: 'Firmayı silmek istiyor musun? Bu işlem geri alınamaz.',
      confirmText: 'Sil',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return
    setLoading(true)
    setErr('')
    const { error } = await supabase.from('firmalar').delete().eq('id', firma.id)
    setLoading(false)
    if (error) {
      setErr(error.message)
      toast({ type: 'error', title: 'Silinemedi', message: error.message })
      return
    }
    router.push('/sa/dashboard/firmalar')
  }

  return (
    <div className="verde-card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f1a0f' }}>{firma.firma_adi || firma.ticari_unvan}</div>
          <div style={{ fontSize: 14, color: '#7a907a', marginTop: 2 }}>{firma.ticari_unvan}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!edit ? (
            <Button variant="primary" type="button" onClick={() => setEdit(true)}>Düzenle</Button>
          ) : (
            <>
              <Button variant="ghost" type="button" onClick={() => setEdit(false)}>Vazgeç</Button>
              <Button variant="primary" type="button" onClick={save} disabled={loading}>Kaydet</Button>
            </>
          )}
          <Button variant="danger" type="button" onClick={remove} disabled={loading}>Sil</Button>
        </div>
      </div>

      {/* Uyarılar toast olarak gösterilir */}

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
            {(firma as any).logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={(firma as any).logo_url} alt="Logo" style={{ width: 46, height: 46, borderRadius: 8, objectFit: 'cover', border: '1px solid #d6e4d6' }} />
            ) : (
              <div style={{ width: 46, height: 46, borderRadius: 8, background: '#f0f9f0', border: '1px solid #d6e4d6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#2e8b2e' }}>
                {(firma.firma_adi || firma.ticari_unvan)?.[0]?.toUpperCase()}
              </div>
            )}
            <Button variant="ghost" type="button" onClick={() => fileRef.current?.click()} disabled={loading}>
              {(firma as any).logo_url ? 'Düzenle' : 'Ekle'}
            </Button>
            {(firma as any).logo_url ? (
              <Button variant="danger" type="button" onClick={removeLogo} disabled={loading}>
                Sil
              </Button>
            ) : null}
          </div>
        </Row>

        <Row label="Aktif">
          {edit ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.aktif} onChange={(e) => setForm({ ...form, aktif: e.target.checked })} />
              {form.aktif ? 'Aktif' : 'Pasif'}
            </label>
          ) : (
            <span className={`verde-badge ${firma.aktif ? 'status-tamamlandi' : 'status-iptal'}`}>{firma.aktif ? 'Aktif' : 'Pasif'}</span>
          )}
        </Row>

        <Row label="Şablonlu QR Kart">
          {edit ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={form.qr_sablon_aktif} onChange={(e) => setForm({ ...form, qr_sablon_aktif: e.target.checked })} />
              {form.qr_sablon_aktif ? 'Aktif' : 'Pasif'}
            </label>
          ) : (
            <span className={`verde-badge ${(firma as any).qr_sablon_aktif !== false ? 'status-tamamlandi' : 'status-iptal'}`}>
              {(firma as any).qr_sablon_aktif !== false ? 'Aktif' : 'Pasif'}
            </span>
          )}
        </Row>

        <Row label="Rapor Özelleştir">
          {edit ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={form.rapor_ozellestir_aktif} onChange={(e) => setForm({ ...form, rapor_ozellestir_aktif: e.target.checked })} />
              {form.rapor_ozellestir_aktif ? 'Aktif' : 'Pasif'}
            </label>
          ) : (
            <span className={`verde-badge ${(firma as any).rapor_ozellestir_aktif !== false ? 'status-tamamlandi' : 'status-iptal'}`}>
              {(firma as any).rapor_ozellestir_aktif !== false ? 'Aktif' : 'Pasif'}
            </span>
          )}
        </Row>

        <Row label="Personel Takibi">
          {edit ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={form.personel_takibi_aktif} onChange={(e) => setForm({ ...form, personel_takibi_aktif: e.target.checked })} />
              {form.personel_takibi_aktif ? 'Aktif' : 'Pasif'}
            </label>
          ) : (
            <span className={`verde-badge ${(firma as any).personel_takibi_aktif === true ? 'status-tamamlandi' : 'status-iptal'}`}>
              {(firma as any).personel_takibi_aktif === true ? 'Aktif' : 'Pasif'}
            </span>
          )}
        </Row>

        <Row label="Ticari Ünvan">
          {edit ? (
            <input className="verde-input" value={form.ticari_unvan} onChange={(e) => setForm({ ...form, ticari_unvan: e.target.value })} />
          ) : (
            <span>{firma.ticari_unvan}</span>
          )}
        </Row>

        <Row label="Firma Adı">
          {edit ? (
            <input className="verde-input" value={form.firma_adi} onChange={(e) => setForm({ ...form, firma_adi: e.target.value })} />
          ) : (
            <span>{firma.firma_adi ?? '—'}</span>
          )}
        </Row>

        <Row label="Adres">
          {edit ? (
            <input className="verde-input" value={form.adres} onChange={(e) => setForm({ ...form, adres: e.target.value })} />
          ) : (
            <span>{firma.adres}</span>
          )}
        </Row>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Row label="Vergi Dairesi">
            {edit ? (
              <input className="verde-input" value={form.vergi_dairesi} onChange={(e) => setForm({ ...form, vergi_dairesi: e.target.value })} />
            ) : (
              <span>{firma.vergi_dairesi}</span>
            )}
          </Row>
          <Row label="Vergi No">
            {edit ? (
              <input className="verde-input" value={form.vergi_no} onChange={(e) => setForm({ ...form, vergi_no: e.target.value })} />
            ) : (
              <span>{firma.vergi_no}</span>
            )}
          </Row>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Row label="Yetkili">
            {edit ? (
              <input className="verde-input" value={form.yetkili_isim} onChange={(e) => setForm({ ...form, yetkili_isim: e.target.value })} />
            ) : (
              <span>{firma.yetkili_isim}</span>
            )}
          </Row>
          <Row label="Yetkili Tel">
            {edit ? (
              <input className="verde-input" value={form.yetkili_tel} onChange={(e) => setForm({ ...form, yetkili_tel: e.target.value })} />
            ) : (
              <span>{firma.yetkili_tel}</span>
            )}
          </Row>
        </div>

        <Row label="Açıklama">
          {edit ? (
            <input className="verde-input" value={form.aciklama} onChange={(e) => setForm({ ...form, aciklama: e.target.value })} />
          ) : (
            <span>{firma.aciklama ?? '—'}</span>
          )}
        </Row>

        <Row label="Lisans Bitiş Tarihi">
          {edit ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="date"
                className="verde-input"
                style={{ width: 180 }}
                value={form.lisans_gecerlilik_tarihi}
                onChange={(e) => setForm({ ...form, lisans_gecerlilik_tarihi: e.target.value })}
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, lisans_gecerlilik_tarihi: '' })}
                style={{ fontSize: 12, color: '#999', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Tarihi Kaldır
              </button>
            </div>
          ) : (
            <span style={{ fontWeight: 600, color: (() => {
              const v = (firma as any).lisans_gecerlilik_tarihi
              if (!v) return '#2e8b2e'
              return new Date() > new Date(v) ? '#c0392b' : '#2e8b2e'
            })() }}>
              {(firma as any).lisans_gecerlilik_tarihi
                ? new Date((firma as any).lisans_gecerlilik_tarihi).toLocaleDateString('tr-TR')
                : 'Süresiz'}
              {(firma as any).lisans_gecerlilik_tarihi && new Date() > new Date((firma as any).lisans_gecerlilik_tarihi)
                ? ' ⚠ Süresi Dolmuş'
                : ''}
            </span>
          )}
        </Row>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, alignItems: 'center' }}>
      <div style={{ fontSize: 14, color: '#7a907a' }}>{label}</div>
      <div>{children}</div>
    </div>
  )
}