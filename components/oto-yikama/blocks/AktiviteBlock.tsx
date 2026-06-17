import { createAdminClient } from '@/lib/supabase/server'

/**
 * Yıkama Aktivitesi — günlük/haftalık/aylık tamamlanan yıkama özeti.
 * 3 KPI kartı (Bugün, Bu Hafta, Bu Ay) + son 30 günün günlük bar chart'ı.
 *
 * Veri: oto_yikama_gorev_metadata + gorevler.durum='TAMAMLANDI'.
 * Tarih: gorevler.tamamlanma_tarihi (TR günü). Fallback: hedef_tarih.
 */
export default async function AktiviteBlock({ firmaId }: { firmaId: string }) {
  const admin = createAdminClient()
  const trDate = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d)
  const bugun = trDate(new Date())
  const son30Baslangic = trDate(new Date(Date.now() - 29 * 86400000))

  // Son 30 günün tamamlanan yıkamaları
  const { data: rows } = await admin
    .from('oto_yikama_gorev_metadata')
    .select('hedef_tarih, gorev:gorevler!inner(durum, tamamlanma_tarihi, firma_id)')
    .eq('gorev.firma_id', firmaId)
    .eq('gorev.durum', 'TAMAMLANDI')
    .gte('hedef_tarih', son30Baslangic)
    .lte('hedef_tarih', bugun)

  const arr = (rows ?? []) as any[]

  // Tarih → sayı
  const gunSayac = new Map<string, number>()
  for (const r of arr) {
    const gun = r.gorev?.tamamlanma_tarihi
      ? trDate(new Date(r.gorev.tamamlanma_tarihi))
      : r.hedef_tarih
    if (!gun) continue
    gunSayac.set(gun, (gunSayac.get(gun) ?? 0) + 1)
  }

  // KPI hesabı
  const haftaBaslangic = trDate(new Date(Date.now() - 6 * 86400000))   // son 7 gün
  const ayBaslangic    = trDate(new Date(Date.now() - 29 * 86400000))  // son 30 gün
  let bugunSay = 0, haftaSay = 0, aySay = 0
  for (const [gun, n] of gunSayac) {
    if (gun >= ayBaslangic)    aySay += n
    if (gun >= haftaBaslangic) haftaSay += n
    if (gun === bugun)         bugunSay = n
  }

  // 30 günlük dizi
  const gunler: { gun: string; sayi: number; etiket: string }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = trDate(new Date(Date.now() - i * 86400000))
    gunler.push({
      gun: d,
      sayi: gunSayac.get(d) ?? 0,
      etiket: d.slice(8, 10) + '.' + d.slice(5, 7),
    })
  }
  const maxSay = Math.max(1, ...gunler.map(g => g.sayi))
  const barH = 70

  return (
    <div className="verde-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Yıkama Aktivitesi
        </div>
      </div>

      {/* KPI üçlüsü */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <KpiMini etiket="Bugün"   sayi={bugunSay} renk="#1d4ed8" />
        <KpiMini etiket="Bu Hafta" sayi={haftaSay} renk="#16a34a" />
        <KpiMini etiket="Bu Ay"   sayi={aySay}   renk="#7c3aed" />
      </div>

      {/* 30 günlük bar chart */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
          Son 30 Gün — Günlük Tamamlanan Yıkama
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: barH, padding: '0 2px' }}>
          {gunler.map(g => {
            const h = g.sayi > 0 ? Math.max(3, (g.sayi / maxSay) * barH) : 2
            const isToday = g.gun === bugun
            return (
              <div key={g.gun}
                title={`${g.etiket}: ${g.sayi} yıkama`}
                style={{
                  flex: 1, minWidth: 0,
                  height: h,
                  background: g.sayi === 0 ? '#e5e7eb' : (isToday ? '#1d4ed8' : '#60a5fa'),
                  borderRadius: 2,
                }}
              />
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: '#94a3b8' }}>
          <span>{gunler[0]?.etiket}</span>
          <span>{gunler[Math.floor(gunler.length / 2)]?.etiket}</span>
          <span>{gunler[gunler.length - 1]?.etiket}</span>
        </div>
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
