'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import DynamicLogo from '@/components/ui/DynamicLogo'
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
    birim_fiyat_aktif: (firma as any).birim_fiyat_aktif === true,
    logo_url: (firma as any).logo_url ?? null,
    lisans_gecerlilik_tarihi: (firma as any).lisans_gecerlilik_tarihi
      ? new Date((firma as any).lisans_gecerlilik_tarihi).toISOString().slice(0, 10)
      : '',
    depolama_kapasitesi_mb: Number((firma as any).depolama_kapasitesi_mb ?? 1024),
    max_kullanici_sayisi: (firma as any).max_kullanici_sayisi ?? '',
    max_lokasyon_sayisi:  (firma as any).max_lokasyon_sayisi ?? '',
  })

  // Lisans kullanım sayaçları (gerçek zamanlı)
  const [mevcutKullanici, setMevcutKullanici] = useState<number | null>(null)
  const [mevcutLokasyon, setMevcutLokasyon] = useState<number | null>(null)
  useEffect(() => {
    let iptal = false
    ;(async () => {
      const [u, l] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('firma_id', firma.id),
        supabase.from('lokasyonlar').select('id', { count: 'exact', head: true }).eq('firma_id', firma.id),
      ])
      if (iptal) return
      setMevcutKullanici(u.count ?? 0)
      setMevcutLokasyon(l.count ?? 0)
    })()
    return () => { iptal = true }
  }, [firma.id, supabase])

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
    setErr('')
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
        birim_fiyat_aktif: form.birim_fiyat_aktif,
        lisans_gecerlilik_tarihi: form.lisans_gecerlilik_tarihi
          ? new Date(form.lisans_gecerlilik_tarihi + 'T23:59:59').toISOString()
          : null,
        depolama_kapasitesi_mb: Math.max(1, Math.round(form.depolama_kapasitesi_mb || 1024)),
        // NULL = sınırsız; boş string'i veya 0/negatifi NULL'a çevir
        max_kullanici_sayisi:
          form.max_kullanici_sayisi === '' || Number(form.max_kullanici_sayisi) <= 0
            ? null
            : Math.round(Number(form.max_kullanici_sayisi)),
        max_lokasyon_sayisi:
          form.max_lokasyon_sayisi === '' || Number(form.max_lokasyon_sayisi) <= 0
            ? null
            : Math.round(Number(form.max_lokasyon_sayisi)),
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

  // Mevcut ayarları varsayılan olarak kaydet (snapshot)
  async function varsayilaniKaydet() {
    const ok = await confirm({
      title: 'Mevcut Ayarları Varsayılan Olarak Kaydet',
      message: 'Şu anki firma ayarları varsayılan olarak kaydedilecek. TA değişiklik yaparsa bu noktaya geri dönebilirsiniz.',
      confirmText: 'Kaydet',
      cancelText: 'İptal',
    })
    if (!ok) return
    setLoading(true)
    const snapshot = {
      aktif: form.aktif,
      qr_sablon_aktif: form.qr_sablon_aktif,
      rapor_ozellestir_aktif: form.rapor_ozellestir_aktif,
      personel_takibi_aktif: form.personel_takibi_aktif,
      birim_fiyat_aktif: form.birim_fiyat_aktif,
      kaydedilme_tarihi: new Date().toISOString(),
    }
    const { error } = await supabase.from('firmalar').update({ varsayilan_ayarlar: snapshot }).eq('id', firma.id)
    setLoading(false)
    if (error) { toast({ type: 'error', title: 'Hata', message: error.message }); return }
    toast({ type: 'success', title: 'Kaydedildi', message: 'Mevcut ayarlar varsayılan olarak kaydedildi.' })
    router.refresh()
  }

  // Kaydedilmiş varsayılana geri dön
  async function varsayilanadon() {
    const snapshot = (firma as any).varsayilan_ayarlar
    if (!snapshot) {
      toast({ type: 'error', title: 'Varsayılan yok', message: 'Önce "Varsayılanı Kaydet" ile mevcut ayarları kaydedin.' })
      return
    }
    const tarih = snapshot.kaydedilme_tarihi ? new Date(snapshot.kaydedilme_tarihi).toLocaleDateString('tr-TR') : '?'
    const ok = await confirm({
      title: 'Varsayılan Ayarlara Dön',
      message: `Firma ayarları ${tarih} tarihinde kaydedilen varsayılanlara geri yüklenecek. Onaylıyor musunuz?`,
      confirmText: 'Evet, Geri Yükle',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return
    setLoading(true)
    const { error } = await supabase
      .from('firmalar')
      .update({
        aktif: snapshot.aktif ?? true,
        qr_sablon_aktif: snapshot.qr_sablon_aktif ?? true,
        rapor_ozellestir_aktif: snapshot.rapor_ozellestir_aktif ?? true,
        personel_takibi_aktif: snapshot.personel_takibi_aktif ?? false,
        birim_fiyat_aktif: snapshot.birim_fiyat_aktif ?? false,
      })
      .eq('id', firma.id)
    setLoading(false)
    if (error) { toast({ type: 'error', title: 'Hata', message: error.message }); return }
    setForm(p => ({
      ...p,
      aktif: snapshot.aktif ?? true,
      qr_sablon_aktif: snapshot.qr_sablon_aktif ?? true,
      rapor_ozellestir_aktif: snapshot.rapor_ozellestir_aktif ?? true,
      personel_takibi_aktif: snapshot.personel_takibi_aktif ?? false,
      birim_fiyat_aktif: snapshot.birim_fiyat_aktif ?? false,
    }))
    toast({ type: 'success', title: 'Geri Yüklendi', message: `Firma ayarları ${tarih} tarihli varsayılanlara döndürüldü.` })
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
          <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>{firma.firma_adi || firma.ticari_unvan}</div>
          <div style={{ fontSize: 14, color: '#6b7280', marginTop: 2 }}>{firma.ticari_unvan}</div>
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
          <button onClick={varsayilaniKaydet} disabled={loading}
            style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6, border: '1px solid #3b82f6', background: '#eff6ff', color: '#1d4ed8', cursor: 'pointer' }}>
            Varsayılanı Kaydet
          </button>
          <button onClick={varsayilanadon} disabled={loading}
            style={{ padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 6, border: '1px solid #f59e0b', background: '#fffbeb', color: '#92400e', cursor: 'pointer', opacity: (firma as any).varsayilan_ayarlar ? 1 : 0.4 }}>
            Varsayılana Dön
          </button>
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
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 68, minWidth: 120 }}>
              {(firma as any).logo_url ? (
                <DynamicLogo src={(firma as any).logo_url} alt="Logo" height={56} />
              ) : (
                <div style={{ fontSize: 24, fontWeight: 800, color: '#cbd5e1' }}>
                  {(firma.firma_adi || firma.ticari_unvan)?.[0]?.toUpperCase() ?? '?'}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Button variant="ghost" type="button" onClick={() => fileRef.current?.click()} disabled={loading}>
                {(firma as any).logo_url ? 'Değiştir' : 'Logo Ekle'}
              </Button>
              {(firma as any).logo_url && (
                <Button variant="danger" type="button" onClick={removeLogo} disabled={loading}>Sil</Button>
              )}
            </div>
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

        <Row label="Birim Fiyat Sistemi">
          {edit ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={form.birim_fiyat_aktif} onChange={(e) => setForm({ ...form, birim_fiyat_aktif: e.target.checked })} />
              {form.birim_fiyat_aktif ? 'Aktif' : 'Pasif'}
            </label>
          ) : (
            <span className={`verde-badge ${(firma as any).birim_fiyat_aktif === true ? 'status-tamamlandi' : 'status-iptal'}`}>
              {(firma as any).birim_fiyat_aktif === true ? 'Aktif' : 'Pasif'}
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

        <Row label="Mobil Firma Kodu">
          <MobilKoduPanel firmaId={firma.id} initialKod={(firma as any).mobil_firma_kodu ?? ''} />
        </Row>

        <Row label="Kullanıcı Limiti">
          {edit ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input
                type="number"
                min={0}
                step={1}
                className="verde-input"
                style={{ width: 140 }}
                placeholder="Sınırsız"
                value={form.max_kullanici_sayisi as any}
                onChange={(e) => setForm({ ...form, max_kullanici_sayisi: e.target.value })}
              />
              <span style={{ fontSize: 12, color: '#64748b' }}>
                Mevcut: <b>{mevcutKullanici ?? '...'}</b>
                {form.max_kullanici_sayisi !== '' && Number(form.max_kullanici_sayisi) > 0 && mevcutKullanici != null && mevcutKullanici > Number(form.max_kullanici_sayisi) && (
                  <span style={{ color: '#dc2626', marginLeft: 8, fontWeight: 700 }}>⚠ Mevcut kayıt sayısı bu limiti aşıyor</span>
                )}
                <span style={{ marginLeft: 8 }}>(boş bırak = sınırsız)</span>
              </span>
            </div>
          ) : (
            <span style={{ fontWeight: 600 }}>
              {(firma as any).max_kullanici_sayisi
                ? `${mevcutKullanici ?? '...'} / ${(firma as any).max_kullanici_sayisi}`
                : `${mevcutKullanici ?? '...'} / Sınırsız`}
            </span>
          )}
        </Row>

        <Row label="Lokasyon Limiti">
          {edit ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <input
                type="number"
                min={0}
                step={1}
                className="verde-input"
                style={{ width: 140 }}
                placeholder="Sınırsız"
                value={form.max_lokasyon_sayisi as any}
                onChange={(e) => setForm({ ...form, max_lokasyon_sayisi: e.target.value })}
              />
              <span style={{ fontSize: 12, color: '#64748b' }}>
                Mevcut: <b>{mevcutLokasyon ?? '...'}</b>
                {form.max_lokasyon_sayisi !== '' && Number(form.max_lokasyon_sayisi) > 0 && mevcutLokasyon != null && mevcutLokasyon > Number(form.max_lokasyon_sayisi) && (
                  <span style={{ color: '#dc2626', marginLeft: 8, fontWeight: 700 }}>⚠ Mevcut kayıt sayısı bu limiti aşıyor</span>
                )}
                <span style={{ marginLeft: 8 }}>(boş bırak = sınırsız)</span>
              </span>
            </div>
          ) : (
            <span style={{ fontWeight: 600 }}>
              {(firma as any).max_lokasyon_sayisi
                ? `${mevcutLokasyon ?? '...'} / ${(firma as any).max_lokasyon_sayisi}`
                : `${mevcutLokasyon ?? '...'} / Sınırsız`}
            </span>
          )}
        </Row>

        <Row label="Depolama Kapasitesi">
          {edit ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number"
                min={1}
                step={1}
                className="verde-input"
                style={{ width: 140 }}
                value={form.depolama_kapasitesi_mb}
                onChange={(e) => setForm({ ...form, depolama_kapasitesi_mb: Number(e.target.value) })}
              />
              <span style={{ fontSize: 12, color: '#64748b' }}>
                MB (≈ {(form.depolama_kapasitesi_mb / 1024).toFixed(2)} GB) — firma arşivi için rezerve edilen alan
              </span>
            </div>
          ) : (
            <span style={{ fontWeight: 600 }}>
              {Number((firma as any).depolama_kapasitesi_mb ?? 1024).toLocaleString('tr-TR')} MB
              <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>
                (≈ {(Number((firma as any).depolama_kapasitesi_mb ?? 1024) / 1024).toFixed(2)} GB)
              </span>
            </span>
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
              if (!v) return '#374151'
              return new Date() > new Date(v) ? '#c0392b' : '#374151'
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
      <div style={{ fontSize: 14, color: '#6b7280' }}>{label}</div>
      <div>{children}</div>
    </div>
  )
}

