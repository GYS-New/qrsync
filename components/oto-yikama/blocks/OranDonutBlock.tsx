import { createAdminClient } from '@/lib/supabase/server'

/**
 * Bugün için Hedef / Tamamlanan / İptal oranları (SVG donut chart).
 * Veri: oto_yikama_gorev_metadata.hedef_tarih = bugün + gorevler.durum.
 */
export default async function OranDonutBlock({ firmaId }: { firmaId: string }) {
  const admin = createAdminClient()
  const bugun = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())

  // HEDEF sadece planli yikamalar (ekstra=false, onay bekleyen haric) — kural:
  // 'plansiz ve ekstra yikamalar hedef toplamini arttirmamalidir'.
  const { data: rows } = await admin
    .from('oto_yikama_gorev_metadata')
    .select('gorev_id, gorev:gorevler!inner(durum, firma_id)')
    .eq('gorev.firma_id', firmaId)
    .eq('hedef_tarih', bugun)
    .eq('ekstra', false)
    .neq('onay_durumu', 'ONAY_BEKLIYOR')

  const arr = (rows ?? []) as any[]
  const hedef = arr.length
  const tamamlanan = arr.filter(r => r.gorev?.durum === 'TAMAMLANDI').length
  const iptal = arr.filter(r => ['IPTAL', 'SILINDI', 'KAPATILDI'].includes(r.gorev?.durum ?? '')).length
  const bekleyen = Math.max(0, hedef - tamamlanan - iptal)

  // Donut SVG hesabı
  const size = 160
  const stroke = 20
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const cx = size / 2
  const cy = size / 2

  const t = (hedef > 0 ? tamamlanan / hedef : 0) * circumference
  const b = (hedef > 0 ? bekleyen   / hedef : 0) * circumference
  const i = (hedef > 0 ? iptal      / hedef : 0) * circumference

  const tamPct = hedef > 0 ? Math.round((tamamlanan / hedef) * 100) : 0
  const bekPct = hedef > 0 ? Math.round((bekleyen   / hedef) * 100) : 0
  const iptPct = hedef > 0 ? Math.round((iptal      / hedef) * 100) : 0

  return (
    <div className="verde-card" style={{ padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
        Bugün — Planlı Hedef / Tamamlanan / İptal
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
          {/* Arka plan halkası */}
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />

          {hedef > 0 && (
            <g transform={`rotate(-90 ${cx} ${cy})`}>
              {/* Tamamlanan (yeşil) */}
              <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#16a34a" strokeWidth={stroke}
                strokeDasharray={`${t} ${circumference - t}`} strokeDashoffset={0} />
              {/* Bekleyen (mavi) */}
              <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#1d4ed8" strokeWidth={stroke}
                strokeDasharray={`${b} ${circumference - b}`} strokeDashoffset={-t} />
              {/* İptal (kırmızı) */}
              <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#dc2626" strokeWidth={stroke}
                strokeDasharray={`${i} ${circumference - i}`} strokeDashoffset={-(t + b)} />
            </g>
          )}

          {/* Merkez metin */}
          <text x={cx} y={cy - 6} textAnchor="middle" fontSize="22" fontWeight="900" fill="#0f172a">
            {hedef}
          </text>
          <text x={cx} y={cy + 14} textAnchor="middle" fontSize="10" fill="#64748b" fontWeight="600">
            HEDEF
          </text>
        </svg>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
          <Lejant renk="#16a34a" baslik="Tamamlanan" sayi={tamamlanan} yuzde={tamPct} />
          <Lejant renk="#1d4ed8" baslik="Bekleyen"   sayi={bekleyen}   yuzde={bekPct} />
          <Lejant renk="#dc2626" baslik="İptal"      sayi={iptal}      yuzde={iptPct} />
        </div>
      </div>
    </div>
  )
}

function Lejant({ renk, baslik, sayi, yuzde }: { renk: string; baslik: string; sayi: number; yuzde: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 12, height: 12, borderRadius: 3, background: renk, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: '#374151' }}>{baslik}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{sayi}</div>
      <div style={{ fontSize: 11, color: '#64748b', minWidth: 36, textAlign: 'right' }}>%{yuzde}</div>
    </div>
  )
}
