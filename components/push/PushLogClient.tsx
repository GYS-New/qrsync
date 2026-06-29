'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { useConfirm } from '@/components/ui/ConfirmProvider'

interface LogKayit {
  id: string
  firma_id: string
  proje_id: string | null
  gonderen_id: string | null
  gonderen_isim: string
  alici_id: string | null
  alici_isim: string
  baslik: string
  icerik: string
  kanal: string
  cihaz_sayisi: number
  basarili: boolean
  hata_mesaji: string | null
  olusturma_tarihi: string
}

interface Props {
  firmaId: string | null // SA için null olabilir (tüm firmalar)
  projeId?: string | null
  canDelete?: boolean // SA ve TA true, U false
  isSA?: boolean
  firmalarListesi?: { id: string; firma_adi?: string; ticari_unvan?: string }[]
}

const KANAL_ETIKET: Record<string, string> = {
  default: 'Standart',
  gorev_uyari: 'Uyarı',
  gorev_tamamla: 'Tamamla',
}

export default function PushLogClient({ firmaId, projeId, canDelete = false, isSA = false, firmalarListesi = [] }: Props) {
  const { toast } = useToast()
  const { confirm } = useConfirm()
  const [kayitlar, setKayitlar] = useState<LogKayit[]>([])
  const [loading, setLoading] = useState(true)
  const [gun, setGun] = useState(30)
  const [basarili, setBasarili] = useState<'' | 'true' | 'false'>('')
  const [q, setQ] = useState('')
  const [detay, setDetay] = useState<LogKayit | null>(null)
  // SA için firma filtresi — null = tüm firmalar
  const [saFirmaFilter, setSaFirmaFilter] = useState<string | null>(firmaId)
  const [silMode, setSilMode] = useState(false)
  const [seciliIds, setSeciliIds] = useState<Set<string>>(new Set())
  const [silining, setSilining] = useState(false)

  const firmaAdiMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const f of firmalarListesi) m[f.id] = f.firma_adi ?? f.ticari_unvan ?? f.id
    return m
  }, [firmalarListesi])

  function yukle() {
    setLoading(true)
    const p = new URLSearchParams({ gun: String(gun) })
    if (isSA) {
      if (saFirmaFilter) p.set('firmaId', saFirmaFilter)
    } else if (firmaId) {
      p.set('firmaId', firmaId)
    }
    if (projeId) p.set('projeId', projeId)
    if (basarili) p.set('basarili', basarili)
    if (q.trim()) p.set('q', q.trim())
    fetch(`/api/push/log?${p}`)
      .then(r => r.json())
      .then(j => setKayitlar(Array.isArray(j?.data) ? j.data : []))
      .catch(() => setKayitlar([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { yukle() }, [firmaId, projeId, gun, basarili, saFirmaFilter, isSA])

  async function tekSil(k: LogKayit) {
    const ok = await confirm({
      title: 'Kaydı Sil',
      message: `"${k.baslik}" başlıklı bildirim kaydı silinecek. Bu işlem geri alınamaz.`,
      confirmText: 'Sil', cancelText: 'Vazgeç', variant: 'danger',
    })
    if (!ok) return
    setSilining(true)
    try {
      const res = await fetch(`/api/push/log?id=${k.id}`, { method: 'DELETE' })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Silme hatası')
      toast({ type: 'success', title: 'Silindi', message: 'Kayıt silindi' })
      setDetay(null)
      yukle()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSilining(false)
  }

  async function topluSil() {
    if (!seciliIds.size) return
    const ok = await confirm({
      title: 'Toplu Sil',
      message: `Seçili ${seciliIds.size} kayıt silinecek. Bu işlem geri alınamaz.`,
      confirmText: `${seciliIds.size} Kaydı Sil`, cancelText: 'Vazgeç', variant: 'danger',
    })
    if (!ok) return
    setSilining(true)
    try {
      const res = await fetch('/api/push/log', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(seciliIds) }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'Silme hatası')
      toast({ type: 'success', title: 'Silindi', message: `${j.silinen ?? seciliIds.size} kayıt silindi` })
      setSeciliIds(new Set())
      setSilMode(false)
      yukle()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSilining(false)
  }

  const toggleSecim = (id: string) => setSeciliIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  const tumunuSec = () => {
    if (seciliIds.size === kayitlar.length) setSeciliIds(new Set())
    else setSeciliIds(new Set(kayitlar.map(k => k.id)))
  }

  const basariliSayi = useMemo(() => kayitlar.filter(k => k.basarili).length, [kayitlar])
  const basarisizSayi = kayitlar.length - basariliSayi

  function tarihFormat(iso: string) {
    try {
      return new Date(iso).toLocaleString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return iso }
  }

  function kisalt(s: string, n = 60) {
    if (!s) return ''
    return s.length > n ? s.slice(0, n) + '…' : s
  }

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="verde-card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Başlık + filtreler */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="verde-input"
            placeholder="Ara (gönderen, alıcı, başlık, içerik)"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') yukle() }}
            style={{ maxWidth: 280 }}
          />
          {isSA && firmalarListesi.length > 0 && (
            <select className="verde-select" value={saFirmaFilter ?? 'tumu'} onChange={e => setSaFirmaFilter(e.target.value === 'tumu' ? null : e.target.value)} style={{ width: 180 }}>
              <option value="tumu">Firma (Tümü)</option>
              {firmalarListesi.map(f => (
                <option key={f.id} value={f.id}>{f.firma_adi ?? f.ticari_unvan ?? f.id}</option>
              ))}
            </select>
          )}
          <select className="verde-select" value={gun} onChange={e => setGun(Number(e.target.value))} style={{ width: 130 }}>
            <option value={1}>Son 1 gün</option>
            <option value={7}>Son 7 gün</option>
            <option value={30}>Son 30 gün</option>
            <option value={90}>Son 90 gün</option>
            <option value={365}>Son 1 yıl</option>
          </select>
          <select className="verde-select" value={basarili} onChange={e => setBasarili(e.target.value as any)} style={{ width: 140 }}>
            <option value="">Durum (Tümü)</option>
            <option value="true">Başarılı</option>
            <option value="false">Başarısız</option>
          </select>
          <button onClick={yukle} disabled={loading} className="verde-btn-outline-strong" style={{ padding: '7px 14px', fontSize: 13 }}>
            {loading ? 'Yükleniyor…' : '↻ Yenile'}
          </button>
          {canDelete && !silMode && (
            <button onClick={() => { setSilMode(true); setSeciliIds(new Set()) }} className="verde-btn-outline-strong" style={{ padding: '7px 14px', fontSize: 13, color: '#dc2626', borderColor: '#fca5a5' }}>
              🗑 Toplu Sil
            </button>
          )}
          {silMode && (
            <>
              {seciliIds.size > 0 ? (
                <button onClick={topluSil} disabled={silining} className="verde-btn-outline-strong" style={{ padding: '7px 14px', fontSize: 13, background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}>
                  🗑 {seciliIds.size} Kaydı Sil
                </button>
              ) : (
                <button onClick={() => { setSilMode(false); setSeciliIds(new Set()) }} className="verde-btn-outline-strong" style={{ padding: '7px 14px', fontSize: 13 }}>
                  Vazgeç
                </button>
              )}
              {seciliIds.size > 0 && (
                <button onClick={() => { setSilMode(false); setSeciliIds(new Set()) }} className="verde-btn-outline-strong" style={{ padding: '7px 14px', fontSize: 13 }}>
                  Vazgeç
                </button>
              )}
            </>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center', fontSize: 12.5 }}>
            <span><strong>{kayitlar.length}</strong> kayıt</span>
            <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ {basariliSayi}</span>
            {basarisizSayi > 0 && <span style={{ color: '#dc2626', fontWeight: 700 }}>✕ {basarisizSayi}</span>}
          </div>
        </div>

        {/* Tablo */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          <table className="verde-table" style={{ tableLayout: 'fixed', width: '100%' }}>
            <colgroup>
              {silMode && <col style={{ width: 36 }} />}
              <col style={{ width: 140 }} />
              {isSA && <col style={{ width: 150 }} />}
              <col style={{ width: 150 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 180 }} />
              <col />
              <col style={{ width: 90 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 90 }} />
              {canDelete && <col style={{ width: 70 }} />}
            </colgroup>
            <thead>
              <tr>
                {silMode && (
                  <th>
                    <input type="checkbox" checked={kayitlar.length > 0 && seciliIds.size === kayitlar.length} onChange={tumunuSec}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#dc2626' }} />
                  </th>
                )}
                <th>Tarih</th>
                {isSA && <th>Firma</th>}
                <th>Gönderen</th>
                <th>Alıcı</th>
                <th>Başlık</th>
                <th>İçerik</th>
                <th>Kanal</th>
                <th>Cihaz</th>
                <th>Durum</th>
                {canDelete && <th style={{ textAlign: 'right' }}>İşlem</th>}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const colCount = 8 + (silMode ? 1 : 0) + (isSA ? 1 : 0) + (canDelete ? 1 : 0)
                if (loading && kayitlar.length === 0) {
                  return <tr><td colSpan={colCount} style={{ textAlign: 'center', padding: 36, color: '#6b7280' }}>Yükleniyor…</td></tr>
                }
                if (kayitlar.length === 0) {
                  return <tr><td colSpan={colCount} style={{ textAlign: 'center', padding: 36, color: '#6b7280' }}>Kayıt bulunamadı</td></tr>
                }
                return kayitlar.map(k => (
                  <tr key={k.id}
                    onClick={(e) => {
                      if (silMode) toggleSecim(k.id)
                      else setDetay(k)
                    }}
                    style={{ cursor: 'pointer', background: silMode && seciliIds.has(k.id) ? '#fef2f2' : undefined }}
                  >
                    {silMode && (
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={seciliIds.has(k.id)} onChange={() => toggleSecim(k.id)}
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#dc2626' }} />
                      </td>
                    )}
                    <td style={{ fontSize: 12.5, color: '#4b5563', whiteSpace: 'nowrap' }}>{tarihFormat(k.olusturma_tarihi)}</td>
                    {isSA && (
                      <td style={{ fontSize: 12.5, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {firmaAdiMap[k.firma_id] ?? '—'}
                      </td>
                    )}
                    <td style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k.gonderen_isim}>{k.gonderen_isim}</td>
                    <td style={{ fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k.alici_isim}>{k.alici_isim}</td>
                    <td style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k.baslik}>{k.baslik}</td>
                    <td style={{ fontSize: 12.5, color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={k.icerik}>{kisalt(k.icerik, 80)}</td>
                    <td style={{ fontSize: 11.5, color: '#6b7280' }}>{KANAL_ETIKET[k.kanal] ?? k.kanal}</td>
                    <td style={{ fontSize: 12, color: '#4b5563', textAlign: 'center' }}>{k.cihaz_sayisi}</td>
                    <td>
                      {k.basarili ? (
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#dcfce7', color: '#166534' }}>✓ Başarılı</span>
                      ) : (
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#fee2e2', color: '#991b1b' }}>✕ Hata</span>
                      )}
                    </td>
                    {canDelete && (
                      <td onClick={e => e.stopPropagation()} style={{ textAlign: 'right' }}>
                        {!silMode && (
                          <button onClick={() => tekSil(k)} disabled={silining}
                            style={{ padding: '3px 8px', fontSize: 11, borderRadius: 5, border: '1px solid #fca5a5', background: '#fef2f2', color: '#dc2626', cursor: 'pointer' }}>
                            Sil
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detay modalı */}
      {detay && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(15,26,15,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onMouseDown={e => { if (e.target === e.currentTarget) setDetay(null) }}
        >
          <div style={{ background: '#fff', borderRadius: 12, width: 'min(560px, calc(100vw - 24px))', boxShadow: '0 18px 50px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>🔔 Bildirim Kaydı</div>
              <button onClick={() => setDetay(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}>✕</button>
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div><strong>Tarih:</strong> {tarihFormat(detay.olusturma_tarihi)}</div>
              <div><strong>Gönderen:</strong> {detay.gonderen_isim}</div>
              <div><strong>Alıcı:</strong> {detay.alici_isim}</div>
              <div><strong>Kanal:</strong> {KANAL_ETIKET[detay.kanal] ?? detay.kanal}</div>
              <div><strong>Hedef Cihaz Sayısı:</strong> {detay.cihaz_sayisi}</div>
              <div><strong>Durum:</strong>{' '}
                {detay.basarili
                  ? <span style={{ color: '#166534', fontWeight: 700 }}>✓ Başarılı</span>
                  : <span style={{ color: '#991b1b', fontWeight: 700 }}>✕ Başarısız</span>}
              </div>
              {detay.hata_mesaji && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '8px 12px', borderRadius: 8, color: '#991b1b' }}>
                  <strong>Hata:</strong> {detay.hata_mesaji}
                </div>
              )}
              <div style={{ marginTop: 6, padding: '10px 12px', background: '#f9fafb', borderRadius: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 4 }}>{detay.baslik}</div>
                <div style={{ fontSize: 13, color: '#4b5563', whiteSpace: 'pre-wrap' }}>{detay.icerik}</div>
              </div>
            </div>
            {canDelete && (
              <div style={{ padding: '12px 18px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => tekSil(detay)} disabled={silining}
                  style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #dc2626', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  🗑 Bu Kaydı Sil
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
