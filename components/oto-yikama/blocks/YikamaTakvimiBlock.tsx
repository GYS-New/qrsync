import { createAdminClient } from '@/lib/supabase/server'

/**
 * Yıkama Takvimi — bugün dahil önümüzdeki 7 gün için planlı yıkama
 * sayıları (bar chart). Veri: oto_yikama_gorev_metadata.hedef_tarih.
 */
export default async function YikamaTakvimiBlock({ firmaId }: { firmaId: string }) {
  const admin = createAdminClient()
  const bugun = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())

  // 7 günü önceden hesapla
  const trMs = Date.now()
  const gunler: { tarih: string; gunAdi: string; etiket: string; isToday: boolean }[] = []
  const gunAdlari = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']
  for (let i = 0; i < 7; i++) {
    const d = new Date(trMs + i * 86400000)
    const trIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(d)
    const gunIndex = new Date(trIso + 'T12:00:00Z').getUTCDay()
    gunler.push({
      tarih: trIso,
      gunAdi: gunAdlari[gunIndex],
      etiket: trIso.slice(8, 10) + '.' + trIso.slice(5, 7),
      isToday: trIso === bugun,
    })
  }
  const bitisTarih = gunler[gunler.length - 1].tarih

  // Tek sorguda 7 günün planlarını çek
  const { data: rows } = await admin
    .from('oto_yikama_gorev_metadata')
    .select('hedef_tarih, gorev:gorevler!inner(durum, firma_id)')
    .eq('gorev.firma_id', firmaId)
    .gte('hedef_tarih', bugun)
    .lte('hedef_tarih', bitisTarih)

  // Tarih → { toplam, tamamlanan }
  const sayac = new Map<string, { toplam: number; tamamlanan: number }>()
  for (const r of (rows ?? []) as any[]) {
    const e = sayac.get(r.hedef_tarih) ?? { toplam: 0, tamamlanan: 0 }
    e.toplam++
    if (r.gorev?.durum === 'TAMAMLANDI') e.tamamlanan++
    sayac.set(r.hedef_tarih, e)
  }

  const maxToplam = Math.max(1, ...gunler.map(g => sayac.get(g.tarih)?.toplam ?? 0))
  const grafikYukseklik = 100

  return (
    <div className="verde-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Yıkama Takvimi — Önümüzdeki 7 Gün
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, alignItems: 'flex-end' }}>
        {gunler.map(g => {
          const v = sayac.get(g.tarih) ?? { toplam: 0, tamamlanan: 0 }
          const barH = v.toplam > 0 ? Math.max(4, (v.toplam / maxToplam) * grafikYukseklik) : 4
          const tamH = v.toplam > 0 ? (v.tamamlanan / v.toplam) * barH : 0
          return (
            <div key={g.tarih} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a', minHeight: 14 }}>
                {v.toplam > 0 ? v.toplam : ''}
              </div>
              <div style={{
                width: '100%', height: grafikYukseklik,
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
              }}>
                <div style={{
                  width: '70%', height: barH,
                  background: v.toplam === 0 ? '#e5e7eb' : '#dbeafe',
                  borderRadius: '6px 6px 0 0',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {tamH > 0 && (
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      height: tamH,
                      background: '#16a34a',
                      borderRadius: tamH === barH ? '6px 6px 0 0' : 0,
                    }} />
                  )}
                </div>
              </div>
              <div style={{
                fontSize: 11, fontWeight: g.isToday ? 800 : 600,
                color: g.isToday ? '#4F6AFF' : '#374151',
              }}>{g.gunAdi}</div>
              <div style={{ fontSize: 10, color: '#94a3b8' }}>{g.etiket}</div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 12, fontSize: 11, color: '#64748b' }}>
        <Lejant renk="#16a34a" yazi="Tamamlanan" />
        <Lejant renk="#dbeafe" yazi="Planlı (kalan)" />
      </div>
    </div>
  )
}

function Lejant({ renk, yazi }: { renk: string; yazi: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 10, height: 10, background: renk, borderRadius: 2 }} />
      <span>{yazi}</span>
    </div>
  )
}