function MobilKoduPanel({ firmaId, initialKod }: { firmaId: string; initialKod: string }) {
  const [kod, setKod] = useState(initialKod || '—')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!kod || kod === '—') return
    try {
      await navigator.clipboard.writeText(kod)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {}
  }

  async function yenile() {
    const ok = typeof window !== 'undefined' && window.confirm(
      'Mobil firma kodu yenilensin mi? Eski kod ile yeni eşleşme yapılamaz. Mevcut cihazlar etkilenmez.'
    )
    if (!ok) return
    setLoading(true)
    try {
      const res = await fetch('/api/firmalar/mobil-kod-yenile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firma_id: firmaId }),
      })
      const j = await res.json()
      if (res.ok && j.ok) setKod(j.mobil_firma_kodu)
      else alert(j.error ?? 'Yenilenemedi')
    } catch (e: any) {
      alert(e?.message ?? 'Yenilenemedi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 20, fontWeight: 800, letterSpacing: 2,
        padding: '6px 14px', borderRadius: 8,
        background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#0f172a',
      }}>
        {kod}
      </div>
      <button type="button" onClick={copy} disabled={loading || kod === '—'}
        style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, borderRadius: 6, border: '1px solid #cbd5e1', background: copied ? '#dcfce7' : '#fff', color: copied ? '#166534' : '#1f2937', cursor: 'pointer' }}>
        {copied ? '✓ Kopyalandı' : 'Kopyala'}
      </button>
      <button type="button" onClick={yenile} disabled={loading}
        style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, borderRadius: 6, border: '1px solid #f59e0b', background: '#fffbeb', color: '#92400e', cursor: 'pointer', opacity: loading ? 0.5 : 1 }}>
        {loading ? 'Yenileniyor…' : 'Yenile'}
      </button>
      <span style={{ fontSize: 11.5, color: '#64748b', marginLeft: 6 }}>
        Personel mobil uygulamayı açarken bu kodu girer. Sızarsa yenileyin.
      </span>
    </div>
  )
}