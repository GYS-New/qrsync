'use client'

import { useEffect, useState } from 'react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'

const T = { text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0', blue: '#1d4ed8' }

const VARSAYILAN = [
  { no: 1, baslangic: '00:00', bitis: '08:00' },
  { no: 2, baslangic: '08:00', bitis: '16:00' },
  { no: 3, baslangic: '16:00', bitis: '23:59' },
]

type Vardiya = { no: number; baslangic: string; bitis: string }

export default function VardiyaAyarlariPanel({ firmaId: propFirmaId }: { firmaId?: string | null }) {
  const { firmaId: saFirmaId } = useFirma()
  const firmaIdEfektif = propFirmaId || saFirmaId
  const { toast } = useToast()
  const [sayisi, setSayisi] = useState(3)
  // Her vardiya ayrı state — birbirini etkilemez
  const [v1Bas, setV1Bas] = useState('00:00')
  const [v1Bit, setV1Bit] = useState('08:00')
  const [v2Bas, setV2Bas] = useState('08:00')
  const [v2Bit, setV2Bit] = useState('16:00')
  const [v3Bas, setV3Bas] = useState('16:00')
  const [v3Bit, setV3Bit] = useState('23:59')
  const [v4Bas, setV4Bas] = useState('00:00')
  const [v4Bit, setV4Bit] = useState('06:00')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!firmaIdEfektif) return
    fetch(`/api/sistem-ayarlari/vardiya?firmaId=${firmaIdEfektif}`)
      .then(r => r.json())
      .then(j => {
        setSayisi(j.vardiya_sayisi ?? 3)
        const s = j.vardiya_saatleri ?? VARSAYILAN
        if (s[0]) { setV1Bas(s[0].baslangic); setV1Bit(s[0].bitis) }
        if (s[1]) { setV2Bas(s[1].baslangic); setV2Bit(s[1].bitis) }
        if (s[2]) { setV3Bas(s[2].baslangic); setV3Bit(s[2].bitis) }
        if (s[3]) { setV4Bas(s[3].baslangic); setV4Bit(s[3].bitis) }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [firmaIdEfektif])

  function getSaatler(): Vardiya[] {
    // Her zaman 4 vardiyayı da kaydet — sayı değiştiğinde eski değerler korunsun
    return [
      { no: 1, baslangic: v1Bas, bitis: v1Bit },
      { no: 2, baslangic: v2Bas, bitis: v2Bit },
      { no: 3, baslangic: v3Bas, bitis: v3Bit },
      { no: 4, baslangic: v4Bas, bitis: v4Bit },
    ]
  }

  async function kaydet() {
    if (!firmaIdEfektif) return
    setSaving(true)
    try {
      const res = await fetch('/api/sistem-ayarlari/vardiya', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmaId: firmaIdEfektif, vardiya_sayisi: sayisi, vardiya_saatleri: getSaatler() }),
      })
      if (!res.ok) throw new Error('Kaydedilemedi')
      toast({ type: 'success', title: 'Başarılı', message: 'Vardiya ayarları kaydedildi.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSaving(false)
  }

  if (loading) return <div style={{ padding: 20, color: T.textSoft }}>Yükleniyor...</div>

  const timeInp: React.CSSProperties = { flex: 1, height: 34, padding: '0 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 14, fontWeight: 700, textAlign: 'center' }

  return (
    <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>Vardiya Tanımları</label>
        <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>
          Günlük vardiya sayısı ve her vardiya için saat aralığı. Görev kuralları duraklatma bu vardiya tanımlarına göre çalışır.
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Vardiya Sayısı:</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 3, 4].map(n => (
            <button key={n} onClick={() => setSayisi(n)}
              style={{
                width: 36, height: 36, borderRadius: 8, border: `2px solid ${sayisi === n ? T.blue : T.border}`,
                background: sayisi === n ? '#eff6ff' : '#fff', color: sayisi === n ? T.blue : T.text,
                fontWeight: 800, fontSize: 15, cursor: 'pointer',
              }}>
              {n}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(sayisi, 4)}, 1fr)`, gap: 10, marginBottom: 16 }}>
        {sayisi >= 1 && (
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 8 }}>1. Vardiya</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="time" value={v1Bas} onChange={e => setV1Bas(e.target.value)} style={timeInp} />
              <span style={{ color: T.textSoft, fontWeight: 600 }}>—</span>
              <input type="time" value={v1Bit} onChange={e => setV1Bit(e.target.value)} style={timeInp} />
            </div>
          </div>
        )}
        {sayisi >= 2 && (
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 8 }}>2. Vardiya</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="time" value={v2Bas} onChange={e => setV2Bas(e.target.value)} style={timeInp} />
              <span style={{ color: T.textSoft, fontWeight: 600 }}>—</span>
              <input type="time" value={v2Bit} onChange={e => setV2Bit(e.target.value)} style={timeInp} />
            </div>
          </div>
        )}
        {sayisi >= 3 && (
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 8 }}>3. Vardiya</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="time" value={v3Bas} onChange={e => setV3Bas(e.target.value)} style={timeInp} />
              <span style={{ color: T.textSoft, fontWeight: 600 }}>—</span>
              <input type="time" value={v3Bit} onChange={e => setV3Bit(e.target.value)} style={timeInp} />
            </div>
          </div>
        )}
        {sayisi >= 4 && (
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 8 }}>4. Vardiya</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="time" value={v4Bas} onChange={e => setV4Bas(e.target.value)} style={timeInp} />
              <span style={{ color: T.textSoft, fontWeight: 600 }}>—</span>
              <input type="time" value={v4Bit} onChange={e => setV4Bit(e.target.value)} style={timeInp} />
            </div>
          </div>
        )}
      </div>

      <button onClick={kaydet} disabled={saving}
        style={{ padding: '8px 20px', borderRadius: 8, background: '#111827', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Kaydediliyor...' : 'Kaydet'}
      </button>
    </div>
  )
}
