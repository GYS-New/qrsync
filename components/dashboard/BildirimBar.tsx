'use client'

import { useEffect, useState } from 'react'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'

type Bildirim = { id: string; mesaj: string; tip: string }

export default function BildirimBar({ rol, propFirmaId, propProjeId }: { rol: string; propFirmaId?: string | null; propProjeId?: string | null }) {
  const [bildirimler, setBildirimler] = useState<Bildirim[]>([])
  const [aktifIdx, setAktifIdx] = useState(0)
  const { firmaId: ctxFirmaId } = useFirma()
  const { aktifProje } = useProje()
  const firmaId = propFirmaId || ctxFirmaId
  const projeId = propProjeId || aktifProje?.id || null
  const isMusteriRol = rol === 'musteri'

  useEffect(() => {
    if (isMusteriRol) return
    if (!firmaId) return
    let alive = true

    const yukle = async () => {
      try {
        const items: Bildirim[] = []

        // 1. Duraklatma bildirimleri
        const dp = new URLSearchParams({ firmaId })
        if (projeId) dp.set('projeId', projeId)
        const res = await fetch(`/api/gorev-kurallari/duraklat-vardiya?${dp}`)
        const j = await res.json()
        const duraklatmalar = j.data ?? []

        if (duraklatmalar.length > 0) {
          // Tanım bazlı grupla
          const tanimGrup = new Map<string, any[]>()
          for (const d of duraklatmalar) {
            const arr = tanimGrup.get(d.tanim) ?? []
            arr.push(d)
            tanimGrup.set(d.tanim, arr)
          }

          // Her tanım için toplam görev sayısını çek (kural sayısı × frekans)
          const kuralRes = await fetch(`/api/gorev-kurallari?firma_id=${firmaId}${projeId ? `&proje_id=${projeId}` : ''}`)
          const kurallar = await kuralRes.json()
          const kuralArray = Array.isArray(kurallar) ? kurallar : []

          for (const [tanim, kayitlar] of tanimGrup) {
            // Bu tanıma ait toplam görev sayısı = kural sayısı × frekans
            const tanimKurallari = kuralArray.filter((k: any) => k.tanim === tanim && k.aktif)
            const toplamGorev = tanimKurallari.reduce((s: number, k: any) => s + (k.gunluk_frekans_sayisi ?? 1), 0)

            items.push({
              id: `duraklat-${tanim}`,
              mesaj: `⏸ Görev Duraklatma: "${tanim}" — ${toplamGorev} adet görev duraklatıldı`,
              tip: 'duraklat',
            })
          }
        }

        if (alive) setBildirimler(items)
      } catch {}
    }

    yukle()
    const interval = setInterval(yukle, 60000)
    return () => { alive = false; clearInterval(interval) }
  }, [firmaId, projeId])

  // Döngü animasyonu
  useEffect(() => {
    if (bildirimler.length <= 1) return
    const t = setInterval(() => {
      setAktifIdx(prev => (prev + 1) % bildirimler.length)
    }, 5000)
    return () => clearInterval(t)
  }, [bildirimler.length])

  if (isMusteriRol || bildirimler.length === 0) return null

  const aktif = bildirimler[aktifIdx % bildirimler.length]
  if (!aktif) return null

  return (
    <div style={{
      background: aktif.tip === 'duraklat' ? '#fffbeb' : '#eff6ff',
      borderBottom: `1px solid ${aktif.tip === 'duraklat' ? '#fde68a' : '#bfdbfe'}`,
      padding: '8px 28px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      minHeight: 36,
      borderTop: '1px solid #e5e7eb',
    }}>
      <span style={{
        fontSize: 13,
        fontWeight: 600,
        color: aktif.tip === 'duraklat' ? '#92400e' : '#1e40af',
        flex: 1,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {aktif.mesaj}
      </span>
      {bildirimler.length > 1 && (
        <span style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
          {(aktifIdx % bildirimler.length) + 1}/{bildirimler.length}
        </span>
      )}
    </div>
  )
}
