'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Topbar from '@/components/layout/Topbar'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/ToastProvider'

export default function FirmaYeniPage() {
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()
  const [form, setForm] = useState({ ticari_unvan:'', firma_adi:'', adres:'', vergi_dairesi:'', vergi_no:'', yetkili_isim:'', yetkili_tel:'', aciklama:'', qr_sablon_aktif: true, rapor_ozellestir_aktif: true, personel_takibi_aktif: false, birim_fiyat_aktif: false })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string) => (e: any) => {
    const v = e?.target?.value ?? ''
    // Firma Adı (Kısa) alanı max 7 karakter
    if (k === 'firma_adi') return setForm((f) => ({ ...f, [k]: String(v).slice(0, 7) }))
    return setForm((f) => ({ ...f, [k]: v }))
  }

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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const { data, error: err } = await supabase.from('firmalar').insert(form).select('id').single()
    if (err) { setError(err.message); toast({ type:'error', title:'Kaydedilemedi', message: err.message }); setSaving(false); return }
    const firmaId = (data as any)?.id as string
    if (logoFile && firmaId) {
      try {
        const blob = await resizePng(logoFile, 480, 480)
        const resizedFile = new File([blob], 'logo.png', { type: 'image/png' })
        const fd = new FormData()
        fd.append('firmaId', firmaId)
        fd.append('file', resizedFile)
        const res = await fetch('/api/upload/firma-logo', { method: 'POST', body: fd })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || 'Logo yüklenemedi')
} catch (e: any) {
        toast({ type:'error', title:'Logo yüklenemedi', message: e?.message ?? 'Logo yüklenemedi' })
      }
    }
    router.push('/sa/dashboard/firmalar')
  }

  return (
    <div>
      <Topbar title="Firma Ekle" base="/sa" breadcrumbs={[{label:'Firmalar',href:'/sa/dashboard/firmalar'},{label:'Yeni Firma'}]} />
      <div style={{padding:'24px 28px'}}>
        <div className="verde-card" style={{maxWidth:720}}>
          <div style={{padding:'16px 18px', borderBottom:'1px solid #ffe8c8'}}>
            <div style={{fontSize:13,fontWeight:700,color:'#3d1c00'}}>Yeni Firma Bilgileri</div>
          </div>
          <form onSubmit={handleSave} style={{padding:20}}>
            {error && <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:5,padding:'10px 14px',marginBottom:16,fontSize:12.5,color:'#b91c1c'}}>{error}</div>}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
              <div><label className="verde-label">Ticari Ünvan *</label><input className="verde-input" value={form.ticari_unvan} onChange={set('ticari_unvan')} required /></div>
              <div>
                <label className="verde-label">Firma Adı (Kısa) (Maks 7)</label>
                <input className="verde-input" value={form.firma_adi} onChange={set('firma_adi')} maxLength={7} />
                <div style={{ fontSize: 11.5, color: '#9a7b6a', marginTop: 6 }}>
                  {form.firma_adi.length}/7 karakter
                </div>
              </div>
              <div><label className="verde-label">Vergi Dairesi *</label><input className="verde-input" value={form.vergi_dairesi} onChange={set('vergi_dairesi')} required /></div>
              <div><label className="verde-label">Vergi Numarası *</label><input className="verde-input" value={form.vergi_no} onChange={set('vergi_no')} required /></div>
              <div><label className="verde-label">Yetkili Adı Soyadı *</label><input className="verde-input" value={form.yetkili_isim} onChange={set('yetkili_isim')} required /></div>
              <div><label className="verde-label">Yetkili Telefonu *</label><input className="verde-input" value={form.yetkili_tel} onChange={set('yetkili_tel')} required /></div>
            </div>
            <div style={{marginBottom:14}}><label className="verde-label">Adres *</label><input className="verde-input" value={form.adres} onChange={set('adres')} required /></div>
            <div style={{ marginBottom: 14 }}>
              <label className="verde-label">Firma Logosu (PNG/JPEG)</label>
              <input
                className="verde-input"
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
              />
              <div style={{ fontSize: 11.5, color: '#9a7b6a', marginTop: 6 }}>Logo dosyası otomatik küçültülerek yüklenir.</div>
            </div>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:12,fontWeight:700,color:'#4a5e4a',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.5px'}}>Özellikler</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                <label style={{display:'flex',alignItems:'center',gap:8,fontSize:14,color:'#3d1c00',cursor:'pointer'}}>
                  <input type="checkbox" checked={form.qr_sablon_aktif} onChange={e => setForm(f => ({...f, qr_sablon_aktif: e.target.checked}))} />
                  <span>Şablonlu QR Kart İndirme — Lokasyon QR kodlarını şablona yerleştirerek PNG olarak indirir</span>
                </label>
                <label style={{display:'flex',alignItems:'center',gap:8,fontSize:14,color:'#3d1c00',cursor:'pointer'}}>
                  <input type="checkbox" checked={form.rapor_ozellestir_aktif} onChange={e => setForm(f => ({...f, rapor_ozellestir_aktif: e.target.checked}))} />
                  <span>Rapor Özelleştir — Genel Rapor Şablonu sayfasına erişim</span>
                </label>
                <label style={{display:'flex',alignItems:'center',gap:8,fontSize:14,color:'#3d1c00',cursor:'pointer'}}>
                  <input type="checkbox" checked={form.personel_takibi_aktif} onChange={e => setForm(f => ({...f, personel_takibi_aktif: e.target.checked}))} />
                  <span>Personel Takibi — QR/NFC ile iş başı ve iş bitimi takip sistemi</span>
                </label>
                <label style={{display:'flex',alignItems:'center',gap:8,fontSize:14,color:'#3d1c00',cursor:'pointer'}}>
                  <input type="checkbox" checked={form.birim_fiyat_aktif} onChange={e => setForm(f => ({...f, birim_fiyat_aktif: e.target.checked}))} />
                  <span>Birim Fiyat Sistemi — Lokasyon grupları ve lokasyonlar için birim fiyat girişi</span>
                </label>
              </div>
            </div>
            <div style={{marginBottom:20}}><label className="verde-label">Açıklama (Maks 500 karakter)</label><textarea className="verde-input" rows={3} value={form.aciklama} onChange={set('aciklama')} maxLength={500} style={{resize:'vertical'}} /></div>
            <div style={{display:'flex',gap:8}}>
              <Button variant="primary" type="submit" disabled={saving}>{saving ? 'Kaydediliyor...' : '✓ Firmayı Kaydet'}</Button>
              <Button variant="ghost" type="button" onClick={() => router.back()}>İptal</Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
