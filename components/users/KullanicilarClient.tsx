'use client'

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import UserAvatar from '@/components/layout/UserAvatar'
import type { User, UserRole } from '@/types'
import Button from '@/components/ui/Button'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import RowActionButton from '@/components/ui/RowActionButton'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { IMPORT_EXPORT_BUTTON_STYLE } from '@/lib/import-export/constants'

const ROL_LABEL: Record<UserRole, string> = {
  super_admin: 'Süper Admin',
  alt_super_admin: '2. SA',
  tenant_admin: 'TA — Firma Admini',
  musteri: 'M — Müşteri',
  tenant_user: 'U — Kullanıcı',
}

const ROL_BADGE: Record<string, { bg: string; color: string; kisa: string }> = {
  super_admin:     { bg: '#dcf0dc', color: '#1f6b1f', kisa: 'SA' },
  alt_super_admin: { bg: '#e8f4e8', color: '#2e7d32', kisa: '2.SA' },
  tenant_admin:    { bg: '#fff3e0', color: '#e65100', kisa: 'TA' },
  musteri:         { bg: '#e3f2fd', color: '#1565c0', kisa: 'M' },
  tenant_user:     { bg: '#f3e5f5', color: '#6a1b9a', kisa: 'U' },
}

export default function KullanicilarClient({
  base,
  firmaId,
  initialUsers,
  canCreate,
  canManage,
  enableBulkImport = false,
  projeId,
}: {
  base: '/ta' | '/u' | '/sa'
  firmaId?: string | null
  initialUsers: User[]
  canCreate: boolean
  canManage: boolean
  enableBulkImport?: boolean
  projeId?: string | null
}) {
  const supabase = createClient()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const apiBase = base === '/sa' ? '/api/sa' : base === '/ta' ? '/api/ta' : '/api'

  const [q, setQ] = useState('')
  const [users, setUsers] = useState<User[]>(initialUsers)
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  // SSR yeni initialUsers getirince (firma/proje değişimi) sync et
  useEffect(() => { setUsers(initialUsers) }, [initialUsers])

  // Modal state'leri
  const [openCreate, setOpenCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ isim_soyisim: '', email: '', telefon: '', password: '', rol: 'tenant_user' as string })
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
      let q = supabase.from('users').select('*').order('kayit_tarihi', { ascending: false })
      if (firmaId) q = q.eq('firma_id', firmaId)
      if (projeId) q = (q as any).eq('proje_id', projeId)
      const { data, error } = await q
      if (myReq !== reqId.current) return
      if (error) { showErr(error.message); return }
      setUsers((data ?? []) as any)
    } finally {
      if (reqId.current === myReq) setLoading(false)
    }
  }

  async function downloadExcel(kind: 'template' | 'export') {
    try {
      const qStr = firmaId ? `?firmaId=${encodeURIComponent(firmaId)}` : ''
      const res = await fetch(`/api/import-export/users/${kind}${qStr}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'İndirilemedi')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = kind === 'template' ? 'kullanici-import-sablonu.xlsx' : 'kullanicilar.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { showErr(e.message) }
  }

  async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (firmaId) fd.append('firmaId', firmaId)
      const res = await fetch('/api/import-export/users/import', { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Import başarısız')
      await refresh()
      const extra = j.errors?.length ? ` Hata: ${j.errors.slice(0, 3).join(' | ')}` : ''
      showOk(`${j.created} kayıt içe aktarıldı.${extra}`)
    } catch (e: any) { showErr(e.message) }
    e.target.value = ''
    setLoading(false)
  }

  async function toggleAktif(u: User) {
    const ok = await confirm({ title: 'Onay', message: `${u.isim_soyisim} durumu değiştirilsin mi?`, confirmText: 'Evet', cancelText: 'Vazgeç' })
    if (!ok) return
    const { error } = await supabase.from('users').update({ aktif: !u.aktif }).eq('id', u.id)
    if (error) { showErr(error.message); return }
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, aktif: !u.aktif } : x))
    showOk('Durum güncellendi.')
  }

  async function setRole(u: User, rol: UserRole) {
    const ok = await confirm({ title: 'Rol Değişikliği', message: `${u.isim_soyisim} rolü "${ROL_LABEL[rol]}" yapılsın mı?`, confirmText: 'Değiştir', cancelText: 'İptal', variant: 'danger' })
    if (!ok) return
    const { error } = await supabase.from('users').update({ rol }).eq('id', u.id)
    if (error) { showErr(error.message); return }
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, rol } : x))
    showOk('Rol güncellendi.')
  }

  async function createUser() {
    if (!createForm.isim_soyisim || !createForm.email || !createForm.password) { showErr('İsim, email ve şifre zorunludur.'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...createForm, firma_id: firmaId, ...(projeId && createForm.rol !== 'alt_super_admin' ? { proje_id: projeId } : {}) }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Oluşturulamadı')
      showOk('Kullanıcı oluşturuldu.')
      setCreateForm({ isim_soyisim: '', email: '', telefon: '', password: '', rol: 'tenant_user' })
      setOpenCreate(false)
      await refresh()
    } catch (e: any) { showErr(e.message) }
    setLoading(false)
  }

  async function saveEdit() {
    if (!target) return
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/users/${target.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
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
      const res = await fetch(`${apiBase}/users/${target.id}/password`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: newPass }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Şifre değiştirilemedi')
      showOk('Şifre güncellendi.')
      setOpenPass(false); setTarget(null); setNewPass(''); setQ('')
    } catch (e: any) { showErr(e.message) }
    setLoading(false)
  }

  async function deleteUser(u: User) {
    const ok = await confirm({ title: 'Silme Onayı', message: `${u.isim_soyisim} silinsin mi? Geri alınamaz.`, confirmText: 'Sil', cancelText: 'İptal', variant: 'danger' })
    if (!ok) return
    setLoading(true)
    try {
      const res = await fetch(`${apiBase}/users/${u.id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Silinemedi')
      showOk('Kullanıcı silindi.')
      await refresh()
    } catch (e: any) { showErr(e.message) }
    setLoading(false)
  }

  const isSA = base === '/sa'
  const isTA = base === '/ta'

  return (
    <div className="users-scale" style={{ padding: '24px 28px' }}>
      <div className="verde-card">
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e8f0e8', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="verde-input" placeholder="Kullanıcı ara (isim, email, telefon)"
            value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 320 }} autoComplete="off"
          />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input ref={importInputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={onImportFile} />
            <Button variant="ghost" size="sm" onClick={refresh} disabled={loading} className="text-[15px]" style={IMPORT_EXPORT_BUTTON_STYLE}>
              {loading ? 'Yükleniyor…' : '↻ Yenile'}
            </Button>
            {enableBulkImport && (
              <>
                <Button variant="ghost" onClick={() => downloadExcel('template')} className="text-[15px]" style={IMPORT_EXPORT_BUTTON_STYLE}><Download size={16} /> Şablon</Button>
                <Button variant="ghost" onClick={() => importInputRef.current?.click()} className="text-[15px]" style={IMPORT_EXPORT_BUTTON_STYLE}><Upload size={16} /> Excel ile Ekle</Button>
                <Button variant="ghost" onClick={() => downloadExcel('export')} className="text-[15px]" style={IMPORT_EXPORT_BUTTON_STYLE}><FileSpreadsheet size={16} /> Dışa Aktar</Button>
              </>
            )}
            {canCreate && (
              <Button variant="primary" onClick={() => setOpenCreate(true)} className="text-[15px]" style={IMPORT_EXPORT_BUTTON_STYLE}>＋ Kullanıcı Ekle</Button>
            )}
          </div>
        </div>

        <table className="verde-table">
          <thead>
            <tr>
              <th>Kullanıcı</th>
              <th>Rol</th>
              <th>Telefon</th>
              <th>Durum</th>
              {canManage && <th>İşlem</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <UserAvatar name={u.isim_soyisim} photoUrl={u.profil_foto} size={28} />
                    <div>
                      <div style={{ fontWeight: 600, color: '#0f1a0f' }}>{u.isim_soyisim}</div>
                      <div style={{ fontSize: 13, color: '#7a907a' }}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  {(() => {
                    const b = ROL_BADGE[u.rol]
                    return b
                      ? <span style={{ fontSize: 11.5, fontWeight: 800, padding: '2px 8px', borderRadius: 6, background: b.bg, color: b.color }}>{b.kisa}</span>
                      : <span style={{ color: '#506050', fontSize: 13 }}>{u.rol}</span>
                  })()}
                </td>
                <td style={{ color: '#506050' }}>{u.telefon ?? '—'}</td>
                <td>
                  <span className={`verde-badge ${u.aktif ? 'status-islemde' : 'status-iptal'}`}>{u.aktif ? 'Aktif' : 'Pasif'}</span>
                </td>
                {canManage && (
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <RowActionButton variant={u.aktif ? 'warning' : 'success'} onClick={() => toggleAktif(u)}>
                        {u.aktif ? 'Pasif Yap' : 'Aktif Yap'}
                      </RowActionButton>
                      {(isSA || isTA) && (
                        <>
                          {isSA && <RowActionButton variant="base" onClick={() => setRole(u, 'tenant_admin')}>Admin Yap</RowActionButton>}
                          {isSA && <RowActionButton variant="base" onClick={() => setRole(u, 'tenant_user')}>Kullanıcı Yap</RowActionButton>}
                          <RowActionButton variant="base" onClick={() => { setTarget(u); setEditForm({ isim_soyisim: u.isim_soyisim ?? '', email: u.email ?? '', telefon: u.telefon ?? '' }); setOpenEdit(true) }}>Düzenle</RowActionButton>
                          <RowActionButton variant="base" onClick={() => { setTarget(u); setNewPass(''); setOpenPass(true) }}>Şifre</RowActionButton>
                          <RowActionButton variant="danger" onClick={() => deleteUser(u)}>Sil</RowActionButton>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!filtered.length && (
              <tr><td colSpan={canManage ? 5 : 4} style={{ textAlign: 'center', color: '#7a907a', padding: '36px 0' }}>Kayıt bulunamadı</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Kullanıcı Ekle Modal */}
      {openCreate && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setOpenCreate(false)}>
          <div className="verde-card" style={{ width: 520, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #e8f0e8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Kullanıcı Ekle</div>
              <Button variant="ghost" size="sm" onClick={() => setOpenCreate(false)} style={{ padding: '4px 10px' }}>✕</Button>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label className="verde-label">İsim Soyisim *</label><input className="verde-input" value={createForm.isim_soyisim} onChange={e => setCreateForm(f => ({ ...f, isim_soyisim: e.target.value }))} autoComplete="off" /></div>
                <div><label className="verde-label">Telefon</label><input className="verde-input" value={createForm.telefon} onChange={e => setCreateForm(f => ({ ...f, telefon: e.target.value }))} autoComplete="off" /></div>
                <div><label className="verde-label">Email *</label><input className="verde-input" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} autoComplete="off" /></div>
                <div><label className="verde-label">Şifre *</label><input className="verde-input" type="password" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} autoComplete="new-password" /></div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label className="verde-label">Kullanıcı Grubu *</label>
                  <select className="verde-input" value={createForm.rol} onChange={e => setCreateForm(f => ({ ...f, rol: e.target.value }))}>
                    {isSA && <option value="alt_super_admin">2.SA — Alt Süper Admin</option>}
                    <option value="tenant_admin">TA — Firma Admini</option>
                    <option value="musteri">M — Müşteri</option>
                    <option value="tenant_user">U — Kullanıcı</option>
                  </select>
                  <div style={{ fontSize: 11.5, color: '#7a907a', marginTop: 4 }}>
                    SA: sisteme erişim tam yetki · TA: firma yönetimi · M: müşteri görüntüleme · U: operatör
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <Button variant="primary" onClick={createUser} disabled={loading}>{loading ? 'Kaydediliyor…' : '✓ Oluştur'}</Button>
                <Button variant="ghost" onClick={() => setOpenCreate(false)}>İptal</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Düzenle Modal */}
      {openEdit && target && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { setOpenEdit(false); setTarget(null) }}>
          <div className="verde-card" style={{ width: 560, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #e8f0e8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Kullanıcı Düzenle</div>
              <Button variant="ghost" size="sm" onClick={() => { setOpenEdit(false); setTarget(null) }} style={{ padding: '4px 10px' }}>✕</Button>
            </div>
            <div style={{ padding: 18 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label className="verde-label">İsim Soyisim</label><input className="verde-input" value={editForm.isim_soyisim} onChange={e => setEditForm(f => ({ ...f, isim_soyisim: e.target.value }))} autoComplete="off" /></div>
                <div><label className="verde-label">Telefon</label><input className="verde-input" value={editForm.telefon} onChange={e => setEditForm(f => ({ ...f, telefon: e.target.value }))} autoComplete="off" /></div>
                <div style={{ gridColumn: '1 / -1' }}><label className="verde-label">Email</label><input className="verde-input" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} autoComplete="off" /></div>
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { setOpenPass(false); setTarget(null) }}>
          <div className="verde-card" style={{ width: 420, padding: 0, overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #e8f0e8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Şifre Değiştir — {target.isim_soyisim}</div>
              <Button variant="ghost" size="sm" onClick={() => { setOpenPass(false); setTarget(null) }} style={{ padding: '4px 10px' }}>✕</Button>
            </div>
            <div style={{ padding: 18 }}>
              <label className="verde-label">Yeni Şifre</label>
              <input className="verde-input" type="password" value={newPass} onChange={e => setNewPass(e.target.value)} autoComplete="new-password" />
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
