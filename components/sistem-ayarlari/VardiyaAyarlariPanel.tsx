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

  // 4 vardiya her zaman ref ile — DOM'da her zaman mevcut
  const refs = {
    v1b: useRef<HTMLInputElement>(null), v1e: useRef<HTMLInputElement>(null),
    v2b: useRef<HTMLInputElement>(null), v2e: useRef<HTMLInputElement>(null),
    v3b: useRef<HTMLInputElement>(null), v3e: useRef<HTMLInputElement>(null),
    v4b: useRef<HTMLInputElement>(null), v4e: useRef<HTMLInputElement>(null),
  }

  useEffect(() => {
    if (!firmaIdEfektif) return
    fetch(`/api/sistem-ayarlari/vardiya?firmaId=${firmaIdEfektif}`)
      .then(r => r.json())
      .then(j => {
        setSayisi(j.vardiya_sayisi ?? 3)
        const s = j.vardiya_saatleri ?? []
        setTimeout(() => {
          if (refs.v1b.current) refs.v1b.current.value = s[0]?.baslangic ?? ''
          if (refs.v1e.current) refs.v1e.current.value = s[0]?.bitis ?? ''
          if (refs.v2b.current) refs.v2b.current.value = s[1]?.baslangic ?? ''
          if (refs.v2e.current) refs.v2e.current.value = s[1]?.bitis ?? ''
          if (refs.v3b.current) refs.v3b.current.value = s[2]?.baslangic ?? ''
          if (refs.v3e.current) refs.v3e.current.value = s[2]?.bitis ?? ''
          if (refs.v4b.current) refs.v4b.current.value = s[3]?.baslangic ?? ''
          if (refs.v4e.current) refs.v4e.current.value = s[3]?.bitis ?? ''
        }, 100)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [firmaIdEfektif])

  async function kaydet() {
    if (!firmaIdEfektif) return
    setSaving(true)
    try {
      const saatler: Vardiya[] = [
        { no: 1, baslangic: refs.v1b.current?.value ?? '', bitis: refs.v1e.current?.value ?? '' },
        { no: 2, baslangic: refs.v2b.current?.value ?? '', bitis: refs.v2e.current?.value ?? '' },
        { no: 3, baslangic: refs.v3b.current?.value ?? '', bitis: refs.v3e.current?.value ?? '' },
        { no: 4, baslangic: refs.v4b.current?.value ?? '', bitis: refs.v4e.current?.value ?? '' },
      ]
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

  const ti: React.CSSProperties = { flex: 1, height: 34, padding: '0 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontSize: 14, fontWeight: 700, textAlign: 'center' }
  const tiDisabled: React.CSSProperties = { ...ti, opacity: 0.3, background: '#f1f5f9' }

  const vardiyalar = [
    { no: 1, label: '1. Vardiya', rb: refs.v1b, re: refs.v1e },
    { no: 2, label: '2. Vardiya', rb: refs.v2b, re: refs.v2e },
    { no: 3, label: '3. Vardiya', rb: refs.v3b, re: refs.v3e },
    { no: 4, label: '4. Vardiya', rb: refs.v4b, re: refs.v4e },
  ]

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

      {/* Tüm 4 vardiya her zaman DOM'da — aktif olmayanlar disabled */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {vardiyalar.map(v => {
          const aktif = v.no <= sayisi
          return (
            <div key={v.no} style={{ background: aktif ? '#f8fafc' : '#fafafa', borderRadius: 8, padding: '12px 14px', border: `1px solid ${aktif ? T.border : '#f3f4f6'}`, opacity: aktif ? 1 : 0.4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: aktif ? T.blue : T.textSoft, marginBottom: 8 }}>{v.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="time" ref={v.rb} disabled={!aktif} style={aktif ? ti : tiDisabled} />
                <span style={{ color: T.textSoft, fontWeight: 600 }}>—</span>
                <input type="time" ref={v.re} disabled={!aktif} style={aktif ? ti : tiDisabled} />
              </div>
            </div>
          )
        })}
      </div>

      <button onClick={kaydet} disabled={saving}
        style={{ padding: '8px 20px', borderRadius: 8, background: '#111827', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Kaydediliyor...' : 'Kaydet'}
      </button>
    </div>
  )
}
