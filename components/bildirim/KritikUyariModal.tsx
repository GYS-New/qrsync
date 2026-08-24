'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AlertTriangle } from 'lucide-react'

type Kritik = {
  id: string
  baslik: string
  mesaj: string
  tarih: string
}

/**
 * TA dashboard layout'una mount edilen polling-based kritik uyarı modal'ı.
 *
 * Polling: her 20 saniyede bir bildirimler tablosundan kullanıcının okunmamış
 * tip='kritik_uyari' kayıtlarını çeker. Varsa en yenisini büyük blocking modal'da
 * gösterir. "Anladım" → okundu=true.
 *
 * Sayfa ilk açıldığında da kontrol eder (kullanıcı arada bağlı değilken
 * gönderilen kritik uyarılar açılışta yakalanır).
 */
export default function KritikUyariModal() {
  const supabase = useMemo(() => createClient(), [])
  const [aktif, setAktif] = useState<Kritik | null>(null)
  const [meId, setMeId] = useState<string | null>(null)
  const [susturulmus, setSusturulmus] = useState<boolean | null>(null)
  const [kapatiliyor, setKapatiliyor] = useState(false)

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!active) return
      setMeId(user?.id ?? null)
      // Kullanicinin bildirim_susturulmus ayarini oku — susturulmus ise polling
      // baslamayacak, modal hic acilmayacak. Bildirim listede kalir.
      if (user?.id) {
        const { data } = await supabase
          .from('users').select('bildirim_susturulmus').eq('id', user.id).maybeSingle()
        if (active) setSusturulmus((data as any)?.bildirim_susturulmus === true)
      }
    })
    return () => { active = false }
  }, [supabase])

  useEffect(() => {
    if (!meId) return
    // Susturulmus kullanici veya susturulmus ayari henuz yuklenmemis ise polling baslatma
    if (susturulmus !== false) return
    let active = true

    async function kontrol() {
      const { data, error } = await supabase
        .from('bildirimler')
        .select('id,baslik,mesaj,tarih')
        .eq('alici_id', meId)
        .eq('tip', 'kritik_uyari')
        .eq('okundu', false)
        .order('tarih', { ascending: false })
        .limit(1)
      if (!active) return
      if (error) return
      const yeni = (data ?? [])[0] as Kritik | undefined
      if (yeni && (!aktif || aktif.id !== yeni.id)) {
        setAktif(yeni)
      }
    }

    kontrol()
    const t = setInterval(kontrol, 20000)
    return () => { active = false; clearInterval(t) }
  }, [meId, supabase, aktif, susturulmus])

  async function anladim() {
    if (!aktif) return
    setKapatiliyor(true)
    try {
      await supabase.from('bildirimler').update({ okundu: true }).eq('id', aktif.id)
    } catch {}
    setAktif(null)
    setKapatiliyor(false)
  }

  if (!aktif) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: 'kuFadeIn 0.18s ease-out',
      }}
    >
      <div style={{
        width: 'min(540px, calc(100% - 32px))',
        background: '#fff', borderRadius: 14, overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.45), 0 0 0 4px rgba(220,38,38,0.18)',
        border: '2px solid #dc2626',
        animation: 'kuPop 0.22s cubic-bezier(.25,1.4,.5,1)',
      }}>
        {/* Başlık bandı */}
        <div style={{
          background: 'linear-gradient(135deg, #dc2626, #991b1b)',
          color: '#fff', padding: '18px 22px',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: 'rgba(255,255,255,0.18)',
            display: 'grid', placeItems: 'center', flexShrink: 0,
            animation: 'kuPulse 1.4s ease-in-out infinite',
          }}>
            <AlertTriangle size={24} color="#fff" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.9, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Kritik Sistem Uyarısı
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.25, marginTop: 2 }}>
              {aktif.baslik}
            </div>
          </div>
        </div>

        {/* İçerik */}
        <div style={{ padding: '20px 22px 8px', fontSize: 14, color: '#1f2937', lineHeight: 1.6 }}>
          {aktif.mesaj}
        </div>

        <div style={{ padding: '4px 22px 8px', fontSize: 11.5, color: '#6b7280' }}>
          {new Date(aktif.tarih).toLocaleString('tr-TR')}
        </div>

        {/* Buton */}
        <div style={{ padding: '12px 22px 22px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={anladim}
            disabled={kapatiliyor}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 'none',
              background: '#1f2937', color: '#fff',
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
              opacity: kapatiliyor ? 0.6 : 1,
            }}
          >
            {kapatiliyor ? 'İşleniyor…' : 'Anladım'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes kuFadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes kuPop { from { transform: scale(0.94); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        @keyframes kuPulse { 0%, 100% { transform: scale(1); opacity: 1 } 50% { transform: scale(1.08); opacity: 0.8 } }
      `}</style>
    </div>
  )
}
