'use client'

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import LokasyonAgac, { type VardiyaOzet } from '@/components/lokasyon/LokasyonAgac'
import QrKodModal from '@/components/lokasyon/QrKodModal'
import type { Lokasyon } from '@/types'
import Button from '@/components/ui/Button'
import { Download, FileSpreadsheet, Upload, QrCode } from 'lucide-react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { IMPORT_EXPORT_BUTTON_STYLE } from '@/lib/import-export/constants'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'
import { useYetki } from '@/lib/yetki/useYetki'

export default function LokasyonlarClient({
  base,
  initialFirmaId,
  initialLokasyonlar,
  readonly,
  projeId,
  qrSablonAktif = true,
  yetkiliLokIds,
  showReadOnlyActions = false,
}: {
  base: '/sa' | '/ta' | '/u'
  initialFirmaId?: string | null
  initialLokasyonlar: Lokasyon[]
  readonly: boolean
  projeId?: string | null
  qrSablonAktif?: boolean
  yetkiliLokIds?: string[] | null
  /** Readonly kullanıcılar için QR/↓QR/↓Kart butonlarını göster (örn. tenant_user) */
  showReadOnlyActions?: boolean
}) {
  const supabase = createClient()
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const yetki = useYetki('lokasyonlar')
  const { firmaId: saFirmaId } = useFirma()
  const { aktifProje } = useProje()
  const projeSureliAktif = aktifProje?.sureli_gorev_aktif === true
  const [tenantFirmaId] = useState<string | null>(initialFirmaId ?? null)
  const firmaId = base === '/sa' ? saFirmaId : tenantFirmaId
  const [lokasyonlar, setLokasyonlar] = useState<Lokasyon[]>(initialLokasyonlar)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [qrIndiriliyor, setQrIndiriliyor] = useState<string | null>(null)
  const [qrSablonIndiriliyor, setQrSablonIndiriliyor] = useState<string | null>(null)
  const [pendingSablonLok, setPendingSablonLok] = useState<string | null>(null)
  const sablonInputRef = useRef<HTMLInputElement | null>(null)

  async function qrSablonIndir(file: File, lok: Lokasyon) {
    if (!firmaId) return
    setQrSablonIndiriliyor(lok.id)
    try {
      const fd = new FormData()
      fd.append('sablon', file)
      fd.append('firma_id', firmaId)
      fd.append('origin', window.location.origin)
      fd.append('ust_lokasyon_id', lok.id)
      if (projeId) fd.append('proje_id', projeId)
      const res = await fetch('/api/lokasyonlar/qr-sablon-indir', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'QR kartlar oluşturulamadı')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `qr-kartlar-${lok.tanim.replace(/\s+/g,'_')}-${new Date().toISOString().slice(0,10)}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setQrSablonIndiriliyor(null)
    setPendingSablonLok(null)
  }

  async function qrTopluIndir(lok: Lokasyon) {
    if (!firmaId) return
    setQrIndiriliyor(lok.id)
    try {
      const params = new URLSearchParams({ firma_id: firmaId, origin: window.location.origin, ust_lokasyon_id: lok.id })
      if (projeId) params.set('proje_id', projeId)
      const res = await fetch(`/api/lokasyonlar/qr-toplu-indir?${params}`)
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'QR kartlar indirilemedi')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `qr-kodlar-${lok.tanim.replace(/\s+/g,'_')}-${new Date().toISOString().slice(0,10)}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setQrIndiriliyor(null)
  }
  const [error, setError] = useState('')
  const importInputRef = useRef<HTMLInputElement | null>(null)

  async function downloadExcel(kind: 'template' | 'export') {
    try {
      const query = firmaId ? `?firmaId=${encodeURIComponent(firmaId)}` : ''
      const res = await fetch(`/api/import-export/locations/${kind}${query}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Dosya indirilemedi')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = kind === 'template' ? 'lokasyon-import-sablonu.xlsx' : 'lokasyonlar.xlsx'
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      showError(e.message)
    }
  }

  async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (firmaId) fd.append('firmaId', firmaId)
      if (projeId) fd.append('proje_id', projeId)
      const res = await fetch('/api/import-export/locations/import', { method: 'POST', body: fd })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'İmport başarısız')
      if (firmaId) await refresh(firmaId)
      const extra = j.errors?.length ? ` Hata: ${j.errors.slice(0, 3).join(' | ')}` : ''
      const grupInfo = (j.grupCreated || j.grupUyeAdded)
        ? ` | ${j.grupCreated ?? 0} grup oluşturuldu, ${j.grupUyeAdded ?? 0} grup üyeliği eklendi.`
        : ''
      showSuccess(`${j.created} lokasyon içe aktarıldı.${grupInfo}${extra}`)
    } catch (err: any) {
      showError(err.message)
    }
    e.target.value = ''
    setLoading(false)
  }

  function showError(msg: string) {
    setError(msg)
    toast({ type: 'error', title: 'İşlem başarısız', message: msg })
  }

  function showSuccess(msg: string) {
    toast({ type: 'success', title: 'Başarılı', message: msg })
  }

  const [qrLok, setQrLok] = useState<Lokasyon | null>(null)
  const [templates, setTemplates] = useState<{ id: string; baslik: string }[]>([])

  // modal
  const [openForm, setOpenForm] = useState(false)
  const [editing, setEditing] = useState<Lokasyon | null>(null)
  const [parentId, setParentId] = useState<string | null>(null)
  const [form, setForm] = useState({ tanim:'', aciklama:'', nfc_token:'', checklist_sablon_id:'', sureli_gorev_aktif:false, tamamlama_qr_zorunlu:false, oto_yikama_lokasyon:false })
  const [firmaOtoYikamaAktif, setFirmaOtoYikamaAktif] = useState(false)
  const [vardiyaOzet, setVardiyaOzet] = useState<VardiyaOzet>({})

  // Firma'nın Oto Yıkama modülü aktif mi? Checkbox sadece aktifse görünür.
  useEffect(() => {
    if (!firmaId) { setFirmaOtoYikamaAktif(false); return }
    supabase.from('firmalar').select('oto_yikama_aktif').eq('id', firmaId).single()
      .then(({ data }) => setFirmaOtoYikamaAktif(!!(data as any)?.oto_yikama_aktif))
  }, [firmaId])

  // Bugünün vardiya × durum özetini çek (lokasyon rozetleri için)
  useEffect(() => {
    if (!firmaId) { setVardiyaOzet({}); return }
    const p = new URLSearchParams({ firma_id: firmaId })
    if (projeId) p.set('proje_id', projeId)
    fetch(`/api/lokasyonlar/vardiya-ozet?${p}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => setVardiyaOzet(j?.ozet ?? {}))
      .catch(() => setVardiyaOzet({}))
    // 60sn'de bir yenile (canlı görev durumu değişebilir)
    const t = setInterval(() => {
      fetch(`/api/lokasyonlar/vardiya-ozet?${p}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(j => setVardiyaOzet(j?.ozet ?? {}))
        .catch(() => {})
    }, 60000)
    return () => clearInterval(t)
  }, [firmaId, projeId])

  useEffect(() => {
    // when firm changes, refresh
    if (!firmaId) return
    refresh(firmaId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaId])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return lokasyonlar
    return lokasyonlar.filter(l => (l.tanim ?? '').toLowerCase().includes(s) || (l.aciklama ?? '').toLowerCase().includes(s))
  }, [q, lokasyonlar])

  async function refresh(fid: string) {
    setLoading(true); setError('')
    let lokQuery = supabase
      .from('lokasyonlar')
      .select('*')
      .eq('firma_id', fid)
      .order('kayit_tarihi', { ascending: true })
    if (projeId) lokQuery = (lokQuery as any).eq('proje_id', projeId)
    if (yetkiliLokIds) lokQuery = lokQuery.in('id', yetkiliLokIds)
    let tplQuery = supabase
      .from('checklist_sablonlari')
      .select('id,baslik,aktif,firma_id')
      .eq('firma_id', fid)
      .eq('aktif', true)
      .order('baslik', { ascending: true })
    if (projeId) tplQuery = (tplQuery as any).eq('proje_id', projeId)
    const [locRes, tplRes] = await Promise.all([
      lokQuery,
      tplQuery,
    ])
    if (locRes.error) showError(locRes.error.message)
    if (tplRes.error) showError(tplRes.error.message)
    if (locRes.data) setLokasyonlar(locRes.data as any)
    if (tplRes.data) setTemplates(tplRes.data as any)
    setLoading(false)
  }

  function openCreate(pid?: string | null) {
    setEditing(null)
    setParentId(pid ?? null)
    // Üst lokasyon Oto Yıkama işaretli ise alt için sureli_gorev_aktif default=true
    // (Oto Yıkama akışı her zaman Başlat → Tamamla iki adımlı süreli görev gerektirir.)
    const ust = pid ? lokasyonlar.find(l => l.id === pid) : null
    const ustOtoYikama = !!(ust as any)?.oto_yikama_lokasyon
    setForm({ tanim:'', aciklama:'', nfc_token: crypto.randomUUID(), checklist_sablon_id: '', sureli_gorev_aktif: ustOtoYikama, tamamlama_qr_zorunlu:false, oto_yikama_lokasyon:false })
    setOpenForm(true)
  }

  function openEdit(l: Lokasyon) {
    setEditing(l)
    setParentId(l.parent_id ?? null)
    setForm({ tanim:l.tanim ?? '', aciklama:l.aciklama ?? '', nfc_token:(l as any).nfc_token ?? '', checklist_sablon_id:(l as any).checklist_sablon_id ?? '', sureli_gorev_aktif: !!(l as any).sureli_gorev_aktif, tamamlama_qr_zorunlu: !!(l as any).tamamlama_qr_zorunlu, oto_yikama_lokasyon: !!(l as any).oto_yikama_lokasyon })
    setOpenForm(true)
  }

  async function copyScanUrl(kind: 'QR' | 'NFC') {
    const current = editing
    if (!current) return
    const token = kind === 'QR' ? current.qr_veri : ((current as any).nfc_token ?? form.nfc_token)
    if (!token) {
      showError(`${kind} token bulunamadı`)
      return
    }
    const path = kind === 'QR' ? `/qr/${token}` : `/nfc/${token}`
    const full = typeof window !== 'undefined' ? `${window.location.origin}${path}` : path
    try {
      await navigator.clipboard.writeText(full)
      showSuccess(`${kind} bağlantısı panoya kopyalandı.`)
    } catch {
      showError('Bağlantı kopyalanamadı')
    }
  }

  async function save() {
    if (!firmaId) { showError('Firma seçilmedi'); return }
    if (!form.tanim.trim()) { showError('Tanım zorunlu'); return }
    setLoading(true); setError('')
    if (editing) {
      const { error: err } = await supabase
        .from('lokasyonlar')
        .update({ tanim: form.tanim.trim(), aciklama: form.aciklama.trim() || null, parent_id: parentId, nfc_token: form.nfc_token.trim() || null, checklist_sablon_id: form.checklist_sablon_id.trim() || null, sureli_gorev_aktif: form.sureli_gorev_aktif, tamamlama_qr_zorunlu: form.tamamlama_qr_zorunlu, oto_yikama_lokasyon: parentId == null ? form.oto_yikama_lokasyon : false })
        .eq('id', editing.id)
      if (err) showError(err.message)
      else {
        setOpenForm(false)
        showSuccess('Lokasyon kaydedildi.')
        await refresh(firmaId)
      }
    } else {
      const { error: err } = await supabase
        .from('lokasyonlar')
        .insert({
          firma_id: firmaId,
          parent_id: parentId,
          tanim: form.tanim.trim(),
          aciklama: form.aciklama.trim() || null,
          aktif: true,
          nfc_token: form.nfc_token.trim() || crypto.randomUUID(),
          checklist_sablon_id: form.checklist_sablon_id.trim() || null,
          sureli_gorev_aktif: form.sureli_gorev_aktif,
          tamamlama_qr_zorunlu: form.tamamlama_qr_zorunlu,
          oto_yikama_lokasyon: parentId == null ? form.oto_yikama_lokasyon : false,
          ...(projeId ? { proje_id: projeId } : {}),
        })
      if (err) showError(err.message)
      else {
        setOpenForm(false)
        showSuccess('Lokasyon oluşturuldu.')
        await refresh(firmaId)
      }
    }
    setLoading(false)
  }

  // Lokasyon ve tüm alt lokasyonlarının id'lerini toplar
  function getAllDescendantIds(id: string, allLoks: Lokasyon[]): string[] {
    const result: string[] = [id]
    const children = allLoks.filter(l => l.parent_id === id)
    for (const child of children) {
      result.push(...getAllDescendantIds(child.id, allLoks))
    }
    return result
  }

  async function del(id: string) {
    // Tüm torunları hesapla (silinecek lokasyonlar)
    const allIds = getAllDescendantIds(id, lokasyonlar)
    const altLokSayisi = allIds.length - 1
    const lokTanim = lokasyonlar.find(l => l.id === id)?.tanim ?? 'Lokasyon'

    // Kaç aktif görev var?
    const { count: gorevCount } = await supabase
      .from('gorevler')
      .select('id', { count: 'exact', head: true })
      .in('lokasyon_id', allIds)

    const gorevMesaj = gorevCount && gorevCount > 0
      ? `\n⚠️ Bu lokasyona bağlı ${gorevCount} görev de kalıcı olarak silinecek!`
      : ''
    const altMesaj = altLokSayisi > 0
      ? `\n📂 ${altLokSayisi} alt lokasyon da silinecek.`
      : ''

    // 1. Uyarı
    const ok1 = await confirm({
      title: 'Lokasyon Silme Onayı',
      message: `"${lokTanim}" lokasyonunu silmek istediğinizden emin misiniz?${altMesaj}${gorevMesaj}\n\nBu işlem GERİ ALINAMAZ.`,
      confirmText: 'Evet, Devam Et',
      cancelText: 'Vazgeç',
      variant: 'danger',
    })
    if (!ok1) return

    // 2. Uyarı
    const ok2 = await confirm({
      title: '⚠️ Son Uyarı — Kalıcı Silme',
      message: `"${lokTanim}" ve bağlı tüm veriler (${allIds.length} lokasyon${gorevCount ? `, ${gorevCount} görev` : ''}) kalıcı olarak silinecek.\n\nBu işlemi kesin olarak onaylıyor musunuz?`,
      confirmText: 'Kalıcı Olarak Sil',
      cancelText: 'İptal',
      variant: 'danger',
    })
    if (!ok2) return

    setLoading(true); setError('')

    try {
      // Server-side API route üzerinden sil (RLS bypass için admin client kullanır)
      const res = await fetch(`/api/lokasyonlar/${id}`, { method: 'DELETE' })
      const json = await res.json()

      if (!res.ok) throw new Error(json.error ?? 'Silme başarısız')

      showSuccess(`"${lokTanim}" ve bağlı tüm veriler kalıcı olarak silindi.`)
      // UI'dan anında kaldır
      setLokasyonlar(prev => prev.filter(l => !allIds.includes(l.id)))
    } catch (err: any) {
      showError(err.message ?? 'Silme işlemi başarısız.')
    }

    setLoading(false)
  }

  async function toggle(l: Lokasyon) {
    setLoading(true); setError('')
    const { error: err } = await supabase.from('lokasyonlar').update({ aktif: !l.aktif }).eq('id', l.id)
    if (err) showError(err.message)
    else showSuccess('Durum güncellendi.')
    if (firmaId) await refresh(firmaId)
    setLoading(false)
  }




  return (
    <div style={{ padding:'24px 28px' }}>
      <div className="verde-card">
        <div style={{ padding:'14px 18px', borderBottom:'1px solid #f3f4f6', display:'flex', gap:10, alignItems:'center' }}>
          <input className="verde-input" placeholder="Lokasyon ara..." value={q} onChange={e => setQ(e.target.value)} style={{ maxWidth:260 }} />
          <div style={{ marginLeft:'auto', display:'flex', gap:8, justifyContent:'flex-end', flexWrap:'wrap' }}>
            <input ref={importInputRef} type="file" accept=".xlsx" style={{ display:'none' }} onChange={onImportFile} />
            <Button variant="ghost" size="sm" onClick={() => firmaId && refresh(firmaId)} disabled={loading || !firmaId} className="text-[15px]" style={IMPORT_EXPORT_BUTTON_STYLE}>
              {loading ? 'Yükleniyor…' : '↻ Yenile'}
            </Button>
            {!readonly && yetki.ekleyebilir && <Button variant="ghost" onClick={() => downloadExcel('template')} disabled={!firmaId} className="text-[15px]" style={IMPORT_EXPORT_BUTTON_STYLE}><Download size={16} /> Şablon İndir</Button>}
            {!readonly && yetki.ekleyebilir && <Button variant="ghost" onClick={() => importInputRef.current?.click()} disabled={!firmaId} className="text-[15px]" style={IMPORT_EXPORT_BUTTON_STYLE}><Upload size={16} /> Excel ile Ekle</Button>}
            {!readonly && <Button variant="ghost" onClick={() => downloadExcel('export')} disabled={!firmaId} className="text-[15px]" style={IMPORT_EXPORT_BUTTON_STYLE}><FileSpreadsheet size={16} /> Excel'e Aktar</Button>}
            {/* QR İndir ve Şablonlu QR butonları LokasyonAgac içinde her üst lokasyon satırında */}
            <input ref={sablonInputRef} type="file" accept=".png,.jpg,.jpeg" style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0]
                const lokId = pendingSablonLok
                if (f && lokId) {
                  const lok = lokasyonlar.find(l => l.id === lokId)
                  if (lok) qrSablonIndir(f, lok)
                }
                e.target.value = ''
              }} />
            {!readonly && yetki.ekleyebilir && (
              <Button variant="primary" onClick={() => openCreate(null)} disabled={!firmaId} className="text-[15px]" style={IMPORT_EXPORT_BUTTON_STYLE}>＋ Lokasyon Ekle</Button>
            )}
          </div>
        </div>
        {/* Uyarılar toast olarak gösterilir */}
        {!firmaId && base === '/sa' ? (
          <div style={{ padding:'48px', textAlign:'center', color:'#6b7280' }}>
            <div style={{ fontSize:28, marginBottom:8 }}>🏢</div>
            <div>Lokasyonları görmek için firma seçin.</div>
          </div>
        ) : (
          <div style={{ padding:18 }}>
            <LokasyonAgac
              lokasyonlar={filtered}
              readonly={readonly || !yetki.duzenleyebilir}
              onEdit={openEdit}
              onDelete={del}
              onToggleAktif={toggle}
              onQR={l => setQrLok(l)}
              onAddChild={pid => openCreate(pid)}
              onQrIndir={lok => qrTopluIndir(lok)}
              onQrSablonIndir={lok => { setPendingSablonLok(lok.id); sablonInputRef.current?.click() }}
              qrIndiriliyor={qrIndiriliyor}
              qrSablonIndiriliyor={qrSablonIndiriliyor}
              qrSablonAktif={qrSablonAktif}
              showReadOnlyActions={showReadOnlyActions}
              vardiyaOzet={vardiyaOzet}
            />
          </div>
        )}
      </div>

      <QrKodModal lokasyon={qrLok} onClose={() => setQrLok(null)} />

      {openForm && !readonly && yetki.duzenleyebilir && (
        <div
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:60, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => setOpenForm(false)}
        >
          <div
            className="verde-card"
            style={{ width:560, padding:0, overflow:'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding:'16px 18px', borderBottom:'1px solid #f3f4f6', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#111827' }}>{editing ? 'Lokasyon Düzenle' : 'Lokasyon Ekle'}</div>
              <Button variant="ghost" size="sm" onClick={() => setOpenForm(false)} style={{ padding:'4px 10px', fontSize:12 }}>✕</Button>
            </div>
            <div style={{ padding:18 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div style={{ gridColumn:'1 / -1' }}>
                  <label className="verde-label">Tanım *</label>
                  <input className="verde-input" value={form.tanim} onChange={e => setForm(f => ({...f, tanim:e.target.value}))} />
                </div>
                <div style={{ gridColumn:'1 / -1' }}>
                  <label className="verde-label">Açıklama</label>
                  <input className="verde-input" value={form.aciklama} onChange={e => setForm(f => ({...f, aciklama:e.target.value}))} />
                </div>
                <div style={{ gridColumn:'1 / -1' }}>
                  <label className="verde-label">NFC Token</label>
                  <div style={{ display:'flex', gap:8 }}>
                    <input className="verde-input" value={form.nfc_token} onChange={e => setForm(f => ({...f, nfc_token:e.target.value}))} />
                    <Button variant="ghost" type="button" onClick={() => setForm(f => ({ ...f, nfc_token: crypto.randomUUID() }))}>Yenile</Button>
                  </div>
                  <div style={{ marginTop:6, fontSize:11, color:'#6b7280' }}>NFC etiketi için kullanılacak benzersiz token.</div>
                </div>
                {editing ? (
                  <div style={{ gridColumn:'1 / -1', display:'flex', gap:8, flexWrap:'wrap' }}>
                    <Button variant="ghost" type="button" onClick={() => copyScanUrl('QR')}>QR Linki Kopyala</Button>
                    <Button variant="ghost" type="button" onClick={() => copyScanUrl('NFC')}>NFC Linki Kopyala</Button>
                  </div>
                ) : null}
                <div style={{ gridColumn:'1 / -1', opacity: projeSureliAktif ? 1 : 0.5 }}>
                  <label className="verde-label" style={{ display:'flex', alignItems:'center', gap:10, cursor: projeSureliAktif ? 'pointer' : 'not-allowed' }}>
                    <input type="checkbox" checked={form.sureli_gorev_aktif} disabled={!projeSureliAktif}
                      onChange={e => setForm(f => ({ ...f, sureli_gorev_aktif: e.target.checked }))} />
                    <span>Bu lokasyonda süreli görev aktif</span>
                  </label>
                  {!projeSureliAktif ? (
                    <div style={{ marginTop:6, fontSize:11, color:'#dc2626' }}>Önce Sistem Ayarları → Proje Ayarları'ndan "Süreli Görev Takibi" aktif edilmelidir.</div>
                  ) : (
                    <div style={{ marginTop:6, fontSize:11, color:'#6b7280' }}>Aktif ise personel görevi önce başlatır, sonra tamamlar. Pasif ise görev doğrudan tamamlanır.</div>
                  )}
                </div>
                <div style={{ gridColumn:'1 / -1' }}>
                  <label className="verde-label" style={{ display:'flex', alignItems:'center', gap:10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.tamamlama_qr_zorunlu}
                      onChange={e => setForm(f => ({ ...f, tamamlama_qr_zorunlu: e.target.checked }))} />
                    <span>Tamamlama için QR/NFC okutma zorunlu</span>
                  </label>
                  <div style={{ marginTop:6, fontSize:11, color:'#6b7280' }}>Aktif ise personel görevi tamamlarken lokasyondaki QR veya NFC kodunu okutmalıdır. Süreli görev ayarından bağımsız çalışır.</div>
                </div>
                {parentId == null && firmaOtoYikamaAktif && (
                  <div style={{ gridColumn:'1 / -1' }}>
                    <label className="verde-label" style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                      <input type="checkbox" checked={form.oto_yikama_lokasyon}
                        onChange={e => setForm(f => ({ ...f, oto_yikama_lokasyon: e.target.checked }))} />
                      <span>Bu üst lokasyon Oto Yıkama için kullanılıyor</span>
                    </label>
                    <div style={{ marginTop:6, fontSize:11, color:'#6b7280' }}>İşaretlenirse, bu üst lokasyon ve tüm alt lokasyonları Oto Yıkama → Görev Oluştur ekranında listelenir.</div>
                  </div>
                )}
                <div style={{ gridColumn:'1 / -1' }}>
                  <label className="verde-label">Checklist</label>
                  <select className="verde-input" value={form.checklist_sablon_id} onChange={e => setForm(f => ({...f, checklist_sablon_id:e.target.value}))}>
                    <option value="">Checklist yok</option>
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>{tpl.baslik}</option>
                    ))}
                  </select>
                  <div style={{ marginTop:6, fontSize:11, color:'#6b7280' }}>Checklist şablonlarını Yönetim → Checklist Şablonları ekranından oluşturabilirsiniz.</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:8, marginTop:16 }}>
                <Button variant="primary" onClick={save} disabled={loading}>{loading ? 'Kaydediliyor…' : '✓ Kaydet'}</Button>
                <Button variant="ghost" onClick={() => setOpenForm(false)}>İptal</Button>
              </div>
              {parentId && <div style={{ marginTop:10, fontSize:11, color:'#6b7280' }}>Alt lokasyon olarak eklenecek.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
