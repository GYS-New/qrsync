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
  canDelete = canManage,
  enableBulkImport = false,
  projeId,
  ustLokasyonlar = [],
}: {
  base: '/ta' | '/u' | '/sa'
  firmaId?: string | null
  initialUsers: User[]
  canCreate: boolean
  canManage: boolean
  canDelete?: boolean
  enableBulkImport?: boolean
  projeId?: string | null
  ustLokasyonlar?: { id: string; tanim: string }[]
}) {
  const supabase = createClient()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const isSA = base === '/sa'
  const lokMap = useMemo(() => new Map(ustLokasyonlar.map(l => [l.id, l.tanim])), [ustLokasyonlar])
  const apiBase = base === '/sa' ? '/api/sa' : base === '/ta' ? '/api/ta' : '/api'

  const [q, setQ] = useState('')
  const [filtreLokasyon, setFiltreLokasyon] = useState('')
  const [filtreDurum, setFiltreDurum] = useState<'' | 'aktif' | 'pasif'>('')
  const [filtreRol, setFiltreRol] = useState('')
  const [users, setUsers] = useState<User[]>(initialUsers)
  const [seciliIds, setSeciliIds] = useState<Set<string>>(new Set())
  const [topluSilModu, setTopluSilModu] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deviceTokenMap, setDeviceTokenMap] = useState<Record<string, {
    device_token: string
    device_id: string
    son_kullanim: string | null
  }>>({})
  const reqId = useRef(0)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  // SSR yeni initialUsers getirince (firma/proje değişimi) sync et
  useEffect(() => { setUsers(initialUsers) }, [initialUsers])

  // Device token'ları yükle (API üzerinden — RLS bypass)
  useEffect(() => {
    if (!firmaId) return
    fetch(`/api/users/device-tokens?firma_id=${firmaId}`)
      .then(r => r.json())
      .then(j => {
        if (!j.ok) return
        setDeviceTokenMap(j.data as Record<string, { device_token: string; device_id: string; son_kullanim: string | null }>)
      })
      .catch(() => {})
  }, [firmaId])

  // Modal state'leri
  const [openCreate, setOpenCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ isim_soyisim: '', email: '', telefon: '', password: '', rol: 'tenant_user' as string, ust_lokasyon_id: '' })
  const [openEdit, setOpenEdit] = useState(false)
  const [openPass, setOpenPass] = useState(false)
  const [target, setTarget] = useState<User | null>(null)
  const [editForm, setEditForm] = useState({ isim_soyisim: '', email: '', telefon: '' })
  const [newPass, setNewPass] = useState('')

  // SA için form içi proje seçici
  const [formProjeler, setFormProjeler] = useState<{ id: string; ad: string }[]>([])
  const [formProjeId,  setFormProjeId]  = useState<string>('')

  // SA kullanıcı oluşturma modalı açıldığında projeleri yükle
  useEffect(() => {
    if (!openCreate || !isSA || !firmaId) return
    fetch(`/api/projeler?firma_id=${firmaId}`)
      .then(r => r.json())
      .then((data: any[]) => {
        const aktifler = (data ?? []).filter((p: any) => p.aktif !== false)
        setFormProjeler(aktifler)
        // Mevcut aktif proje varsa default olarak seç
        if (aktifler.length === 1) setFormProjeId(aktifler[0].id)
        else if (projeId) setFormProjeId(projeId)
        else setFormProjeId('')
      })
      .catch(() => {})
  }, [openCreate, isSA, firmaId, projeId])

  const filtered = useMemo(() => {
    let list = users
    const s = q.trim().toLowerCase()
    if (s) list = list.filter(u =>
      u.isim_soyisim?.toLowerCase().includes(s) ||
      u.email?.toLowerCase().includes(s) ||
      (u.telefon ?? '').toLowerCase().includes(s)
    )
    if (filtreLokasyon) list = list.filter(u => (u as any).ust_lokasyon_id === filtreLokasyon)
    if (filtreLokasyon === '__bos') list = users.filter(u => !(u as any).ust_lokasyon_id)
    if (filtreDurum === 'aktif') list = list.filter(u => u.aktif)
    if (filtreDurum === 'pasif') list = list.filter(u => !u.aktif)
    if (filtreRol) list = list.filter(u => u.rol === filtreRol)
    return list
  }, [q, users, filtreLokasyon, filtreDurum, filtreRol])

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
      if (projeId) fd.append('projeId', projeId)
      const res = await fetch('/api/import-export/users/import', { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Import başarısız')
      await refresh()
      const extra = j.errors?.length ? `\n${j.errors.slice(0, 10).join('\n')}` : ''
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

  async function createUser() {
    if (!createForm.isim_soyisim || !createForm.email || !createForm.password) { showErr('İsim, email ve şifre zorunludur.'); return }

    // SA: alt_super_admin harici rollerde proje zorunlu
    const isAltSA = createForm.rol === 'alt_super_admin'
    if (isSA && !isAltSA && !formProjeId) { showErr('Lütfen bir proje seçin.'); return }

    // Hangi proje_id gönderilecek: SA → formProjeId, TA → projeId (API cookie fallback yapar)
    const gonderilenProjeId = isSA ? (isAltSA ? undefined : formProjeId) : (projeId ?? undefined)

    setLoading(true)
    try {
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          ...createForm,
          ust_lokasyon_id: createForm.ust_lokasyon_id || null,
          firma_id: firmaId,
          ...(gonderilenProjeId ? { proje_id: gonderilenProjeId } : {}),
        }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Oluşturulamadı')
      showOk('Kullanıcı oluşturuldu.')
      setCreateForm({ isim_soyisim: '', email: '', telefon: '', password: '', rol: 'tenant_user', ust_lokasyon_id: '' })
      setFormProjeId('')
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

  const toggleSecim = (id: string) => setSeciliIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const tumunuSec = () => {
    if (seciliIds.size === filtered.length) setSeciliIds(new Set())
    else setSeciliIds(new Set(filtered.map(u => u.id)))
  }

  async function topluSil() {
    if (!seciliIds.size) return
    const taSecili = filtered.filter(u => seciliIds.has(u.id) && u.rol === 'tenant_admin')
    if (taSecili.length > 0) {
      showErr(`${taSecili.length} TA kullanıcısı seçili — TA'lar toplu silinemez. Lütfen TA'ları seçimden çıkarın.`)
      return
    }
    const ok = await confirm({
      title: 'Toplu Silme Onayı',
      message: `Seçili ${seciliIds.size} kullanıcı kalıcı olarak silinecek.\n\nBu işlem geri alınamaz!`,
      confirmText: `${seciliIds.size} Kullanıcı Sil`,
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return
    setLoading(true)
    try {
      const res = await fetch('/api/users/toplu-sil', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(seciliIds) }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Toplu silme başarısız')
      showOk(`${j.silinen ?? seciliIds.size} kullanıcı silindi.`)
      setSeciliIds(new Set())
      await refresh()
    } catch (e: any) { showErr(e.message) }
    setLoading(false)
  }

  const isTA = base === '/ta'

  return (
    <div className="users-scale" style={{ padding: '24px 28px' }}>
      <div className="verde-card">
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e8f0e8', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="verde-input" placeholder="Ara (isim, email, telefon)"
            value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth: 220 }} autoComplete="off"
          />
          {ustLokasyonlar.length > 0 && (
            <select className="verde-select" value={filtreLokasyon} onChange={e => setFiltreLokasyon(e.target.value)} style={{ width: 148 }}>
              <option value="">Lokasyon (Tümü)</option>
              <option value="__bos">— Atanmamış —</option>
              {ustLokasyonlar.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
            </select>
          )}
          <select className="verde-select" value={filtreDurum} onChange={e => setFiltreDurum(e.target.value as any)} style={{ width: 110 }}>
            <option value="">Durum (Tümü)</option>
            <option value="aktif">Aktif</option>
            <option value="pasif">Pasif</option>
          </select>
          <select className="verde-select" value={filtreRol} onChange={e => setFiltreRol(e.target.value)} style={{ width: 120 }}>
            <option value="">Rol (Tümü)</option>
            <option value="tenant_admin">TA</option>
            <option value="tenant_user">Kullanıcı</option>
            <option value="musteri">Müşteri</option>
          </select>
          <span style={{ fontSize: 12, color: '#7a907a' }}>{filtered.length}/{users.length}</span>
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
            {canCreate && !topluSilModu && (
              <Button variant="primary" onClick={() => setOpenCreate(true)} className="text-[15px]" style={IMPORT_EXPORT_BUTTON_STYLE}>＋ Kullanıcı Ekle</Button>
            )}
            {canDelete && !topluSilModu && (
              <Button variant="ghost" onClick={() => { setTopluSilModu(true); setSeciliIds(new Set()) }} className="text-[15px]" style={{ ...IMPORT_EXPORT_BUTTON_STYLE, color: '#dc2626', borderColor: '#fca5a5' }}>🗑 Toplu Sil</Button>
            )}
            {topluSilModu && (
              <>
                {seciliIds.size > 0 ? (
                  <Button variant="ghost" onClick={topluSil} disabled={loading} className="text-[15px]" style={{ ...IMPORT_EXPORT_BUTTON_STYLE, background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}>🗑 {seciliIds.size} Seçili Sil</Button>
                ) : (
                  <Button variant="ghost" onClick={() => { setTopluSilModu(false); setSeciliIds(new Set()) }} className="text-[15px]" style={IMPORT_EXPORT_BUTTON_STYLE}>Vazgeç</Button>
                )}
                {seciliIds.size > 0 && (
                  <Button variant="ghost" onClick={() => { setTopluSilModu(false); setSeciliIds(new Set()) }} className="text-[15px]" style={IMPORT_EXPORT_BUTTON_STYLE}>Vazgeç</Button>
                )}
              </>
            )}
          </div>
        </div>

        <table className="verde-table">
          <thead>
            <tr>
              {topluSilModu && (
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={filtered.length > 0 && seciliIds.size === filtered.length} onChange={tumunuSec}
                    style={{ width: 16, height: 16, cursor: 'pointer' }} />
                </th>
              )}
              <th>Kullanıcı</th>
              <th>Rol</th>
              <th>Üst Lokasyon</th>
              <th>Telefon</th>
              <th>Cihaz Eşleşmesi</th>
              <th>Durum</th>
              {canManage && <th style={{ textAlign: 'right' }}>İşlem</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id} style={{ background: topluSilModu && seciliIds.has(u.id) ? '#fef2f2' : undefined }}>
                {topluSilModu && (
                  <td>
                    <input type="checkbox" checked={seciliIds.has(u.id)} onChange={() => toggleSecim(u.id)}
                      style={{ width: 16, height: 16, cursor: 'pointer' }} />
                  </td>
                )}
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
                <td>
                  {canManage && ustLokasyonlar.length > 0 ? (
                    <select
                      value={(u as any).ust_lokasyon_id ?? ''}
                      onChange={async (e) => {
                        const val = e.target.value || null
                        try {
                          const res = await fetch(`/api/users/${u.id}/ust-lokasyon`, {
                            method: 'PATCH',
                            headers: { 'content-type': 'application/json' },
                            body: JSON.stringify({ ust_lokasyon_id: val }),
                          })
                          const j = await res.json()
                          if (!res.ok) throw new Error(j.error ?? 'Güncellenemedi')
                          setUsers(prev => prev.map(x => x.id === u.id ? { ...x, ust_lokasyon_id: val } as any : x))
                          toast({ type: 'success', title: 'Güncellendi', message: `${u.isim_soyisim} üst lokasyonu değiştirildi.` })
                        } catch (err: any) { toast({ type: 'error', title: 'Hata', message: err.message }) }
                      }}
                      style={{ height: 30, padding: '0 6px', borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', fontSize: 12.5, maxWidth: 140 }}
                    >
                      <option value="">—</option>
                      {ustLokasyonlar.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                    </select>
                  ) : (
                    <span style={{ fontSize: 12.5, color: '#506050' }}>{(u as any).ust_lokasyon_id ? lokMap.get((u as any).ust_lokasyon_id) ?? '—' : '—'}</span>
                  )}
                </td>
                <td style={{ color: '#506050' }}>{u.telefon ?? '—'}</td>
                <td>
                  {deviceTokenMap[u.id] ? (() => {
                    const d = deviceTokenMap[u.id]
                    const sonKullanim = d.son_kullanim
                      ? new Date(d.son_kullanim).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
                      : null
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#166534', background: '#dcfce7', padding: '3px 10px', borderRadius: 20, width: 'fit-content' }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
                          Cihaz Eşleşti
                        </span>
                        <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }} title={d.device_token}>
                          {d.device_token.substring(0, 12)}…
                        </span>
                        {sonKullanim && (
                          <span style={{ fontSize: 11, color: '#94a3b8' }}>Son: {sonKullanim}</span>
                        )}
                      </div>
                    )
                  })()
                  : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#94a3b8', background: '#f1f5f9', padding: '3px 10px', borderRadius: 20 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#cbd5e1', flexShrink: 0 }} />
                      Eşleşme Yok
                    </span>
                  )}
                </td>
                <td>
                  <span className={`verde-badge ${u.aktif ? 'status-islemde' : 'status-iptal'}`}>{u.aktif ? 'Aktif' : 'Pasif'}</span>
                </td>
                {canManage && (
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <RowActionButton variant={u.aktif ? 'warning' : 'success'} onClick={() => toggleAktif(u)}>
                        {u.aktif ? 'Pasif Yap' : 'Aktif Yap'}
                      </RowActionButton>
                      {(isSA || isTA) && (
                        <>
                          <RowActionButton variant="base" onClick={() => { setTarget(u); setEditForm({ isim_soyisim: u.isim_soyisim ?? '', email: u.email ?? '', telefon: u.telefon ?? '' }); setOpenEdit(true) }}>Düzenle</RowActionButton>
                          <RowActionButton variant="base" onClick={() => { setTarget(u); setNewPass(''); setOpenPass(true) }}>Şifre</RowActionButton>
                          {deviceTokenMap[u.id] && (
                            <RowActionButton variant="danger" onClick={() => deleteDeviceToken(u)}>Cihaz Sil</RowActionButton>
                          )}
                          {canDelete && <RowActionButton variant="danger" onClick={() => deleteUser(u)}>Sil</RowActionButton>}
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!filtered.length && (
              <tr><td colSpan={canManage ? 6 : 5} style={{ textAlign: 'center', color: '#7a907a', padding: '36px 0' }}>Kayıt bulunamadı</td></tr>
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

                {/* SA: proje seçici (alt_super_admin hariç) */}
                {isSA && createForm.rol !== 'alt_super_admin' && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="verde-label">Proje *</label>
                    {formProjeler.length === 0 ? (
                      <div style={{ fontSize: 13, color: '#dc2626', padding: '8px 0' }}>
                        Bu firmaya ait aktif proje bulunamadı. Önce proje oluşturun.
                      </div>
                    ) : (
                      <select
                        className="verde-input"
                        value={formProjeId}
                        onChange={e => setFormProjeId(e.target.value)}
                      >
                        <option value="">— Proje seçin —</option>
                        {formProjeler.map(p => (
                          <option key={p.id} value={p.id}>{p.ad}</option>
                        ))}
                      </select>
                    )}
                    <div style={{ fontSize: 11.5, color: '#7a907a', marginTop: 4 }}>
                      Kullanıcı bu projeye atanacak. Sonradan değiştirilebilir.
                    </div>
                  </div>
                )}

                {/* TA: aktif proje bilgisi (salt okunur) */}
                {!isSA && projeId && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="verde-label">Proje</label>
                    <div style={{ fontSize: 13, color: '#0f1a0f', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 10px', fontWeight: 600 }}>
                      ✓ Aktif proje'ye otomatik atanacak
                    </div>
                  </div>
                )}
                {!isSA && !projeId && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: 13, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '8px 10px' }}>
                      ⚠️ Aktif proje seçili değil. Üstten bir proje seçip tekrar deneyin.
                    </div>
                  </div>
                )}

                {/* Üst Lokasyon seçici */}
                {ustLokasyonlar.length > 0 && createForm.rol !== 'alt_super_admin' && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label className="verde-label">Üst Lokasyon</label>
                    <select className="verde-input" value={createForm.ust_lokasyon_id} onChange={e => setCreateForm(f => ({ ...f, ust_lokasyon_id: e.target.value }))}>
                      <option value="">— Seçiniz —</option>
                      {ustLokasyonlar.map(l => <option key={l.id} value={l.id}>{l.tanim}</option>)}
                    </select>
                    <div style={{ fontSize: 11.5, color: '#7a907a', marginTop: 4 }}>
                      Bu kullanıcı hangi üst lokasyona bağlı çalışacak?
                    </div>
                  </div>
                )}
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
              {/* Cihaz Eşleşmesi */}
              {(() => {
                const d = deviceTokenMap[target?.id ?? '']
                return (
                  <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: d ? '#f0fdf4' : '#f8fafc', border: `1.5px solid ${d ? '#86efac' : '#e2e8f0'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: d ? 8 : 0 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: d ? '#16a34a' : '#cbd5e1', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: d ? '#166534' : '#94a3b8' }}>
                        {d ? 'Cihaz Eşleşti' : 'Cihaz Eşleşmesi Yok'}
                      </span>
                      {!d && <span style={{ fontSize: 12, color: '#94a3b8' }}>— Mobil uygulama henüz kayıt olmadı</span>}
                    </div>
                    {d && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#64748b', minWidth: 80 }}>Token:</span>
                          <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#334155', background: '#f1f5f9', padding: '2px 8px', borderRadius: 6 }} title={d.device_token}>
                            {d.device_token.substring(0, 20)}…
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 11.5, fontWeight: 600, color: '#64748b', minWidth: 80 }}>Cihaz ID:</span>
                          <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#334155' }}>{d.device_id}</span>
                        </div>
                        {d.son_kullanim && (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 11.5, fontWeight: 600, color: '#64748b', minWidth: 80 }}>Son Kullanım:</span>
                            <span style={{ fontSize: 12, color: '#475569' }}>
                              {new Date(d.son_kullanim).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}
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
