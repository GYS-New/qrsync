'use client'

import { useEffect, useRef, useState } from 'react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useToast } from '@/components/ui/ToastProvider'

const T = { text: '#0f172a', textSoft: '#64748b', border: '#e2e8f0', blue: '#1d4ed8' }

type Vardiya = { no: number; baslangic: string; bitis: string }
type TumAyarlar = {
  [key: number]: Vardiya[] // 1 → [{no:1,...}], 2 → [{no:1,...},{no:2,...}], vs.
}

const BOS_AYARLAR: TumAyarlar = {
  1: [{ no: 1, baslangic: '', bitis: '' }],
  2: [{ no: 1, baslangic: '', bitis: '' }, { no: 2, baslangic: '', bitis: '' }],
  3: [{ no: 1, baslangic: '', bitis: '' }, { no: 2, baslangic: '', bitis: '' }, { no: 3, baslangic: '', bitis: '' }],
  4: [{ no: 1, baslangic: '', bitis: '' }, { no: 2, baslangic: '', bitis: '' }, { no: 3, baslangic: '', bitis: '' }, { no: 4, baslangic: '', bitis: '' }],
}

export default function VardiyaAyarlariPanel({ firmaId: propFirmaId }: { firmaId?: string | null }) {
  const { firmaId: saFirmaId } = useFirma()
  const firmaIdEfektif = propFirmaId || saFirmaId
  const { toast } = useToast()
  const [sayisi, setSayisi] = useState(3)
  const [ayarlar, setAyarlar] = useState<TumAyarlar>(BOS_AYARLAR)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!firmaIdEfektif) return
    fetch(`/api/sistem-ayarlari/vardiya?firmaId=${firmaIdEfektif}`)
      .then(r => r.json())
      .then(j => {
        setSayisi(j.vardiya_sayisi ?? 3)
        // DB'den gelen: tum_vardiya_ayarlari (4 set) veya eski format (tek dizi)
        const tumAyar = j.tum_vardiya_ayarlari
        if (tumAyar && typeof tumAyar === 'object') {
          setAyarlar(prev => {
            const yeni = { ...prev }
            for (const k of [1, 2, 3, 4]) {
              if (tumAyar[k]) yeni[k] = tumAyar[k]
            }
            return yeni
          })
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [firmaIdEfektif])

  function saatGuncelle(sayi: number, idx: number, field: 'baslangic' | 'bitis', val: string) {
    setAyarlar(prev => {
      const yeni = { ...prev }
      yeni[sayi] = yeni[sayi].map((v, i) => i === idx ? { ...v, [field]: val } : v)
      return yeni
    })
  }

  async function kaydet() {
    if (!firmaIdEfektif) return
    setSaving(true)
    try {
      const res = await fetch('/api/sistem-ayarlari/vardiya', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firmaId: firmaIdEfektif,
          vardiya_sayisi: sayisi,
          vardiya_saatleri: ayarlar[sayisi],
          tum_vardiya_ayarlari: ayarlar,
        }),
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
  const aktifVardiyalar = ayarlar[sayisi] ?? []

  return (
    <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10, padding: '18px 20px', marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 14, fontWeight: 700, color: T.text, display: 'block', marginBottom: 4 }}>Vardiya Tanımları</label>
        <div style={{ fontSize: 12.5, color: T.textSoft, lineHeight: 1.5 }}>
          Her vardiya sayısı için ayrı saat aralığı tanımlayın. Sayı seçimi değiştiğinde saatler bağımsız kalır.
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

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${aktifVardiyalar.length}, 1fr)`, gap: 10, marginBottom: 16 }}>
        {aktifVardiyalar.map((v, idx) => (
          <div key={`${sayisi}-${v.no}`} style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.blue, marginBottom: 8 }}>{v.no}. Vardiya</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="time" value={v.baslangic} onChange={e => saatGuncelle(sayisi, idx, 'baslangic', e.target.value)} style={ti} />
              <span style={{ color: T.textSoft, fontWeight: 600 }}>—</span>
              <input type="time" value={v.bitis} onChange={e => saatGuncelle(sayisi, idx, 'bitis', e.target.value)} style={ti} />
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
