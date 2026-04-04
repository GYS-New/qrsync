'use client'

import { useCallback, useEffect, useState } from 'react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'

const T = {
  green: '#1a5c2a', border: '#e2e8f0', text: '#0f172a', textSoft: '#64748b', grayLight: '#f8fafc',
}

interface Props {
  isSA: boolean
  firmaId?: string | null
}

export default function GenelAyarlarClient({ isSA, firmaId: propFirmaId }: Props) {
  const { toast } = useToast()
  const { firmaId: saFirmaId } = useFirma()
  const currentFirmaId = isSA ? (saFirmaId ?? '') : (propFirmaId ?? '')

  const [hedefOrani, setHedefOrani] = useState<number>(10)
  const [loading, setLoading]       = useState(false)
  const [saving, setSaving]         = useState(false)

  const fetchAyarlar = useCallback(async () => {
    if (!currentFirmaId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/sistem-ayarlari/genel?firmaId=${currentFirmaId}`)
      const json = await res.json()
      if (res.ok) setHedefOrani(json.gorev_suresi_hedef_orani ?? 10)
    } catch {}
    setLoading(false)
  }, [currentFirmaId])

  useEffect(() => { fetchAyarlar() }, [fetchAyarlar])

  const handleSave = async () => {
    if (!currentFirmaId) return
    setSaving(true)
    try {
      const res = await fetch('/api/sistem-ayarlari/genel', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmaId: currentFirmaId, gorev_suresi_hedef_orani: hedefOrani }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Kaydetme hatası')
      toast({ type: 'success', title: 'Başarılı', message: 'Ayarlar kaydedildi.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSaving(false)
  }

  if (loading) {
    return <div style={{ padding: '40px 0', textAlign: 'center', color: T.textSoft, fontSize: 14 }}>Yükleniyor...</div>
  }

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Görevler başlığı */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ width: 4, height: 20, borderRadius: 2, background: T.green }} />
        <h3 style={{ fontSize: 16, fontWeight: 800, color: T.text, margin: 0 }}>Görevler</h3>
      </div>

      {/* Görev Süresi Hedef Oranı */}
      <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>
            Görev Süresi Hedef Tolerans Oranı
          </label>
          <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>
            Görev tamamlanma süresinin, lokasyona tanımlı hedef süreye göre kabul edilebilir sapma yüzdesi.
            Örneğin %10 seçilirse; hedef sürenin ±%10 aralığındaki tamamlanmalar "Hedefe Uygun",
            bu aralığın dışındakiler "Hedef Aşımı" olarak değerlendirilir. Süre Analiz Raporlarında kullanılır.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, maxWidth: 200 }}>
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600 }}>±</span>
            <input
              type="number"
              min={0}
              max={100}
              value={hedefOrani}
              onChange={e => setHedefOrani(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              style={{
                height: 38, padding: '0 12px', borderRadius: 8,
                border: `1px solid ${T.border}`, background: '#fff',
                fontSize: 15, fontWeight: 700, width: '100%', textAlign: 'center',
              }}
            />
            <span style={{ fontSize: 14, color: T.textSoft, fontWeight: 600 }}>%</span>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              height: 38, padding: '0 20px', borderRadius: 8,
              background: T.green, color: '#fff', border: 'none',
              fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>

        {/* Önizleme */}
        <div style={{ marginTop: 14, padding: '10px 14px', background: T.grayLight, borderRadius: 8, fontSize: 12.5, color: T.textSoft, lineHeight: 1.6 }}>
          <strong>Örnek:</strong> Hedef süre 60 dk ise → ±%{hedefOrani} toleransla{' '}
          <span style={{ color: T.green, fontWeight: 700 }}>{Math.round(60 * (1 - hedefOrani / 100))} dk – {Math.round(60 * (1 + hedefOrani / 100))} dk</span>{' '}
          aralığı "Hedefe Uygun" sayılır.
        </div>
      </div>
    </div>
  )
}
