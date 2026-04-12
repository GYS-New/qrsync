'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useFirma } from '@/components/layout/FirmaContext'
import { useProje } from '@/components/projeler/ProjeContext'

type Bildirim = { id: string; mesaj: string; tip: string }
type Aktivite = { id: string; mesaj: string; saat: string }

export default function BildirimBar({ rol }: { rol: string }) {
  const [bildirimler, setBildirimler] = useState<Bildirim[]>([])
  const [aktiviteler, setAktiviteler] = useState<Aktivite[]>([])
  const [solIdx, setSolIdx] = useState(0)
  const [sagIdx, setSagIdx] = useState(0)
  const [meInfo, setMeInfo] = useState<{ firma_id: string | null; proje_id: string | null } | null>(null)
  const supabase = useMemo(() => createClient(), [])

  const { firmaId: ctxFirmaId } = useFirma()
  const { aktifProje } = useProje()
  const isMusteriRol = rol === 'musteri'

  // TA/U için user bilgisi
  useEffect(() => {
    if (ctxFirmaId) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('users').select('firma_id,proje_id').eq('id', user.id).single()
        .then(({ data }) => { if (data) setMeInfo(data as any) })
    })
  }, [ctxFirmaId, supabase])

  const firmaId = ctxFirmaId || meInfo?.firma_id || null
  const projeId = aktifProje?.id || meInfo?.proje_id || null

  // Sol taraf: sistem bildirimleri + cron
  useEffect(() => {
    if (isMusteriRol || !firmaId) return
    let alive = true

    const yukle = async () => {
      try {
        const items: Bildirim[] = []

        // Duraklatmalar
        const dp = new URLSearchParams({ firmaId })
        if (projeId) dp.set('projeId', projeId)
        const res = await fetch(`/api/gorev-kurallari/duraklat-vardiya?${dp}`)
        const j = await res.json()
        const duraklatmalar = j.data ?? []

        if (duraklatmalar.length > 0) {
          const tanimGrup = new Map<string, any[]>()
          for (const d of duraklatmalar) {
            const arr = tanimGrup.get(d.tanim) ?? []
            arr.push(d)
            tanimGrup.set(d.tanim, arr)
          }
          const kuralRes = await fetch(`/api/gorev-kurallari?firma_id=${firmaId}${projeId ? `&proje_id=${projeId}` : ''}`)
          const kuralArray = Array.isArray(await kuralRes.json().catch(() => [])) ? await (await fetch(`/api/gorev-kurallari?firma_id=${firmaId}${projeId ? `&proje_id=${projeId}` : ''}`)).json() : []
          for (const [tanim] of tanimGrup) {
            const tanimKurallari = (Array.isArray(kuralArray) ? kuralArray : []).filter((k: any) => k.tanim === tanim && k.aktif)
            const toplamGorev = tanimKurallari.reduce((s: number, k: any) => s + (k.gunluk_frekans_sayisi ?? 1), 0)
            items.push({ id: `duraklat-${tanim}`, mesaj: `⏸ "${tanim}" — ${toplamGorev} görev duraklatıldı`, tip: 'duraklat' })
          }
        }

        // Cron logları
        try {
          const cronRes = await fetch('/api/cron-log')
          const cronJ = await cronRes.json()
          const CRON_MESAJLAR: Record<string, (s: any) => string> = {
            gece_dongu: s => `🌙 ${s?.uretim?.uretilen ?? 0} görev üretildi${s?.uretim?.duraklatilan ? `, ${s.uretim.duraklatilan} duraklatıldı` : ''}`,
            arsivleme: s => { const t = Object.values(s?.results ?? {}).reduce((acc: number, r: any) => acc + (r?.frekansiyel ?? 0) + (r?.spesifik ?? 0) + (r?.personel ?? 0) + (r?.musteri ?? 0), 0) as number; return `📦 ${t} kayıt arşivlendi` },
            simulasyon: s => `⚡ SİM: ${s?.tamamlanan ?? 0} görev`,
            max_sure: s => `⏰ ${(s?.gorevler_iptal ?? 0) + (s?.canli_gorevler_iptal ?? 0)} görev süre aşımı`,
            personel_takip: s => `👷 ${s?.gonderilen ?? 0} takip bildirimi`,
            rapor_gonder: s => `📊 ${s?.processed ?? 0} rapor gönderildi`,
            personel_destek: s => { const t = (s?.sonuclar ?? []).reduce((acc: number, r: any) => acc + (r?.tamamlanan ?? 0), 0); return `🤝 ${t} görev destek tamamlandı` },
          }
          for (const log of cronJ.data ?? []) {
            const fn = CRON_MESAJLAR[log.tip]
            if (!fn) continue
            const m = fn(log.sonuc)
            if (m.includes(' 0 ')) continue
            const saat = new Date(log.tarih).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
            items.push({ id: `cron-${log.tip}-${log.tarih}`, mesaj: `${m} (${saat})`, tip: 'cron' })
          }
        } catch {}

        if (alive) setBildirimler(items)
      } catch {}
    }

    yukle()
    const interval = setInterval(yukle, 60000)
    return () => { alive = false; clearInterval(interval) }
  }, [firmaId, projeId, isMusteriRol])

  // Sağ taraf: kullanıcı aktiviteleri
  useEffect(() => {
    if (isMusteriRol || !firmaId) return
    let alive = true

    const yukle = async () => {
      try {
        const qp = new URLSearchParams()
        if (firmaId) qp.set('firmaId', firmaId)
        if (projeId) qp.set('projeId', projeId)
        const res = await fetch(`/api/son-aktiviteler?${qp}`)
        const j = await res.json()
        if (alive) setAktiviteler(j.data ?? [])
      } catch {}
    }

    yukle()
    const interval = setInterval(yukle, 15000) // 15 saniyede bir
    return () => { alive = false; clearInterval(interval) }
  }, [firmaId, projeId, isMusteriRol])

  // Döngü — sol
  useEffect(() => {
    if (bildirimler.length <= 1) return
    const t = setInterval(() => setSolIdx(p => (p + 1) % bildirimler.length), 5000)
    return () => clearInterval(t)
  }, [bildirimler.length])

  // Döngü — sağ
  useEffect(() => {
    if (aktiviteler.length <= 1) return
    const t = setInterval(() => setSagIdx(p => (p + 1) % aktiviteler.length), 3000)
    return () => clearInterval(t)
  }, [aktiviteler.length])

  if (isMusteriRol) return null
  if (bildirimler.length === 0 && aktiviteler.length === 0) return null

  const sol = bildirimler.length > 0 ? bildirimler[solIdx % bildirimler.length] : null
  const sag = aktiviteler.length > 0 ? aktiviteler[sagIdx % aktiviteler.length] : null

  return (
    <div style={{
      display: 'flex',
      borderTop: '1px solid #e5e7eb',
      minHeight: 34,
    }}>
      {/* Sol — Sistem Bildirimleri */}
      <div style={{
        flex: 1,
        background: sol?.tip === 'duraklat' ? '#fffbeb' : '#f0f9ff',
        padding: '6px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        borderRight: '1px solid #e5e7eb',
        overflow: 'hidden',
      }}>
        {sol ? (
          <>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: sol.tip === 'duraklat' ? '#92400e' : '#0369a1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sol.mesaj}
            </span>
            {bildirimler.length > 1 && <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{(solIdx % bildirimler.length) + 1}/{bildirimler.length}</span>}
          </>
        ) : (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Bildirim yok</span>
        )}
      </div>

      {/* Sağ — Kullanıcı Aktiviteleri */}
      <div style={{
        flex: 1,
        background: '#fafffe',
        padding: '6px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        overflow: 'hidden',
      }}>
        {sag ? (
          <>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#065f46', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {sag.mesaj}
            </span>
            <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{sag.saat}</span>
            {aktiviteler.length > 1 && <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{(sagIdx % aktiviteler.length) + 1}/{aktiviteler.length}</span>}
          </>
        ) : (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Aktivite bekleniyor...</span>
        )}
      </div>
    </div>
  )
}
