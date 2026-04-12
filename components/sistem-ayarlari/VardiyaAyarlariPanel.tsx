'use client'

import { useEffect, useRef, useState } from 'react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'

const T = { text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0', blue: '#1d4ed8' }

type Vardiya = { no: number; baslangic: string; bitis: string }

export default function VardiyaAyarlariPanel({ firmaId: propFirmaId }: { firmaId?: string | null }) {
  const { firmaId: saFirmaId } = useFirma()
  const firmaIdEfektif = propFirmaId || saFirmaId
  const { toast } = useToast()
  const [sayisi, setSayisi] = useState(3)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Uncontrolled inputs — ref ile değer okuma, birbirini etkilemez
  const r1b = useRef<HTMLInputElement>(null)
  const r1e = useRef<HTMLInputElement>(null)
  const r2b = useRef<HTMLInputElement>(null)
  const r2e = useRef<HTMLInputElement>(null)
  const r3b = useRef<HTMLInputElement>(null)
  const r3e = useRef<HTMLInputElement>(null)
  const r4b = useRef<HTMLInputElement>(null)
  const r4e = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!firmaIdEfektif) return
    fetch(`/api/sistem-ayarlari/vardiya?firmaId=${firmaIdEfektif}`)
      .then(r => r.json())
      .then(j => {
        setSayisi(j.vardiya_sayisi ?? 3)
        const s = j.vardiya_saatleri ?? []
        // setTimeout ile DOM hazır olduktan sonra set et
        setTimeout(() => {
          if (r1b.current) r1b.current.value = s[0]?.baslangic ?? ''
          if (r1e.current) r1e.current.value = s[0]?.bitis ?? ''
          if (r2b.current) r2b.current.value = s[1]?.baslangic ?? ''
          if (r2e.current) r2e.current.value = s[1]?.bitis ?? ''
          if (r3b.current) r3b.current.value = s[2]?.baslangic ?? ''
          if (r3e.current) r3e.current.value = s[2]?.bitis ?? ''
          if (r4b.current) r4b.current.value = s[3]?.baslangic ?? ''
          if (r4e.current) r4e.current.value = s[3]?.bitis ?? ''
        }, 50)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [firmaIdEfektif])

  function getSaatler(): Vardiya[] {
    return [
      { no: 1, baslangic: r1b.current?.value ?? '', bitis: r1e.current?.value ?? '' },
      { no: 2, baslangic: r2b.current?.value ?? '', bitis: r2e.current?.value ?? '' },
      { no: 3, baslangic: r3b.current?.value ?? '', bitis: r3e.current?.value ?? '' },
      { no: 4, baslangic: r4b.current?.value ?? '', bitis: r4e.current?.value ?? '' },
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

  const ti: React.CSSProperties = { flex: 1, height: 34, padding: '0 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 14, fontWeight: 700, textAlign: 'center' }

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
              <input id="v1b" type="time" ref={r1b} style={ti} />
              <span style={{ color: T.textSoft, fontWeight: 600 }}>—</span>
              <input id="v1e" type="time" ref={r1e} style={ti} />
            </div>
          </div>
        )}
        {sayisi >= 2 && (
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 8 }}>2. Vardiya</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input id="v2b" type="time" ref={r2b} style={ti} />
              <span style={{ color: T.textSoft, fontWeight: 600 }}>—</span>
              <input id="v2e" type="time" ref={r2e} style={ti} />
            </div>
          </div>
        )}
        {sayisi >= 3 && (
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 8 }}>3. Vardiya</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input id="v3b" type="time" ref={r3b} style={ti} />
              <span style={{ color: T.textSoft, fontWeight: 600 }}>—</span>
              <input id="v3e" type="time" ref={r3e} style={ti} />
            </div>
          </div>
        )}
        {sayisi >= 4 && (
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 8 }}>4. Vardiya</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input id="v4b" type="time" ref={r4b} style={ti} />
              <span style={{ color: T.textSoft, fontWeight: 600 }}>—</span>
              <input id="v4e" type="time" ref={r4e} style={ti} />
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
