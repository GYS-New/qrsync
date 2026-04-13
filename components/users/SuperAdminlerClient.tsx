'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from '@/types'
import Button from '@/components/ui/Button'
import UserAvatar from '@/components/layout/UserAvatar'
import RowActionButton from '@/components/ui/RowActionButton'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import PasswordInput from '@/components/ui/PasswordInput'

const ROL_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  super_admin:     { bg: '#e5e7eb', color: '#1f2937', label: 'SA — Süper Admin' },
  alt_super_admin: { bg: '#e8f4e8', color: '#2e7d32', label: '2.SA — Alt Süper Admin' },
}

export default function SuperAdminlerClient({
  initialUsers,
  currentUserId,
}: {
  initialUsers: User[]
  currentUserId: string
}) {
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [q, setQ] = useState('')
  const [users, setUsers] = useState<User[]>(initialUsers)
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  useEffect(() => { setUsers(initialUsers) }, [initialUsers])

  const [deviceTokenMap, setDeviceTokenMap] = useState<Record<string, {
    device_token: string
    device_id: string
    son_kullanim: string | null
  }>>({})

  // SA kullanıcılarının cihaz tokenlarını yükle
  useEffect(() => {
    fetch('/api/users/device-tokens')
      .then(r => r.json())
      .then(j => { if (j.ok) setDeviceTokenMap(j.data ?? {}) })
      .catch(() => {})
  }, [])

  // Modal state
  const [openCreate, setOpenCreate] = useState(false)
  const [createForm, setCreateForm] = useState({
    isim_soyisim: '', email: '', telefon: '', password: '', rol: 'alt_super_admin',
  })
  const [openEdit, setOpenEdit] = useState(false)
  const [openPass, setOpenPass] = useState(false)
  const [target, setTarget] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ isim_soyisim: '', email: '', telefon: '' })
  const [newPass, setNewPass] = useState('')

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return users
    return users.filter(u =>
      u.isim_soyisim?.toLowerCase().includes(s) ||
      u.email?.toLowerCase().includes(s) ||
      (u.telefon ?? '').toLowerCase().includes(s)
    )
  }, [q, users])

  function showErr(msg: string) { toast({ type: 'error', title: 'Hata', message: msg }) }
  function showOk(msg: string)  { toast({ type: 'success', title: 'Başarılı', message: msg }) }

  async function refresh() {
    const myReq = ++reqId.current
    setLoading(true)
    try {
      const res = await fetch('/api/sa/super-adminler')
      if (!res.ok) throw new Error('Yüklenemedi')
      const json = await res.json()
      if (myReq !== reqId.current) return
      setUsers(json.users ?? [])
    } catch (e: any) { showErr(e.message) }
    finally { if (reqId.current === myReq) setLoading(false) }
  }

  async function createUser() {
    if (!createForm.isim_soyisim || !createForm.email || !createForm.password) {
      showErr('İsim, email ve şifre zorunludur.')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...createForm }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Oluşturulamadı')
      showOk('Kullanıcı oluşturuldu.')
      setCreateForm({ isim_soyisim: '', email: '', telefon: '', password: '', rol: 'alt_super_admin' })
      setOpenCreate(false)
      await refresh()
    } catch (e: any) { showErr(e.message) }
    setLoading(false)
  }

  async function saveEdit() {
    if (!target) return
    setLoading(true)
    try {
      const res = await fetch(`/api/sa/users/${target.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isim_soyisim: editForm.isim_soyisim, email: editForm.email, telefon: editForm.telefon }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Güncelleme başarısız')
      showOk('Kullanıcı güncellendi.')
      setOpenEdit(false); setTarget(null)
      await refresh()
    } catch (e: any) { showErr(e.message) }
    setLoading(false)
  }

  async function changePassword() {
    if (!target) return
    if (!newPass || newPass.length < 6) { showErr('Şifre en az 6 karakter olmalı.'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/sa/users/${target.id}/password`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: newPass }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Şifre değiştirilemedi')
      showOk('Şifre güncellendi.')
      setOpenPass(false); setTarget(null); setNewPass('')
    } catch (e: any) { showErr(e.message) }
    setLoading(false)
  }

  async function toggleAktif(u: User) {
    if (u.id === currentUserId) { showErr('Kendi hesabınızın durumunu değiştiremezsiniz.'); return }
    const ok = await confirm({ title: 'Onay', message: `${u.isim_soyisim} durumu değiştirilsin mi?`, confirmText: 'Evet', cancelText: 'Vazgeç' })
    if (!ok) return
    const res = await fetch(`/api/sa/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ aktif: !u.aktif }),
    })
    const j = await res.json()
    if (!res.ok) { showErr(j.error ?? 'Güncellenemedi'); return }
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, aktif: !u.aktif } : x))
    showOk('Durum güncellendi.')
  }

  async function deleteUser(u: User) {
    if (u.id === currentUserId) { showErr('Kendi hesabınızı silemezsiniz.'); return }
    const ok = await confirm({ title: 'Silme Onayı', message: `${u.isim_soyisim} silinsin mi? Geri alınamaz.`, confirmText: 'Sil', cancelText: 'İptal', variant: 'danger' })
    if (!ok) return
    setLoading(true)
    try {
      const res = await fetch(`/api/sa/users/${u.id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Silinemedi')
      showOk('Kullanıcı silindi.')
      await refresh()
    } catch (e: any) { showErr(e.message) }
    setLoading(false)
  }

  async function deleteDeviceToken(u: User) {
    const ok = await confirm({
      title: 'Cihaz Eşlemesini Sil',
      message: `"${u.isim_soyisim}" kullanıcısının cihaz eşlemesi silinecek.\n\nKullanıcı tekrar kayıt olana kadar mobil uygulamayı kullanamaz. Onaylıyor musunuz?`,
      confirmText: 'Evet, Sil',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return
    setLoading(true)
    try {
      const res = await fetch(`/api/users/${u.id}/device-token`, { method: 'DELETE' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Silinemedi')
      showOk('Cihaz eşlemesi silindi.')
      setDeviceTokenMap(prev => { const n = { ...prev }; delete n[u.id]; return n })
    } catch (e: any) { showErr(e.message) }
    setLoading(false)
  }

  return (
    <div className="users-scale" style={{ padding: '24px 28px' }}>
      <div className="verde-card">
        {/* Toolbar */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="verde-input"
            placeholder="Kullanıcı ara (isim, email, telefon)"
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ maxWidth: 320 }}
            autoComplete="off"
          />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button variant="ghost" size="sm" onClick={refresh} disabled={loading} style={{ fontSize: 15 }}>
              {loading ? 'Yükleniyor…' : '↻ Yenile'}
            </Button>
            <Button variant="primary" onClick={() => setOpenCreate(true)} style={{ fontSize: 15 }}>
              ＋ Süper Admin Ekle
            </Button>
          </div>
        </div>

        {/* Tablo */}
        <table className="verde-table">
          <thead>
            <tr>
              <th>Kullanıcı</th>
              <th>Rol</th>
              <th>Telefon</th>
              <th>Durum</th>
              <th>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => {
              const badge = ROL_BADGE[u.rol]
              const isSelf = u.id === currentUserId
              return (
                <tr key={u.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <UserAvatar name={u.isim_soyisim} photoUrl={u.profil_foto} size={28} />
                      <div>
                        <div style={{ fontWeight: 600, color: '#111827' }}>
                          {u.isim_soyisim}
                          {isSelf && (
                            <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: '#374151', background: '#e5e7eb', padding: '1px 6px', borderRadius: 4 }}>
                              Siz
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: '#6b7280' }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {badge
                      ? <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: badge.bg, color: badge.color }}>{badge.label}</span>
                      : <span style={{ color: '#4b5563', fontSize: 13 }}>{u.rol}</span>
                    }
                  </td>
                  <td style={{ color: '#4b5563' }}>{u.telefon ?? '—'}</td>
                  <td>
                    <span className={`verde-badge ${u.aktif ? 'status-islemde' : 'status-iptal'}`}>
                      {u.aktif ? 'Aktif' : 'Pasif'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {!isSelf && (
                        <RowActionButton variant={u.aktif ? 'warning' : 'success'} onClick={() => toggleAktif(u)}>
                          {u.aktif ? 'Pasif Yap' : 'Aktif Yap'}
                        </RowActionButton>
                      )}
                      <RowActionButton variant="base" onClick={() => {
                        setTarget(u)
                        setEditForm({ isim_soyisim: u.isim_soyisim ?? '', email: u.email ?? '', telefon: u.telefon ?? '' })
                        setOpenEdit(true)
                      }}>Düzenle</RowActionButton>
                      <RowActionButton variant="base" onClick={() => { setTarget(u); setNewPass(''); setOpenPass(true) }}>Şifre</RowActionButton>
                      {deviceTokenMap[u.id] && (
                        <RowActionButton variant="danger" onClick={() => deleteDeviceToken(u)}>Cihaz Sil</RowActionButton>
                      )}
                      {!isSelf && (
                        <RowActionButton variant="danger" onClick={() => deleteUser(u)}>Sil</RowActionButton>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: '#6b7280', padding: '36px 0' }}>
                  Kayıt bulunamadı
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Kullanıcı Ekle Modal */}
      {openCreate && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setOpenCreate(false)}
        >
          <div className="verde-card" style={{ width: 520, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Süper Admin Ekle</div>
              <Button variant="ghost" size="sm" onClick={() => setOpenCreate(false)} style={{ padding: '4px 10px' }}>✕</Button>
            </div>
            <div style={{ padding: 18 }}>
              {/* Bilgi banner */}
              <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#f3f4f6', border: '1px solid #e5e7eb', fontSize: 13, color: '#2e7d32' }}>
                ℹ️ Bu kullanıcı sisteme tam erişim yetkisiyle oluşturulacaktır.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="verde-label">İsim Soyisim *</label>
                  <input className="verde-input" value={createForm.isim_soyisim} onChange={e => setCreateForm(f => ({ ...f, isim_soyisim: e.target.value }))} autoComplete="off" />
                </div>
                <div>
                  <label className="verde-label">Telefon</label>
                  <input className="verde-input" value={createForm.telefon} onChange={e => setCreateForm(f => ({ ...f, telefon: e.target.value }))} autoComplete="off" />
                </div>
                <div>
                  <label className="verde-label">Email *</label>
                  <input className="verde-input" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} autoComplete="off" />
                </div>
                <div>
                  <label className="verde-label">Şifre *</label>
                  <PasswordInput value={createForm.password} onChange={v => setCreateForm(f => ({ ...f, password: v }))} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="verde-label">Rol *</label>
                  <select className="verde-input" value={createForm.rol} onChange={e => setCreateForm(f => ({ ...f, rol: e.target.value }))}>
                    <option value="alt_super_admin">2.SA — Alt Süper Admin</option>
                    <option value="super_admin">SA — Süper Admin</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <Button variant="primary" onClick={createUser} disabled={loading}>
                  {loading ? 'Kaydediliyor…' : '✓ Oluştur'}
                </Button>
                <Button variant="ghost" onClick={() => setOpenCreate(false)}>İptal</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Düzenle Modal */}
      {openEdit && target && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { setOpenEdit(false); setTarget(null) }}
        >
          <div className="verde-card" style={{ width: 520, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Kullanıcı Düzenle</div>
              <Button variant="ghost" size="sm" onClick={() => { setOpenEdit(false); setTarget(null) }} style={{ padding: '4px 10px' }}>✕</Button>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="verde-label">İsim Soyisim</label>
                  <input className="verde-input" value={editForm.isim_soyisim} onChange={e => setEditForm(f => ({ ...f, isim_soyisim: e.target.value }))} autoComplete="off" />
                </div>
                <div>
                  <label className="verde-label">Telefon</label>
                  <input className="verde-input" value={editForm.telefon} onChange={e => setEditForm(f => ({ ...f, telefon: e.target.value }))} autoComplete="off" />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="verde-label">Email</label>
                  <input className="verde-input" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} autoComplete="off" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <Button variant="primary" onClick={saveEdit} disabled={loading}>{loading ? 'Kaydediliyor…' : '✓ Kaydet'}</Button>
                <Button variant="ghost" onClick={() => { setOpenEdit(false); setTarget(null) }}>İptal</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Şifre Modal */}
      {openPass && target && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => { setOpenPass(false); setTarget(null) }}
        >
          <div className="verde-card" style={{ width: 420, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Şifre Değiştir — {target.isim_soyisim}</div>
              <Button variant="ghost" size="sm" onClick={() => { setOpenPass(false); setTarget(null) }} style={{ padding: '4px 10px' }}>✕</Button>
            </div>
            <div style={{ padding: 18 }}>
              <label className="verde-label">Yeni Şifre</label>
              <PasswordInput value={newPass} onChange={setNewPass} />
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <Button variant="primary" onClick={changePassword} disabled={loading}>{loading ? 'Kaydediliyor…' : '✓ Kaydet'}</Button>
                <Button variant="ghost" onClick={() => { setOpenPass(false); setTarget(null) }}>İptal</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
