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
  const { firmaId: firmaIdEfektif } = useFirma()
  const firmaIdEfektif = propFirmaId || firmaIdEfektif
  const { toast } = useToast()
  const [sayisi, setSayisi] = useState(3)
  const [saatler, setSaatler] = useState<Vardiya[]>(VARSAYILAN)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!firmaIdEfektif) return
    fetch(`/api/sistem-ayarlari/vardiya?firmaId=${firmaIdEfektif}`)
      .then(r => r.json())
      .then(j => {
        setSayisi(j.vardiya_sayisi ?? 3)
        setSaatler(j.vardiya_saatleri ?? VARSAYILAN)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [firmaIdEfektif])

  function sayiDegistir(n: number) {
    setSayisi(n)
    const yeni: Vardiya[] = []
    const saatPerVardiya = Math.floor(24 / n)
    for (let i = 0; i < n; i++) {
      const mevcut = saatler[i]
      if (mevcut) {
        yeni.push(mevcut)
      } else {
        const bas = String(i * saatPerVardiya).padStart(2, '0') + ':00'
        const bit = i === n - 1 ? '23:59' : String((i + 1) * saatPerVardiya).padStart(2, '0') + ':00'
        yeni.push({ no: i + 1, baslangic: bas, bitis: bit })
      }
    }
    setSaatler(yeni.slice(0, n))
  }

  function saatGuncelle(idx: number, field: 'baslangic' | 'bitis', val: string) {
    setSaatler(prev => prev.map((v, i) => i === idx ? { ...v, [field]: val } : v))
  }

  async function kaydet() {
    if (!firmaIdEfektif) return
    setSaving(true)
    try {
      const res = await fetch('/api/sistem-ayarlari/vardiya', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firmaId: firmaIdEfektif, vardiya_sayisi: sayisi, vardiya_saatleri: saatler }),
      })
      if (!res.ok) throw new Error('Kaydedilemedi')
      toast({ type: 'success', title: 'Başarılı', message: 'Vardiya ayarları kaydedildi.' })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSaving(false)
  }

  if (loading) return <div style={{ padding: 20, color: T.textSoft }}>Yükleniyor...</div>

  const VARDIYA_ISIMLERI = ['1. Vardiya', '2. Vardiya', '3. Vardiya', '4. Vardiya']

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
            <button key={n} onClick={() => sayiDegistir(n)}
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
        {saatler.slice(0, sayisi).map((v, i) => (
          <div key={i} style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 8 }}>{VARDIYA_ISIMLERI[i]}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="time" value={v.baslangic} onChange={e => saatGuncelle(i, 'baslangic', e.target.value)}
                style={{ flex: 1, height: 34, padding: '0 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 14, fontWeight: 700, textAlign: 'center' }} />
              <span style={{ color: T.textSoft, fontWeight: 600 }}>—</span>
              <input type="time" value={v.bitis} onChange={e => saatGuncelle(i, 'bitis', e.target.value)}
                style={{ flex: 1, height: 34, padding: '0 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 14, fontWeight: 700, textAlign: 'center' }} />
            </div>
          </div>
        ))}
      </div>

      <button onClick={kaydet} disabled={saving}
        style={{ padding: '8px 20px', borderRadius: 8, background: '#111827', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Kaydediliyor...' : 'Kaydet'}
      </button>
    </div>
  )
}
