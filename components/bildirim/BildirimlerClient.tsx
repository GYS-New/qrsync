'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDateTime } from '@/lib/utils'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { NotificationUtils, markGorevAtamaNotificationsRead, notifyTenantAdminsOnGorevStatusChange, type GorevDurum } from '@/lib/notifications'

export default function BildirimlerClient({ meId, initialItems }: { meId: string; initialItems: any[] }) {
  const supabase = createClient()
  const { toast } = useToast()
  const { confirm } = useConfirm()

  const [items, setItems] = useState<any[]>(initialItems)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [meName, setMeName] = useState<string>('')

  // UI
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Me name lazımsa (durum değişim bildirim metni için)
  useEffect(() => {
    let mounted = true
    supabase
      .from('users')
      .select('isim_soyisim')
      .eq('id', meId)
      .single()
      .then(({ data }) => {
        if (mounted && data?.isim_soyisim) setMeName(data.isim_soyisim)
      })
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId])

  function showError(msg: string) {
    setError(msg)
    toast({ type: 'error', title: 'İşlem başarısız', message: msg })
  }
  function showSuccess(msg: string) {
    toast({ type: 'success', title: 'Başarılı', message: msg })
  }

  function cleanMessage(msg: string) {
    return (msg ?? '')
      .split('\n')
      .filter((l: string) => !l.startsWith('#gorev:') && !l.startsWith('#karar:'))
      .join('\n')
  }

  function extractDecisionTag(msg: string): 'kabul' | 'ret' | null {
    const m = (msg ?? '').match(/#karar:(kabul|ret)/)
    return (m?.[1] as any) ?? null
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    let list = items
    if (showUnreadOnly) list = list.filter(n => !n.okundu)
    if (s) {
      list = list.filter(
        n => (n.baslik ?? '').toLowerCase().includes(s) || (n.mesaj ?? '').toLowerCase().includes(s)
      )
    }
    // Okunmamışlar üstte, sonra tarih desc
    list = [...list].sort((a, b) => {
      if (!!a.okundu !== !!b.okundu) return a.okundu ? 1 : -1
      return new Date(b.tarih).getTime() - new Date(a.tarih).getTime()
    })
    return list
  }, [q, items, showUnreadOnly])

  async function refresh() {
    setLoading(true)
    setError('')
    const { data, error: err } = await supabase
      .from('bildirimler')
      .select('*')
      .eq('alici_id', meId)
      .order('tarih', { ascending: false })
      .limit(500)
    if (err) showError(err.message)
    if (data) setItems(data)
    setLoading(false)
  }

  async function markAll() {
    setLoading(true)
    setError('')
    const { error: err } = await supabase
      .from('bildirimler')
      .update({ okundu: true })
      .eq('alici_id', meId)
      .eq('okundu', false)
    if (err) showError(err.message)
    await refresh()
    setLoading(false)
  }

  async function markOne(id: string) {
    const { error: err } = await supabase
      .from('bildirimler')
      .update({ okundu: true })
      .eq('id', id)
      .eq('alici_id', meId)
    if (err) showError(err.message)
    setItems(prev => prev.map(x => (x.id === id ? { ...x, okundu: true } : x)))
    setExpandedId(prev => (prev === id ? null : prev))
  }

  function toggleSelect(id: string, checked: boolean) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function selectAllVisible() {
    setSelectedIds(new Set(filtered.map(n => n.id)))
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds)
    if (!ids.length) {
      toast({ type: 'info', title: 'Seçim yok', message: 'Lütfen silmek için en az 1 bildirim seçin.' })
      return
    }

    const ok = await confirm({
      title: 'Seçilen bildirimleri sil',
      message: `${ids.length} bildirimi silmek istiyor musunuz? Bu işlem geri alınamaz.`,
      confirmText: 'Sil',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return

    setLoading(true)
    setError('')
    const { error: err } = await supabase.from('bildirimler').delete().eq('alici_id', meId).in('id', ids)
    if (err) {
      showError(err.message)
      setLoading(false)
      return
    }
    setItems(prev => prev.filter(n => !ids.includes(n.id)))
    setSelectedIds(new Set())
    setSelectionMode(false)
    setExpandedId(null)
    showSuccess('Seçilen bildirimler silindi.')
    setLoading(false)
  }

  async function deleteRead() {
    const readCount = items.filter(n => n.okundu).length
    if (!readCount) {
      toast({ type: 'info', title: 'Okunmuş bildirim yok', message: 'Silinecek okunmuş bildirim bulunamadı.' })
      return
    }

    const ok = await confirm({
      title: 'Okunmuş bildirimleri temizle',
      message: `Okunmuş ${readCount} bildirimi silmek istiyor musunuz? Bu işlem geri alınamaz.`,
      confirmText: 'Temizle',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok) return

    setLoading(true)
    setError('')
    const { error: err } = await supabase.from('bildirimler').delete().eq('alici_id', meId).eq('okundu', true)
    if (err) {
      showError(err.message)
      setLoading(false)
      return
    }
    setItems(prev => prev.filter(n => !n.okundu))
    setSelectedIds(new Set())
    setSelectionMode(false)
    setExpandedId(null)
    showSuccess('Okunmuş bildirimler temizlendi.')
    setLoading(false)
  }

  async function decideGorev(n: any, karar: 'kabul' | 'ret') {
    const gorevId = NotificationUtils.extractGorevIdTag(n.mesaj ?? '')
    if (!gorevId) return

    setLoading(true)
    setError('')

    // Görevi çek (firma + lokasyon + atanan)
    const { data: gorev, error: gErr } = await supabase
      .from('gorevler')
      .select('*,firma_id,lokasyonlar(tanim),users!atanan_kullanici_id(isim_soyisim)')
      .eq('id', gorevId)
      .single()

    if (gErr || !gorev) {
      showError(gErr?.message ?? 'Görev bulunamadı')
      setLoading(false)
      return
    }

    if (gorev.durum === 'TAMAMLANDI') {
      await markGorevAtamaNotificationsRead({ supabase, gorevId })
      setItems(prev => prev.map(x => (x.id === n.id ? { ...x, okundu: true } : x)))
      showError('Bu görev zaten tamamlanmış. Bildirim otomatik olarak okundu işaretlendi.')
      setLoading(false)
      return
    }

    // Güvenlik: sadece bana atanmış görevlerde işlem yap
    if (gorev.atanan_kullanici_id !== meId) {
      showError('Bu görev size atanmadığı için işlem yapılamaz.')
      setLoading(false)
      return
    }

    const yeniDurum = (karar === 'kabul' ? 'ISLEMDE' : 'IPTAL') as GorevDurum
    const { data: updated, error: uErr } = await supabase
      .from('gorevler')
      .update({ durum: yeniDurum, durum_degisim_tarihi: new Date().toISOString(), islemi_yapan_id: meId })
      .eq('id', gorevId)
      .select('*,firma_id,lokasyonlar(tanim),users!atanan_kullanici_id(isim_soyisim)')
      .single()

    if (uErr || !updated) {
      showError(uErr?.message ?? 'Görev güncellenemedi')
      setLoading(false)
      return
    }

    // Bildirimi okundu yap + karar tag'i ekle (rozet için)
    const taggedMessage = `${n.mesaj ?? ''}\n#karar:${karar}`
    await supabase
      .from('bildirimler')
      .update({ okundu: true, mesaj: taggedMessage })
      .eq('id', n.id)
      .eq('alici_id', meId)

    // Tenant adminlere durum değişim bildirimi (tamamlandı hariç)
    const actionText = karar === 'kabul' ? 'kabul etti' : 'reddetti'
    await notifyTenantAdminsOnGorevStatusChange({
      supabase,
      firmaId: updated.firma_id,
      gorev: { ...updated, durum: updated.durum as GorevDurum },
      actionText,
      actorName: meName || null,
    })

    showSuccess(karar === 'kabul' ? 'Görev kabul edildi ve İşlemde durumuna alındı.' : 'Görev reddedildi ve İptal durumuna alındı.')
    await refresh()
    setExpandedId(null)
    setLoading(false)
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      <div className="verde-card">
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid #ffe8c8',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <input
            className="verde-input"
            placeholder="Bildirim ara..."
            value={q}
            onChange={e => setQ(e.target.value)}
            style={{ maxWidth: 260 }}
          />

          <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: '#6b4423' }}>
            <input type="checkbox" checked={showUnreadOnly} onChange={e => setShowUnreadOnly(e.target.checked)} />
            Okunmamışlar
          </label>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!selectionMode ? (
              <>
                <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
                  {loading ? 'Yükleniyor…' : '↻ Yenile'}
                </Button>
                <Button variant="ghost" size="sm" onClick={deleteRead} disabled={loading}>
                  🧹 Okunanları Temizle
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectionMode(true)
                    setSelectedIds(new Set())
                    setExpandedId(null)
                  }}
                  disabled={loading}
                >
                  ☑ Seç
                </Button>
                <Button variant="primary" onClick={markAll} disabled={loading}>
                  ✓ Tümünü Okundu Yap
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={selectAllVisible} disabled={loading}>
                  Tümünü Seç
                </Button>
                <Button variant="danger" onClick={deleteSelected} disabled={loading}>
                  🗑 Seçilenleri Sil ({selectedIds.size})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectionMode(false)
                    setSelectedIds(new Set())
                    setExpandedId(null)
                  }}
                  disabled={loading}
                >
                  İptal
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Uyarılar toast olarak gösterilir */}
        {error ? <div style={{ padding: '10px 18px', color: '#b71c1c', fontSize: 12.5 }}>{error}</div> : null}

        <div style={{ padding: 18 }}>
          {filtered.map(n => {
            const expanded = expandedId === n.id
            const gorevId = NotificationUtils.extractGorevIdTag(n.mesaj ?? '')
            const decision = extractDecisionTag(n.mesaj ?? '')
            const preview = cleanMessage(n.mesaj ?? '').replace(/\s+/g, ' ').trim()

            return (
              <div
                key={n.id}
                style={{
                  border: '1px solid #ffe8c8',
                  borderRadius: 8,
                  background: n.okundu ? '#fff' : '#fff7ed',
                  marginBottom: 10,
                  overflow: 'hidden',
                }}
              >
                {/* Compact row */}
                <div
                  role="button"
                  onClick={() => {
                    if (selectionMode) return
                    setExpandedId(prev => (prev === n.id ? null : n.id))
                  }}
                  style={{
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    cursor: selectionMode ? 'default' : 'pointer',
                  }}
                >
                  {selectionMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(n.id)}
                      onChange={e => toggleSelect(n.id, e.target.checked)}
                      onClick={e => e.stopPropagation()}
                    />
                  )}

                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: 700,
                          color: '#3d1c00',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {n.baslik}
                      </div>

                      {/* Durum rozeti */}
                      {n.tip === 'gorev_atama' && decision && (
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 999,
                            border: '1px solid #ffe0b2',
                            background: decision === 'kabul' ? '#dff5e1' : '#fde2e2',
                            color: decision === 'kabul' ? '#1b5e20' : '#b71c1c',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {decision === 'kabul' ? 'Kabul edildi' : 'Reddedildi'}
                        </span>
                      )}
                      {n.okundu && n.tip === 'gorev_atama' && !decision && (
                        <span
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 999,
                            border: '1px solid #ffe0b2',
                            background: '#f2f4f2',
                            color: '#556655',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Okundu
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        color: '#9a7b6a',
                        marginTop: 2,
                        display: 'flex',
                        gap: 10,
                        alignItems: 'center',
                      }}
                    >
                      <span>{formatDateTime(n.tarih)}</span>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview}</span>
                    </div>
                  </div>

                  {!n.okundu && !selectionMode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e: any) => {
                        e.stopPropagation()
                        markOne(n.id)
                      }}
                    >
                      Okundu
                    </Button>
                  )}

                  {!selectionMode && <div style={{ color: '#9a7b6a', fontSize: 12 }}>{expanded ? '▾' : '▸'}</div>}
                </div>

                {/* Details */}
                {expanded && (
                  <div style={{ padding: '12px 12px', borderTop: '1px solid #ffe8c8', background: '#fff' }}>
                    <div style={{ fontSize: 12.5, color: '#6b4423', whiteSpace: 'pre-wrap' }}>{cleanMessage(n.mesaj ?? '')}</div>

                    {/* Görev atama bildirimi: Kabul / Reddet (sadece okunmamış + karar yok) */}
                    {n.tip === 'gorev_atama' && gorevId && !n.okundu && !decision && (
                      <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <Button variant="primary" size="sm" disabled={loading} onClick={() => decideGorev(n, 'kabul')}>
                          Kabul Et
                        </Button>
                        <Button variant="danger" size="sm" disabled={loading} onClick={() => decideGorev(n, 'ret')}>
                          Reddet
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {!filtered.length && (
            <div style={{ padding: '40px 0', textAlign: 'center', color: '#9a7b6a' }}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>🔔</div>
              <div>Bildirim bulunamadı</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
