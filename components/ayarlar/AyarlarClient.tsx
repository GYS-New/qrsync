'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import UserAvatar from '@/components/layout/UserAvatar'
import type { User } from '@/types'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/ToastProvider'
import PasswordInput from '@/components/ui/PasswordInput'

export default function AyarlarClient({
  meId,
  initialMe,
}: {
  meId: string
  initialMe: User
}) {
  const supabase = createClient()
  const router = useRouter()
  const { toast } = useToast()
  const [me, setMe] = useState<User>(initialMe)
  const [form, setForm] = useState({
    isim_soyisim: initialMe.isim_soyisim ?? '',
    telefon: initialMe.telefon ?? '',
    adres: initialMe.adres ?? '',
    tc_no: initialMe.tc_no ?? '',
  })
  const [profilFoto, setProfilFoto] = useState<string | null>(initialMe.profil_foto ?? null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [loading, setLoading] = useState(false)
  const [avatarKey, setAvatarKey] = useState(0) // cache-bust for avatar
  const [emailValue, setEmailValue] = useState(initialMe.email ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  // Cihaz eşleşme bilgisi
  const [cihaz, setCihaz] = useState<{ device_id: string; aktif: boolean; son_kullanim: string | null } | null | 'loading'>('loading')
  const [cihazSilLoading, setCihazSilLoading] = useState(false)

  useEffect(() => {
    fetch('/api/profile/device-token')
      .then(r => r.json())
      .then(j => setCihaz(j.ok ? (j.data ?? null) : null))
      .catch(() => setCihaz(null))
  }, [])

  const emailErrorMessage = useMemo(
    () => ({
      invalid: 'Geçersiz e-posta adresi',
      used: 'Bu e-posta başka bir kullanıcı tarafından kullanılıyor',
      password: 'Mevcut şifre hatalı',
      generic: 'E-posta güncellenemedi',
    }),
    []
  )

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

  async function uploadProfilFoto(file: File) {
    setLoading(true)
    try {
      const blob = await resizeToSquarePng(file, 256)
      const resizedFile = new File([blob], 'avatar.png', { type: 'image/png' })
      const fd = new FormData()
      fd.append('file', resizedFile)
      const res = await fetch('/api/upload/avatar', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Fotoğraf yüklenemedi')
      const publicUrl = json.publicUrl as string
      setProfilFoto(publicUrl)
      setAvatarKey(k => k + 1)
      setMe((prev) => ({ ...(prev as any), profil_foto: publicUrl } as any))
      router.refresh() // Sidebar avatar güncelle
      toast({ type: 'success', title: 'Başarılı', message: 'Profil fotoğrafı güncellendi.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Yüklenemedi', message: e?.message ?? 'Fotoğraf yüklenemedi' })
    } finally {
      setLoading(false)
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { data, error: err } = await supabase
      .from('users')
      .update({
        isim_soyisim: form.isim_soyisim.trim(),
        telefon: form.telefon.trim() || null,
        adres: form.adres.trim() || null,
        tc_no: form.tc_no.trim() || null,
        profil_foto: profilFoto || null,
      })
      .eq('id', meId)
      .select('*')
      .single()

    setLoading(false)
    if (err) {
      toast({ type: 'error', title: 'Kaydedilemedi', message: err.message })
      return
    }
    if (data) setMe(data as any)
    toast({ type: 'success', title: 'Başarılı', message: 'Profil güncellendi.' })
  }

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault()
    if (emailLoading || loading || pwLoading) return
    const nextEmail = emailValue.trim().toLowerCase()
    const current = currentPassword.trim()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (!nextEmail) {
      toast({ type: 'error', title: 'Eksik Bilgi', message: 'E-posta alanı zorunludur.' })
      return
    }
    if (!emailRegex.test(nextEmail)) {
      toast({ type: 'error', title: 'Geçersiz E-posta', message: emailErrorMessage.invalid })
      return
    }
    if (!current) {
      toast({ type: 'error', title: 'Eksik Bilgi', message: 'E-posta değişikliği için mevcut şifrenizi girin.' })
      return
    }
    if (nextEmail === (me.email ?? '').trim().toLowerCase()) {
      toast({ type: 'success', title: 'Bilgi', message: 'E-posta adresiniz zaten güncel.' })
      return
    }

    setEmailLoading(true)
    try {
      const res = await fetch('/api/profile/email', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: nextEmail, currentPassword: current }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || emailErrorMessage.generic)
      setMe((prev) => ({ ...(prev as any), email: nextEmail } as any))
      setEmailValue(nextEmail)
      setCurrentPassword('')
      toast({ type: 'success', title: 'Başarılı', message: 'E-posta adresiniz güncellendi.' })
    } catch (e: any) {
      const msg = String(e?.message ?? emailErrorMessage.generic)
      const lower = msg.toLowerCase()
      let friendly = msg
      if (lower.includes('invalid email') || lower.includes('geçersiz')) friendly = emailErrorMessage.invalid
      else if (lower.includes('already') || lower.includes('registered') || lower.includes('exists') || lower.includes('duplicate') || lower.includes('kullanılıyor')) friendly = emailErrorMessage.used
      else if (lower.includes('invalid login credentials') || lower.includes('mevcut şifre') || lower.includes('password')) friendly = emailErrorMessage.password
      toast({ type: 'error', title: 'Güncellenemedi', message: friendly })
    } finally {
      setEmailLoading(false)
    }
  }

  async function cihazSil() {
    if (!confirm('Cihaz eşleşmesi silinecek. Mobil uygulamada tekrar giriş yapmanız gerekecektir. Devam edilsin mi?')) return
    setCihazSilLoading(true)
    try {
      const res = await fetch('/api/profile/device-token', { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error ?? 'Silinemedi')
      setCihaz(null)
      toast({ type: 'success', title: 'Başarılı', message: 'Cihaz eşleşmesi silindi.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e?.message ?? 'Cihaz eşleşmesi silinemedi' })
    } finally {
      setCihazSilLoading(false)
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    if (pwLoading || loading || emailLoading) return
    setPwLoading(true)
    try {
      const p1 = pw1.trim()
      const p2 = pw2.trim()
      if (!p1 || p1.length < 6) {
        toast({ type: 'error', title: 'Hatalı Şifre', message: 'Şifre en az 6 karakter olmalıdır.' })
        return
      }
      if (p1 !== p2) {
        toast({ type: 'error', title: 'Şifreler Uyuşmuyor', message: 'Yeni şifre ve tekrar şifre aynı olmalıdır.' })
        return
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: p1 })
      if (updateError) throw updateError
      setPw1('')
      setPw2('')
      toast({ type: 'success', title: 'Başarılı', message: 'Şifreniz güncellendi.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Güncellenemedi', message: e?.message ?? 'Şifre güncellenemedi' })
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="verde-card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <UserAvatar name={me.isim_soyisim} photoUrl={profilFoto ? `${profilFoto}?v=${avatarKey}` : undefined} size={46} />
          <div>
            <div style={{ fontWeight: 800, color: '#111827' }}>{me.isim_soyisim}</div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{me.email}</div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadProfilFoto(f)
                if (e.currentTarget) e.currentTarget.value = ''
              }}
            />
            <Button variant="ghost" type="button" onClick={() => fileRef.current?.click()} disabled={loading}>
              {profilFoto ? 'Fotoğraf Değiştir' : 'Fotoğraf Ekle'}
            </Button>
            {profilFoto && (
              <Button variant="danger" type="button" disabled={loading} onClick={async () => {
                setLoading(true)
                try {
                  await supabase.from('users').update({ profil_foto: null }).eq('id', meId)
                  setProfilFoto(null)
                  setMe((prev) => ({ ...(prev as any), profil_foto: null } as any))
                  router.refresh() // Sidebar avatar güncelle
                  toast({ type: 'success', title: 'Başarılı', message: 'Profil fotoğrafı kaldırıldı.' })
                } catch (e: any) {
                  toast({ type: 'error', title: 'Hata', message: e?.message ?? 'Fotoğraf kaldırılamadı' })
                } finally { setLoading(false) }
              }}>
                Temizle
              </Button>
            )}
          </div>
        </div>

        <form onSubmit={saveProfile} style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Ad Soyad">
              <input className="verde-input" value={form.isim_soyisim} onChange={(e) => setForm({ ...form, isim_soyisim: e.target.value })} />
            </Field>
            <Field label="Telefon">
              <input className="verde-input" value={form.telefon} onChange={(e) => setForm({ ...form, telefon: e.target.value })} />
            </Field>
          </div>
          <Field label="Adres">
            <input className="verde-input" value={form.adres} onChange={(e) => setForm({ ...form, adres: e.target.value })} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="TC No">
              <input className="verde-input" value={form.tc_no} onChange={(e) => setForm({ ...form, tc_no: e.target.value })} />
            </Field>
            <Field label="Profil Foto">
              <input className="verde-input" value={profilFoto ?? ''} disabled placeholder="(Dosya yükleyerek güncelleyin)" />
            </Field>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" disabled={loading}>Kaydet</Button>
          </div>
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
        <div className="verde-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 800, color: '#111827' }}>E-posta Değiştir</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Yeni e-posta ve mevcut şifreniz ile güncelleyin.</div>
            </div>
          </div>

          <form onSubmit={changeEmail} style={{ display: 'grid', gap: 10 }}>
            <Field label="Yeni E-posta">
              <input className="verde-input" type="email" value={emailValue} onChange={(e) => setEmailValue(e.target.value)} />
            </Field>
            <Field label="Mevcut Şifre">
              <input className="verde-input" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" disabled={emailLoading || loading || pwLoading}>
                {emailLoading ? 'Güncelleniyor…' : 'E-postayı Güncelle'}
              </Button>
            </div>
          </form>
        </div>

        <div className="verde-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontWeight: 800, color: '#111827' }}>Şifre Değiştir</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Yeni şifreniz en az 6 karakter olmalıdır.</div>
            </div>
          </div>

          <form onSubmit={changePassword} style={{ display: 'grid', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Yeni Şifre">
                <PasswordInput value={pw1} onChange={setPw1} />
              </Field>
              <Field label="Yeni Şifre (Tekrar)">
                <PasswordInput value={pw2} onChange={setPw2} />
              </Field>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" disabled={pwLoading || loading || emailLoading}>
                {pwLoading ? 'Güncelleniyor…' : 'Şifreyi Güncelle'}
              </Button>
            </div>
          </form>
        </div>
        <div className="verde-card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 800, color: '#111827', marginBottom: 4 }}>Cihaz Eşleşmesi</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>Mobil uygulamaya bağlı cihaz bilgisi.</div>
          {cihaz === 'loading' ? (
            <div style={{ fontSize: 13, color: '#6b7280' }}>Yükleniyor…</div>
          ) : cihaz ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, background: '#f0f7f0', borderRadius: 6, padding: '4px 10px', color: '#1a5c1a', fontFamily: 'monospace' }}>
                  {cihaz.device_id ?? '—'}
                </div>
                <div style={{ fontSize: 12, color: cihaz.aktif ? '#166534' : '#9a3412' }}>
                  {cihaz.aktif ? '● Aktif' : '○ Pasif'}
                </div>
              </div>
              {cihaz.son_kullanim && (
                <div style={{ fontSize: 11, color: '#6b7280' }}>
                  Son kullanım: {new Date(cihaz.son_kullanim).toLocaleString('tr-TR')}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <Button variant="danger" type="button" onClick={cihazSil} disabled={cihazSilLoading}>
                  {cihazSilLoading ? 'Siliniyor…' : 'Cihaz Eşleşmesini Sil'}
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#6b7280' }}>Eşleştirilmiş cihaz bulunamadı.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
      {children}
    </label>
  )
}
