'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts'

/**
 * Yıkama Aktivitesi — GYS AktiviteGrafigi pattern'i ile uyumlu.
 *
 * 3 mode tab (GÜNLÜK saatlik / HAFTALIK gün / AYLIK hafta) + Recharts
 * AreaChart. KPI üçlüsü (Bugün/Bu Hafta/Bu Ay) chart üstünde.
 *
 * Veri: oto_yikama_gorev_metadata + gorevler!inner (durum=TAMAMLANDI).
 * PostgREST nested embed güvenilir değil → 2-step query.
 */
type Mode = 'gunluk' | 'haftalik' | 'aylik'

const T = {
  text: '#0f172a', textSoft: '#64748b', border: '#e5e7eb',
  blue: '#1d4ed8', green: '#16a34a', purple: '#7c3aed',
}

function trDateStr(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d)
}

export default function AktiviteBlock({ firmaId }: { firmaId: string }) {
  const supabase = createClient()
  const [mode, setMode] = useState<Mode>('gunluk')
  const [chartData, setChartData] = useState<{ label: string; value: number }[]>([])
  const [kpi, setKpi] = useState({ bugun: 0, hafta: 0, ay: 0 })
  const [yukleniyor, setYukleniyor] = useState(false)
  const [hata, setHata] = useState<string | null>(null)

  async function yukle() {
    if (!firmaId) return
    setYukleniyor(true)
    setHata(null)
    try {
      // 30 günlük metadata + tamamlanan gorevler (2-step query, embed güvenilir değil)
      // NOT: gorevIds büyürse .in() URL çok uzayabiliyor (Cloudflare 431/414).
      // Metadata sorgusunda hedef_tarih + arac_id + firma_id filter'ini
      // metadata seviyesinde uygulayamıyoruz çünkü firma_id metadata'da yok.
      // Çözüm: gorevIds'i chunk'la tara veya toplam limit koy.
      const son30 = trDateStr(new Date(Date.now() - 30 * 86400000))
      const { data: metaRows, error: metaErr } = await supabase
        .from('oto_yikama_gorev_metadata')
        .select('gorev_id')
        .gte('hedef_tarih', son30)
        .limit(5000)
      if (metaErr) throw new Error('metadata: ' + metaErr.message)
      const gorevIds = (metaRows ?? []).map(m => m.gorev_id)
      if (gorevIds.length === 0) {
        setChartData(bosCartData(mode))
        setKpi({ bugun: 0, hafta: 0, ay: 0 })
        return
      }
      // in() URL'sini şişirmemek için chunk'la
      const CHUNK = 500
      const tamamlanmaList: Date[] = []
      for (let i = 0; i < gorevIds.length; i += CHUNK) {
        const chunk = gorevIds.slice(i, i + CHUNK)
        const { data: gorevRows, error: gorevErr } = await supabase
          .from('gorevler')
          .select('id, tamamlanma_tarihi')
          .in('id', chunk)
          .eq('firma_id', firmaId)
          .eq('durum', 'TAMAMLANDI')
          .not('tamamlanma_tarihi', 'is', null)
        if (gorevErr) throw new Error('gorevler: ' + gorevErr.message)
        for (const g of (gorevRows ?? []) as any[]) {
          tamamlanmaList.push(new Date(g.tamamlanma_tarihi))
        }
      }

      // KPI
      const bugun = trDateStr(new Date())
      const haftaCutMs = Date.now() - 6 * 86400000
      const ayCutMs    = Date.now() - 29 * 86400000
      let bugunSay = 0, haftaSay = 0, aySay = 0
      for (const t of tamamlanmaList) {
        const tIso = trDateStr(t)
        if (tIso === bugun) bugunSay++
        if (t.getTime() >= haftaCutMs) haftaSay++
        if (t.getTime() >= ayCutMs)    aySay++
      }
      setKpi({ bugun: bugunSay, hafta: haftaSay, ay: aySay })

      // Chart bucket'ları mode'a göre
      if (mode === 'gunluk') {
        // Son 24 saat — saatlik
        const labels: string[] = []
        const grouped: Record<string, number> = {}
        for (let i = 23; i >= 0; i--) {
          const d = new Date(Date.now() - i * 3600000)
          const label = d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false })
          labels.push(label)
          grouped[label] = 0
        }
        for (const t of tamamlanmaList) {
          if (Date.now() - t.getTime() > 24 * 3600000) continue
          const label = t.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false })
          if (label in grouped) grouped[label]++
        }
        setChartData(labels.map(l => ({ label: l, value: grouped[l] || 0 })))
      } else if (mode === 'haftalik') {
        // Son 7 gün — gün kısa adı (Pzt/Sal/...)
        const labels: string[] = []
        const grouped: Record<string, number> = {}
        for (let i = 6; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000)
          const label = d.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short' })
          labels.push(label)
          grouped[label] = 0
        }
        for (const t of tamamlanmaList) {
          if (Date.now() - t.getTime() > 7 * 86400000) continue
          const label = t.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short' })
          if (label in grouped) grouped[label]++
        }
        setChartData(labels.map(l => ({ label: l, value: grouped[l] || 0 })))
      } else {
        // Son 30 gün — 4 hafta + bu hafta bucket
        const labels = ['4 hf önce', '3 hf önce', '2 hf önce', 'Geçen hafta', 'Bu hafta']
        const grouped: Record<string, number> = {}
        labels.forEach(l => { grouped[l] = 0 })
        for (const t of tamamlanmaList) {
          const diffGun = Math.floor((Date.now() - t.getTime()) / 86400000)
          const bucket = Math.min(4, Math.max(0, 4 - Math.floor(diffGun / 7)))
          grouped[labels[bucket]]++
        }
        setChartData(labels.map(l => ({ label: l, value: grouped[l] || 0 })))
      }
    } catch (e: any) {
      console.error('[AktiviteBlock] yükleme hatası:', e)
      setHata(e?.message ?? String(e))
      setChartData(bosCartData(mode))
    } finally {
      setYukleniyor(false)
    }
  }

  function bosCartData(m: Mode): { label: string; value: number }[] {
    // Chart'ın x-axis'i her zaman görünsün diye boş data yerine sıfır bucket'lar
    if (m === 'gunluk') {
      return Array.from({ length: 24 }, (_, i) => {
        const d = new Date(Date.now() - (23 - i) * 3600000)
        return { label: d.toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false }), value: 0 }
      })
    }
    if (m === 'haftalik') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(Date.now() - (6 - i) * 86400000)
        return { label: d.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short' }), value: 0 }
      })
    }
    return ['4 hf önce', '3 hf önce', '2 hf önce', 'Geçen hafta', 'Bu hafta'].map(l => ({ label: l, value: 0 }))
  }

  useEffect(() => { yukle() /* eslint-disable-next-line */ }, [firmaId, mode])

  // Real-time subscription — yıkama tamamlanınca chart anlık yenilensin
  useEffect(() => {
    const channel = supabase
      .channel('oto-yikama-aktivite')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'gorevler' }, () => yukle())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line
  }, [firmaId])

  return (
    <div className="verde-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.textSoft, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Yıkama Aktivitesi
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {([
            { k: 'gunluk',   l: 'GÜNLÜK' },
            { k: 'haftalik', l: 'HAFTALIK' },
            { k: 'aylik',    l: 'AYLIK' },
          ] as { k: Mode; l: string }[]).map(m => (
            <button key={m.k} onClick={() => setMode(m.k)}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 11.5, fontWeight: 700,
                cursor: 'pointer', letterSpacing: '0.04em',
                background: mode === m.k ? T.text : '#fff',
                color: mode === m.k ? '#fff' : T.text,
                border: `1px solid ${mode === m.k ? T.text : T.border}`,
              }}>
              {m.l}
            </button>
          ))}
        </div>
      </div>

      {/* KPI üçlüsü */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <KpiMini etiket="Bugün"    sayi={kpi.bugun} renk={T.blue} />
        <KpiMini etiket="Bu Hafta" sayi={kpi.hafta} renk={T.green} />
        <KpiMini etiket="Bu Ay"    sayi={kpi.ay}    renk={T.purple} />
      </div>

      {/* Area chart — ResponsiveContainer boyutu otomatik hesaplar,
          zoom / flex parent race'inden etkilenmez. */}
      <div style={{ width: '100%', height: 280, position: 'relative' }}>
        {yukleniyor && chartData.length === 0 && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', zIndex: 5,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.textSoft, fontSize: 13,
          }}>Yükleniyor…</div>
        )}
        {hata && (
          <div style={{
            position: 'absolute', top: 8, right: 8, zIndex: 5,
            padding: '4px 8px', background: '#fef2f2', color: '#b91c1c',
            fontSize: 11, borderRadius: 4, border: '1px solid #fecaca',
          }} title={hata}>Veri hatası</div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 6, right: 12, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id="aktiviteFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.green} stopOpacity={0.32} />
                <stop offset="100%" stopColor={T.green} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 600 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fontWeight: 600 }} />
            <Tooltip formatter={(v: any) => [`${v} yıkama`, 'Tamamlanan']} />
            <Area type="monotone" dataKey="value" stroke={T.green} strokeWidth={2}
              fill="url(#aktiviteFill)" name="Tamamlanan Yıkama" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function KpiMini({ etiket, sayi, renk }: { etiket: string; sayi: number; renk: string }) {
  return (
    <div style={{
      padding: '12px 14px',
      background: renk + '0f',
      borderLeft: `3px solid ${renk}`,
      borderRadius: 6,
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{etiket}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: renk, lineHeight: 1 }}>{sayi}</div>
    </div>
  )
}
