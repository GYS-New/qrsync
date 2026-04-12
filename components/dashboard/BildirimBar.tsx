'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'

type Bildirim = { id: string; mesaj: string; tip: string }

export default function BildirimBar({ rol }: { rol: string }) {
  const [bildirimler, setBildirimler] = useState<Bildirim[]>([])
  const [aktifIdx, setAktifIdx] = useState(0)
  const [meInfo, setMeInfo] = useState<{ firma_id: string | null; proje_id: string | null } | null>(null)
  const supabase = useMemo(() => createClient(), [])

  // Context'lerden al (SA'da çalışır, TA/U'da null dönebilir)
  const { firmaId: ctxFirmaId } = useFirma()
  const { aktifProje } = useProje()

  const isMusteriRol = rol === 'musteri'

  // TA/U için kendi user bilgisini çek
  useEffect(() => {
    if (ctxFirmaId) return // SA context'ten alıyor
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('users').select('firma_id,proje_id').eq('id', user.id).single()
        .then(({ data }) => { if (data) setMeInfo(data as any) })
    })
  }, [ctxFirmaId, supabase])

  const firmaId = ctxFirmaId || meInfo?.firma_id || null
  const projeId = aktifProje?.id || meInfo?.proje_id || null

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

        // 2. Cron bildirimleri
        try {
          const cronRes = await fetch('/api/cron-log')
          const cronJ = await cronRes.json()
          const cronLogs = cronJ.data ?? []

          const CRON_MESAJLAR: Record<string, (s: any) => string> = {
            gece_dongu: s => `🌙 Gece Döngüsü: ${s?.uretim?.uretilen ?? 0} görev üretildi${s?.uretim?.duraklatilan ? `, ${s.uretim.duraklatilan} duraklatıldı` : ''}`,
            arsivleme: s => {
              const t = Object.values(s?.results ?? {}).reduce((acc: number, r: any) => acc + (r?.frekansiyel ?? 0) + (r?.spesifik ?? 0) + (r?.personel ?? 0) + (r?.musteri ?? 0), 0) as number
              return `📦 Arşivleme: ${t} kayıt arşivlendi`
            },
            simulasyon: s => `⚡ Simülasyon: ${s?.tamamlanan ?? 0} görev tamamlandı`,
            max_sure: s => `⏰ Süre Kontrolü: ${(s?.gorevler_iptal ?? 0) + (s?.canli_gorevler_iptal ?? 0)} görev süre aşımından iptal edildi`,
            personel_takip: s => `👷 Personel Takip: ${s?.gonderilen ?? 0} bildirim gönderildi`,
            rapor_gonder: s => `📊 Rapor Gönderimi: ${s?.processed ?? 0} rapor işlendi`,
          }

          for (const log of cronLogs) {
            const mesajFn = CRON_MESAJLAR[log.tip]
            if (!mesajFn) continue
            const mesaj = mesajFn(log.sonuc)
            // "0 görev" gibi boş sonuçları atla
            if (mesaj.includes(': 0 ')) continue
            const tarih = new Date(log.tarih)
            const saatStr = tarih.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
            items.push({
              id: `cron-${log.tip}-${log.tarih}`,
              mesaj: `${mesaj} (${saatStr})`,
              tip: 'cron',
            })
          }
        } catch {}

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
      background: aktif.tip === 'duraklat' ? '#fffbeb' : '#f0f9ff',
      borderBottom: `1px solid ${aktif.tip === 'duraklat' ? '#fde68a' : '#e0f2fe'}`,
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
        color: aktif.tip === 'duraklat' ? '#92400e' : '#0369a1',
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
