'use client'

/**
 * Reusable: Manuel durum değişimi öncesi gerekçe modal'ı.
 *
 * Kullanım — tekli durum değişimi:
 *   <DurumSebepModal
 *     open={openSebep}
 *     yeniDurum="ISLEMDE"
 *     onClose={() => setOpenSebep(false)}
 *     onConfirm={async (sebep) => { await setDurum(g, 'ISLEMDE', sebep) }}
 *   />
 *
 * Toplu durum değişimi:
 *   <DurumSebepModal ... toplamGorev={selectedIds.size} />
 *
 * Mig 099 sonrası tüm manuel durum değişimleri için zorunlu.
 */

import { useState, useEffect } from 'react'
import { durumSebepKontrol } from '@/lib/validation/durumSebep'

const DURUM_LABEL: Record<string, string> = {
  ACIK: 'Açık',
  ISLEMDE: 'İşlemde',
  BEKLEMEDE: 'Beklemede',
  TAMAMLANDI: 'Tamamlandı',
  ZAMANI_GECMIS: 'Zamanı Geçmiş',
  ZAMANINDA_YAPILAMAYAN: 'Zamanında Yapılamayan',
  IPTAL: 'İptal',
  KAPATILDI: 'Kapatıldı',
  SILINDI: 'Silindi',
  HAZIR: 'Hazır',
}

interface Props {
  open: boolean
  yeniDurum: string
  toplamGorev?: number   // > 1 ise toplu mod (mesaj farklı)
  onClose: () => void
  onConfirm: (sebep: string) => Promise<void> | void
}

export default function DurumSebepModal({ open, yeniDurum, toplamGorev = 1, onClose, onConfirm }: Props) {
  const [sebep, setSebep] = useState('')
  const [hata, setHata] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setSebep(''); setHata(null); setBusy(false) }
  }, [open])

  if (!open) return null

  const durumLabel = DURUM_LABEL[yeniDurum] ?? yeniDurum
  const toplu = toplamGorev > 1
  const baslik = toplu
    ? `${toplamGorev} görev için durum: ${durumLabel}`
    : `Durum değişikliği: ${durumLabel}`

  async function gonder() {
    const kontrol = durumSebepKontrol(sebep)
    if (!kontrol.ok) { setHata(kontrol.mesaj); return }
    setHata(null); setBusy(true)
    try {
      await onConfirm(kontrol.sebep)
    } catch (e: any) {
      setHata(e?.message ?? 'Beklenmeyen hata')
    }
    setBusy(false)
  }

  return (
    <div
      onClick={() => !busy && onClose()}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="verde-card"
        style={{ width: 'min(520px, 96vw)', padding: 22, borderRadius: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
      >
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{baslik}</div>
          <div style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.5 }}>
            {toplu
              ? `Aynı gerekçe ${toplamGorev} seçili görev için kaydedilecek.`
              : 'Durum değişikliği için gerekçe zorunlu. Görev kaydında saklanır, durum etiketine tıklanarak görüntülenebilir.'}
          </div>
        </div>

        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
          Gerekçe *
        </label>
        <textarea
          value={sebep}
          onChange={e => { setSebep(e.target.value); setHata(null) }}
          disabled={busy}
          placeholder="örn. müşteri talebi, kontrol amaçlı, ekipman arızası…"
          rows={4}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            border: `1px solid ${hata ? '#dc2626' : '#e2e8f0'}`,
            fontSize: 14, fontFamily: 'inherit', resize: 'vertical',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: '#6b7280' }}>
          <span>{hata ? <span style={{ color: '#dc2626', fontWeight: 600 }}>{hata}</span> : 'En az 5 karakter'}</span>
          <span>{sebep.length}/500</span>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            disabled={busy}
            style={{ padding: '8px 16px', borderRadius: 8, background: '#fff', color: '#374151', border: '1px solid #e2e8f0', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >Vazgeç</button>
          <button
            type="button"
            onClick={gonder}
            disabled={busy}
            style={{ padding: '8px 20px', borderRadius: 8, background: '#111827', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }}
          >{busy ? 'Kaydediliyor…' : 'Onayla'}</button>
        </div>
      </div>
    </div>
  )
}
