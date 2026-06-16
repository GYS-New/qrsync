import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { suankiVardiyaGunu } from '@/lib/gorev/vardiyaGunu'
import type { DashboardBlockProps } from '../types'

const STAT = [
  { key: 'TAMAMLANDI',           label: 'Tamamlandı', color: '#10b981', bg: '#ecfdf5' },
  { key: 'ISLEMDE',              label: 'İşlemde',    color: '#f59e0b', bg: '#fffbeb' },
  { key: 'ACIK',                 label: 'Açık',       color: '#3b82f6', bg: '#eff6ff' },
  { key: 'IPTAL',                label: 'İptal',      color: '#ef4444', bg: '#fef2f2' },
]

/** Türkiye saatiyle bugünün UTC başlangıcını döndürür (UTC+3) */
function bugunTR(): Date {
  const now = new Date()
  const trOffset = 3 * 60 * 60 * 1000
  const trNow = new Date(now.getTime() + trOffset)
  trNow.setUTCHours(0, 0, 0, 0)
  return new Date(trNow.getTime() - trOffset)
}

export default async function GunlukPerformansBlock({
  firmaId, projeId, basePath, yetkiliLokIds,
}: DashboardBlockProps & { firmaId: string | null; projeId?: string | null }) {
  const supabase = createClient()
  const today = bugunTR()

  // Firma vardiya ayarlarını çek — sarkan V1 (örn 23:30-07:30) için bugünVG hesabı
  let bugunVG: string = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })
  if (firmaId) {
    const { data: firma } = await supabase
      .from('firmalar').select('vardiya_sayisi, tum_vardiya_ayarlari').eq('id', firmaId).single()
    if (firma) {
      const sayisi = (firma as any).vardiya_sayisi ?? 3
      const set = ((firma as any).tum_vardiya_ayarlari?.[String(sayisi)] ?? []) as { no: number; baslangic: string; bitis: string }[]
      bugunVG = suankiVardiyaGunu(Array.isArray(set) ? set : [])
    }
  }

  // Spesifik görevler (tek seferlik — vardiya kavramı yok, olusturma_tarihi korunur).
  // gorevler_normal view'i Oto Yıkama görevlerini hariç tutar.
  const buildQ1 = () => {
    let q = supabase.from('gorevler_normal').select('durum').gte('olusturma_tarihi', today.toISOString())
    if (firmaId) q = q.eq('firma_id', firmaId)
    if (projeId) q = (q as any).eq('proje_id', projeId)
    if (yetkiliLokIds?.length) q = (q as any).in('lokasyon_id', yetkiliLokIds)
    return q
  }

  // Frekansiyel görevler — vardiya_gunu üzerinden (sarkan V1 dahil)
  const buildQ2 = () => {
    let q = supabase.from('canli_gorevler').select('durum').eq('vardiya_gunu', bugunVG)
    if (firmaId) q = q.eq('firma_id', firmaId)
    if (projeId) q = (q as any).eq('proje_id', projeId)
    if (yetkiliLokIds?.length) q = (q as any).in('lokasyon_id', yetkiliLokIds)
    return q
  }

  const [d1, d2] = await Promise.all([fetchAll(buildQ1), fetchAll(buildQ2)])

  const counts: Record<string, number> = {}
  ;[...d1, ...d2].forEach((r: any) => {
    counts[r.durum] = (counts[r.durum] ?? 0) + 1
  })

  const total  = Object.values(counts).reduce((a, b) => a + b, 0)
  const maxVal = Math.max(1, ...STAT.map((s) => counts[s.key] ?? 0))

  return (
    <div className="verde-card dashboard-border-intro h-[420px] flex flex-col">
      <div style={{
        padding: '16px 18px 12px', borderBottom: '1px solid #f3f4f6',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>GÜNLÜK PERFORMANS</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Tüm görevler — bugün</div>
        </div>
        <Link href={`${basePath}/dashboard/gorevler`} className="text-[13px] text-[#374151] hover:underline mt-[2px]">
          Tümünü Gör
        </Link>
      </div>

      <div className="flex-1 flex flex-col" style={{ padding: '14px 18px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#374151' }}>Toplam</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#111827' }}>{total}</div>
        </div>

        <div className="flex-1" style={{ marginTop: 12, minHeight: 0 }}>
          <div style={{
            height: '100%', border: '1px solid #f3f4f6', borderRadius: 12,
            padding: '14px 14px 12px',
            background: '#ffffff',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ fontSize: 12.5, color: '#6b7280', fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>
              Durum Dağılımı
            </div>
            <div style={{
              marginTop: 10, flex: 1, minHeight: 0,
              display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 10, alignItems: 'end',
            }}>
              {STAT.map((s) => {
                const v    = counts[s.key] ?? 0
                const hPct = Math.round((v / maxVal) * 100)
                return (
                  <div key={s.key} style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 900, color: '#111827', textAlign: 'center', lineHeight: 1.1 }}>
                      {v}
                    </div>
                    <div style={{ marginTop: 8, flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 6 }}>
                      <div style={{
                        width: '100%', height: `${Math.max(6, hPct)}%`, borderRadius: 10,
                        background: s.color, opacity: v === 0 ? 0.25 : 0.9,
                        boxShadow: v === 0 ? 'none' : '0 10px 22px rgba(15,40,15,0.12)',
                      }} title={`${s.label}: ${v}`} />
                    </div>
                    <div style={{
                      fontSize: 12.5, color: '#374151', fontWeight: 900, textAlign: 'center',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.15px',
                    }}>
                      {s.label}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {total === 0 && (
          <div style={{ textAlign: 'center', color: '#6b7280', paddingTop: 12, fontSize: 13.5 }}>
            Bugün henüz kayıt yok
          </div>
        )}
      </div>
    </div>
  )
}
