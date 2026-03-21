'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime, GOREV_DURUM_LABEL } from '@/lib/utils'
import type { Lokasyon, User } from '@/types'
import Button from '@/components/ui/Button'
import RowActionButton from '@/components/ui/RowActionButton'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { createGorevAtamaNotification, notifyTenantAdminsOnGorevStatusChange, type GorevDurum } from '@/lib/notifications'
import { useFirma } from '@/components/layout/FirmaContext'

const DURUM_RENK: Record<string, string> = {
  ACIK: 'status-acik',
  ISLEMDE: 'status-islemde',
  TAMAMLANDI: 'status-tamamlandi',
  IPTAL: 'status-iptal',
}

export default function GorevlerClient({
  base,
  meId,
  readonly,
  initialFirmaId,
  initialGorevler,
  initialLokasyonlar,
  initialKullanicilar,
  projeId,
}: {
  base: '/sa' | '/ta' | '/u'
  meId: string
  readonly: boolean
  initialFirmaId?: string | null
  initialGorevler: any[]
  initialLokasyonlar: Pick<Lokasyon, 'id' | 'tanim' | 'aktif' | 'parent_id'>[]
  initialKullanicilar: Pick<User, 'id' | 'isim_soyisim' | 'aktif'>[]
  projeId?: string | null
}) {
  const supabase = createClient()
  const { toast } = useToast()
  const { confirm, confirmChoice } = useConfirm()
  const { firmaId: saFirmaId } = useFirma()
  const [tenantFirmaId] = useState<string | null>(initialFirmaId ?? null)
  const firmaId = base === '/sa' ? saFirmaId : tenantFirmaId
  const [gorevler, setGorevler] = useState<any[]>(initialGorevler)
  const [lokasyonlar, setLokasyonlar] = useState(initialLokasyonlar)
  const [kullanicilar, setKullanicilar] = useState(initialKullanicilar)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function showError(msg: string) {
    setError(msg)
    toast({ type: 'error', title: 'İşlem başarısız', message: msg })
  }

  function showSuccess(msg: string) {
    toast({ type: 'success', title: 'Başarılı', message: msg })
  }

  const [openForm, setOpenForm] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [form, setForm] = useState({ tanim:'', atanan_kullanici_id:'' })

  // Lokasyon hiyerarşisi (Üst / Alt / Alt-Alt)
  const [loc1, setLoc1] = useState('')
  const [loc2, setLoc2] = useState('')
  const [loc3, setLoc3] = useState('')

  const locMap = useMemo(() => {
    const map: Record<string, { tanim: string; parent_id: string | null }> = {}
    ;(lokasyonlar ?? []).forEach((l: any) => {
      map[l.id] = { tanim: l.tanim, parent_id: l.parent_id ?? null }
    })
    return map
  }, [lokasyonlar])

  const getLocPath = useMemo(() => {
    return (lokasyonId: string | null | undefined, fallbackName?: string | null) => {
      if (!lokasyonId) return fallbackName ?? '—'
      const parts: string[] = []
      let cur: string | null = lokasyonId
      let guard = 0
      while (cur && guard < 8) {
        // Explicit annotation avoids TS7022 in some TS/React type inference setups.
        const node: { tanim: string; parent_id: string | null } | undefined = locMap[cur]
        if (!node) break
        parts.push(node.tanim)
        cur = node.parent_id
        guard++
      }
      const path = parts.reverse().join(' / ')
      return path || (fallbackName ?? '—')
    }
  }, [locMap])

  const roots = useMemo(() => (lokasyonlar ?? []).filter((l: any) => !l.parent_id), [lokasyonlar])
  const childrenOf = useMemo(() => {
    const byParent: Record<string, any[]> = {}
    ;(lokasyonlar ?? []).forEach((l: any) => {
      const p = l.parent_id
      if (!p) return
      if (!byParent[p]) byParent[p] = []
      byParent[p].push(l)
    })
    Object.values(byParent).forEach((arr) => arr.sort((a: any, b: any) => (a.tanim ?? '').localeCompare(b.tanim ?? '')))
    return byParent
  }, [lokasyonlar])

  const loc2Options = useMemo(() => (loc1 ? (childrenOf[loc1] ?? []) : []), [childrenOf, loc1])
  const loc3Options = useMemo(() => (loc2 ? (childrenOf[loc2] ?? []) : []), [childrenOf, loc2])

  const selectedLokasyonId = useMemo(() => loc3 || loc2 || loc1, [loc1, loc2, loc3])

  useEffect(() => {
    if (!firmaId) return
    refreshAll(firmaId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return gorevler
    return gorevler.filter(g =>
      (g.tanim ?? '').toLowerCase().includes(s) ||
      (getLocPath(g.lokasyon_id, g.lokasyonlar?.tanim) ?? '').toLowerCase().includes(s) ||
      (g.atanan?.isim_soyisim ?? '').toLowerCase().includes(s)
    )
  }, [q, gorevler, getLocPath])

  async function refreshAll(fid: string) {
    setLoading(true); setError('')
    let gorevQuery = supabase
      .from('gorevler')
      .select('*,lokasyonlar(id,tanim,parent_id),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim)')
      .eq('firma_id', fid)
      .order('olusturma_tarihi', { ascending: false })
      .limit(200)
    if (projeId) gorevQuery = (gorevQuery as any).eq('proje_id', projeId)
    let lokQuery = supabase.from('lokasyonlar').select('id,tanim,aktif,parent_id').eq('firma_id', fid).eq('aktif', true).order('tanim')
    if (projeId) lokQuery = (lokQuery as any).eq('proje_id', projeId)
    const [gRes, lRes, uRes] = await Promise.all([
      gorevQuery,
      lokQuery,
      supabase.from('users').select('id,isim_soyisim,aktif').eq('firma_id', fid).eq('aktif', true).order('isim_soyisim'),
    ])
    if (gRes.error) showError(gRes.error.message)
    if (lRes.error) showError(lRes.error.message)
    if (uRes.error) showError(uRes.error.message)
    if (gRes.data) setGorevler(gRes.data)
    if (lRes.data) setLokasyonlar(lRes.data as any)
    if (uRes.data) setKullanicilar(uRes.data as any)
    setLoading(false)
  }

  function openCreate() {
    setEditing(null)
    setForm({ tanim:'', atanan_kullanici_id:'' })
    setLoc1(''); setLoc2(''); setLoc3('')
    setOpenForm(true)
  }

  function openEdit(g: any) {
    setEditing(g)
    setForm({ tanim: g.tanim ?? '', atanan_kullanici_id: g.atanan_kullanici_id ?? '' })

    // Seçili lokasyonun (varsa) üstlerini bulup 3 dropdown'a dağıtalım
    const chain: string[] = []
    let cur: string | null = g.lokasyon_id ?? null
    let guard = 0
    while (cur && guard < 8) {
      chain.push(cur)
      cur = locMap[cur]?.parent_id ?? null
      guard++
    }
    const ordered = chain.reverse() // root -> leaf
    setLoc1(ordered[0] ?? '')
    setLoc2(ordered[1] ?? '')
    setLoc3(ordered[2] ?? '')
    setOpenForm(true)
  }

  async function save() {
    if (!firmaId) { setError('Firma seçilmedi'); return }
    if (!form.tanim.trim() || !loc1 || !form.atanan_kullanici_id) {
      showError('Tanım, lokasyon ve kullanıcı zorunludur.')
      return
    }

    // Personel takibi kontrolü — atanan kullanıcı iş başı yapmış mı?
    const kontrolUrl = new URLSearchParams({ user_id: form.atanan_kullanici_id, firma_id: firmaId! })
    if (projeId) kontrolUrl.set('proje_id', projeId)
    const kontrolRes  = await fetch(`/api/mesai/kontrol?${kontrolUrl}`)
    const kontrolJson = await kontrolRes.json()
    if (kontrolJson.ok && kontrolJson.atanabilir === false) {
      showError(kontrolJson.neden)
      return
    }

    setLoading(true); setError('')
    if (editing) {
      const reAssigned = editing.atanan_kullanici_id !== form.atanan_kullanici_id
      const patch: any = { tanim: form.tanim.trim(), lokasyon_id: selectedLokasyonId, atanan_kullanici_id: form.atanan_kullanici_id }
      // Kullanıcı değiştiyse görevi tekrar "hazır" bekletelim
      if (reAssigned) patch.durum = 'ACIK'

      const { data: updated, error: err } = await supabase
        .from('gorevler')
        .update(patch)
        .eq('id', editing.id)
        .select('*,lokasyonlar(id,tanim,parent_id),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim)')
        .single()

      if (err) showError(err.message)
      else {
        setOpenForm(false)
        showSuccess('Görev güncellendi.')
        // Yeniden atama varsa atanan kullanıcıya bildirim
        if (reAssigned && updated?.id) {
          await createGorevAtamaNotification({
            supabase,
            aliciId: form.atanan_kullanici_id,
            gorevId: updated.id,
            tanim: updated.tanim,
            lokasyonTanim: getLocPath(updated.lokasyon_id, updated.lokasyonlar?.tanim),
            tarihIso: updated.olusturma_tarihi,
          })
        }
        await refreshAll(firmaId)
      }
    } else {
      const { data: inserted, error: err } = await supabase
        .from('gorevler')
        .insert({
          firma_id: firmaId,
          tanim: form.tanim.trim(),
          lokasyon_id: selectedLokasyonId,
          atanan_kullanici_id: form.atanan_kullanici_id,
          durum: 'ACIK',
          olusturan_id: meId,
          islemi_yapan_id: meId,
          durum_degisim_tarihi: new Date().toISOString(),
          ...(projeId ? { proje_id: projeId } : {}),
        })
        .select('*,lokasyonlar(id,tanim,parent_id),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim)')
        .single()
      if (err) showError(err.message)
      else {
        setOpenForm(false)
        showSuccess('Görev oluşturuldu. Atanan kullanıcıya bildirim gönderildi.')
        if (inserted?.id) {
          await createGorevAtamaNotification({
            supabase,
            aliciId: form.atanan_kullanici_id,
            gorevId: inserted.id,
            tanim: inserted.tanim,
            lokasyonTanim: getLocPath(inserted.lokasyon_id, inserted.lokasyonlar?.tanim),
            tarihIso: inserted.olusturma_tarihi,
          })
        }
        await refreshAll(firmaId)
      }
    }
    setLoading(false)
  }

  async function setDurum(g: any, durum: 'ACIK' | 'ISLEMDE' | 'TAMAMLANDI' | 'IPTAL') {
    setLoading(true); setError('')
    const patch: any = { durum, durum_degisim_tarihi: new Date().toISOString(), islemi_yapan_id: meId }
    const { data: updated, error: err } = await supabase
      .from('gorevler')
      .update(patch)
      .eq('id', g.id)
      .select('*,lokasyonlar(id,tanim,parent_id),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim)')
      .single()

    if (err) showError(err.message)
    else {
      showSuccess('Görev durumu güncellendi.')
      // Tenant admin bildirimleri (tamamlandı hariç)
      if (firmaId && durum !== 'TAMAMLANDI' && updated) {
        const actionText = durum === 'IPTAL' ? 'iptal edildi' : durum === 'ISLEMDE' ? 'işleme alındı' : 'beklemeye alındı'
        await notifyTenantAdminsOnGorevStatusChange({
          supabase,
          firmaId,
          gorev: { ...updated, durum: updated.durum as GorevDurum },
          actionText,
          actorName: null,
        })
      }
    }
    if (firmaId) await refreshAll(firmaId)
    setLoading(false)
  }

  async function del(id: string) {
    // TA ve SA için: önce kalıcı mı yoksa listeden mi silinsin diye sor
    const secim = await confirmChoice({
      title: 'Görevi Sil',
      message: 'Bu görevi nasıl silmek istiyorsunuz?',
      options: [
        { label: 'Listeden Kaldır', value: 'soft', description: 'Görev veritabanında kalır, listede görünmez.' },
        { label: 'Kalıcı Olarak Sil', value: 'hard', description: 'Görev tamamen silinir. Bu işlem geri alınamaz.' },
      ],
      cancelText: 'İptal',
    })
    if (!secim) return

    if (secim === 'hard') {
      // Kalıcı sil — ek uyarı
      const ok2 = await confirm({
        title: '⚠️ Kalıcı Silme Onayı',
        message: 'Bu görev veritabanından kalıcı olarak silinecek.\n\nBu işlem GERİ ALINAMAZ. Onaylıyor musunuz?',
        confirmText: 'Evet, Kalıcı Olarak Sil',
        cancelText: 'İptal',
        variant: 'danger',
      })
      if (!ok2) return
      setLoading(true); setError('')
      const { error: err } = await supabase.from('gorevler').delete().eq('id', id)
      if (err) showError(err.message)
      else {
        showSuccess('Görev kalıcı olarak silindi.')
        // State'den direkt kaldır (refresh'e gerek yok)
        setGorevler(prev => prev.filter(g => g.id !== id))
      }
    } else {
      // Listeden kaldır (soft delete — durum = SILINDI)
      setLoading(true); setError('')
      const { error: err } = await supabase
        .from('gorevler')
        .update({ durum: 'SILINDI', durum_degisim_tarihi: new Date().toISOString(), islemi_yapan_id: meId })
        .eq('id', id)
      if (err) showError(err.message)
      else {
        showSuccess('Görev listeden kaldırıldı.')
        // State'den direkt kaldır
        setGorevler(prev => prev.filter(g => g.id !== id))
      }
    }
    if (firmaId) await refreshAll(firmaId)
    setLoading(false)
  }

  const canManage = !readonly

  return (
    <div style={{ padding:'24px 28px' }}>
      <div className="verde-card">
        <div style={{ padding:'14px 18px', borderBottom:'1px solid #e8f0e8', display:'flex', gap:10, alignItems:'center' }}>
          <input className="verde-input" placeholder="Görev ara..." value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth:260 }} />
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <Button variant="ghost" size="sm" onClick={() => firmaId && refreshAll(firmaId)} disabled={loading || !firmaId}>
              {loading ? 'Yükleniyor…' : '↻ Yenile'}
            </Button>
            {canManage && (
              <Button variant="primary" onClick={openCreate} disabled={!firmaId}>＋ Görev Ekle</Button>
            )}
          </div>
        </div>
        {/* Uyarılar toast olarak gösterilir */}

        {!firmaId && base === '/sa' ? (
          <div style={{ padding:'48px', textAlign:'center', color:'#7a907a' }}>
            <div style={{ fontSize:28, marginBottom:8 }}>🏢</div>
            <div>Görevleri görmek için firma seçin.</div>
          </div>
        ) : (
          <table className="verde-table" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: 240 }}>Görev</th>
                <th style={{ width: 220 }}>Lokasyon</th>
                <th style={{ width: 170 }}>Atanan</th>
                <th style={{ width: 120 }}>Durum</th>
                <th style={{ width: 170 }}>Oluşturma Tarihi</th>
                <th style={{ width: 160 }}>İşlemi Yapan</th>
                <th style={{ width: 170 }}>İşlem Tarihi</th>
                {canManage && <th style={{ width: 320, textAlign:'right' }}>Aksiyon</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((g: any) => (
                <tr key={g.id}>
                  <td style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.tanim ?? ''}>{g.tanim}</td>
                  <td style={{ color:'#506050', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={getLocPath(g.lokasyon_id, g.lokasyonlar?.tanim)}>{getLocPath(g.lokasyon_id, g.lokasyonlar?.tanim)}</td>
                  <td style={{ color:'#506050', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.atanan?.isim_soyisim ?? ''}>{g.atanan?.isim_soyisim ?? '—'}</td>
                  <td>
                    <span className={`verde-badge ${DURUM_RENK[g.durum] ?? 'status-acik'}`}>{GOREV_DURUM_LABEL[g.durum] ?? g.durum}</span>
                  </td>
                  <td style={{ color:'#7a907a', fontSize: 13, whiteSpace:'nowrap' }}>{g.olusturma_tarihi ? formatDateTime(g.olusturma_tarihi) : '—'}</td>
                  <td style={{ color:'#506050', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace:'nowrap' }} title={g.islemi_yapan?.isim_soyisim ?? ''}>{g.islemi_yapan?.isim_soyisim ?? '—'}</td>
                  <td style={{ color:'#7a907a', fontSize: 13, whiteSpace:'nowrap' }}>{g.durum_degisim_tarihi ? formatDateTime(g.durum_degisim_tarihi) : '—'}</td>
                  {canManage && (
                    <td style={{ width: 320, whiteSpace:'nowrap' }}>
                      <div style={{ display:'flex', gap:6, flexWrap:'nowrap', justifyContent:'flex-end' }}>
                        <RowActionButton variant="base" onClick={() => openEdit(g)}>Düzenle</RowActionButton>
                        <RowActionButton variant="success" onClick={() => setDurum(g,'ISLEMDE')}>İşlemde</RowActionButton>
                        <RowActionButton variant="success" onClick={() => setDurum(g,'TAMAMLANDI')}>Tamamla</RowActionButton>
                        <RowActionButton variant="warning" onClick={() => setDurum(g,'IPTAL')}>İptal</RowActionButton>
                        <RowActionButton variant="danger" onClick={() => del(g.id)}>Sil</RowActionButton>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {!filtered.length && (
                <tr><td colSpan={canManage ? 8 : 7} style={{ textAlign:'center', color:'#7a907a', padding:'36px 0' }}>Görev bulunamadı</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {openForm && canManage && (
        <div
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setOpenForm(false)}
        >
          {/* Modal width slightly increased so location + user fields can sit on one row without squeezing */}
          <div
            className="verde-card"
            style={{ width: 920, maxWidth: 'calc(100vw - 40px)', padding: 0, overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding:'16px 18px', borderBottom:'1px solid #e8f0e8', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#0f1a0f' }}>{editing ? 'Görev Düzenle' : 'Görev Ekle'}</div>
              <Button variant="ghost" size="sm" onClick={() => setOpenForm(false)} style={{ padding:'4px 10px', fontSize:12 }}>✕</Button>
            </div>
            <div style={{ padding:18 }}>
              {/* Give a bit more space to the location group while keeping assignee visible */}
              <div style={{ display:'grid', gridTemplateColumns:'1.7fr 1fr', gap:12 }}>
                <div style={{ gridColumn:'1 / -1' }}>
                  <label className="verde-label">Görev Tanımı *</label>
                  <input className="verde-input" value={form.tanim} onChange={e => setForm(f => ({...f, tanim:e.target.value}))} />
                </div>
                <div>
                  <label className="verde-label">Lokasyon *</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr)', gap: 8 }}>
                    <select
                      className="verde-input"
                      value={loc1}
                      onChange={(e) => {
                        const v = e.target.value
                        setLoc1(v)
                        setLoc2('')
                        setLoc3('')
                      }}
                    >
                      <option value="">Lokasyon Seçiniz</option>
                      {roots.map((l: any) => (
                        <option key={l.id} value={l.id}>
                          {l.tanim}
                        </option>
                      ))}
                    </select>

                    <select
                      className="verde-input"
                      value={loc2}
                      onChange={(e) => {
                        const v = e.target.value
                        setLoc2(v)
                        setLoc3('')
                      }}
                      disabled={!loc1 || loc2Options.length === 0}
                    >
                      {!loc1 ? (
                        <option value="">Alt Lokasyon Seçiniz</option>
                      ) : loc2Options.length === 0 ? (
                        <option value="">Alt lokasyon yok</option>
                      ) : (
                        <option value="">Alt Lokasyon Seçiniz</option>
                      )}
                      {loc2Options.map((l: any) => (
                        <option key={l.id} value={l.id}>
                          {l.tanim}
                        </option>
                      ))}
                    </select>

                    <select
                      className="verde-input"
                      value={loc3}
                      onChange={(e) => setLoc3(e.target.value)}
                      disabled={!loc2 || loc3Options.length === 0}
                    >
                      {!loc2 ? (
                        <option value="">Alt Lokasyon Seçiniz</option>
                      ) : loc3Options.length === 0 ? (
                        <option value="">Alt lokasyon yok</option>
                      ) : (
                        <option value="">Alt Lokasyon Seçiniz</option>
                      )}
                      {loc3Options.map((l: any) => (
                        <option key={l.id} value={l.id}>
                          {l.tanim}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="verde-label">Atanan Kullanıcı *</label>
                  <select className="verde-input" value={form.atanan_kullanici_id} onChange={e => setForm(f => ({...f, atanan_kullanici_id:e.target.value}))}>
                    <option value="">Seçin...</option>
                    {kullanicilar.map(u => <option key={u.id} value={u.id}>{u.isim_soyisim}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:16 }}>
                <Button variant="primary" onClick={save} disabled={loading}>{loading ? 'Kaydediliyor…' : '✓ Kaydet'}</Button>
                <Button variant="ghost" onClick={() => setOpenForm(false)}>İptal</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
