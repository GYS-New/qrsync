import { createAdminClient } from '@/lib/supabase/server'

/**
 * Son N tamamlanan yıkama görevi.
 *
 * NOT: PostgREST nested embed (gorev:gorevler!inner) bu tabloda güvenilir
 * değil — bazen .order('gorev.tamamlanma_tarihi') filtre uygulamayıp tüm
 * metadata'ları "hedef_tarih"e göre sıralıyor (bug). 2-step query +
 * client-side join kullanıyoruz: önce TAMAMLANDI görevleri tamamlanma'ya
 * göre çek, sonra metadata'larını çek.
 */
export default async function SonYikamalarBlock({ firmaId, limit = 8 }: {
  firmaId: string
  limit?: number
}) {
  const admin = createAdminClient()

  // 1) En son tamamlanan görevleri çek (Oto Yıkama olmayanlar da olabilir, sonra filtreleriz)
  // NOT: gorevler tablosunda 'tamamlayan_kullanici_id' yok; terminal duruma
  // geçişi yapan kişi 'islemi_yapan_id' kolonunda (gorevDurumPayload helper).
  const { data: gorevRows } = await admin
    .from('gorevler')
    .select('id, lokasyon_id, baslatilma_tarihi, tamamlanma_tarihi, tamamlanma_suresi_saniye, islemi_yapan_id')
    .eq('firma_id', firmaId)
    .eq('durum', 'TAMAMLANDI')
    .not('tamamlanma_tarihi', 'is', null)
    .order('tamamlanma_tarihi', { ascending: false })
    .limit(limit * 4) // Oto Yıkama olmayanları sonra eler — biraz fazlasını çek

  const gorevArr = (gorevRows ?? []) as any[]
  if (gorevArr.length === 0) {
    return <Bos />
  }

  // 2) Bu görevlerin metadata'sını çek (sadece Oto Yıkama olanlar dönecek)
  const gorevIds = gorevArr.map(g => g.id)
  const { data: metaRows } = await admin
    .from('oto_yikama_gorev_metadata')
    .select('gorev_id, plaka_snapshot, hedef_tarih, ekstra, onay_durumu')
    .in('gorev_id', gorevIds)

  const metaMap = new Map(((metaRows ?? []) as any[]).map(m => [m.gorev_id, m]))

  // 3) Oto Yıkama'ya filtreleyip tamamlanma sırasını koru, limit kadar al
  const otoYikama = gorevArr
    .filter(g => metaMap.has(g.id))
    .slice(0, limit)
    .map(g => ({
      gorev_id:           g.id,
      lokasyon_id:        g.lokasyon_id,
      baslatilma_tarihi:  g.baslatilma_tarihi,
      tamamlanma_tarihi:  g.tamamlanma_tarihi,
      sure_saniye:        g.tamamlanma_suresi_saniye as number | null,
      tamamlayan_id:      g.islemi_yapan_id,
      plaka:              metaMap.get(g.id)?.plaka_snapshot ?? '—',
      ekstra:             metaMap.get(g.id)?.ekstra === true,
      onay_durumu:        metaMap.get(g.id)?.onay_durumu as string | undefined,
    }))

  if (otoYikama.length === 0) {
    return <Bos />
  }

  // 4) Lookup map'leri (kullanıcı + lokasyon)
  const userIds = [...new Set(otoYikama.map(o => o.tamamlayan_id).filter(Boolean))]
  const lokIds  = [...new Set(otoYikama.map(o => o.lokasyon_id).filter(Boolean))]
  const [usersRes, loksRes] = await Promise.all([
    userIds.length > 0
      ? admin.from('users').select('id, isim_soyisim').in('id', userIds)
      : Promise.resolve({ data: [] as any[] }),
    lokIds.length > 0
      ? admin.from('lokasyonlar').select('id, tanim').in('id', lokIds)
      : Promise.resolve({ data: [] as any[] }),
  ])
  const userMap = new Map(((usersRes.data ?? []) as any[]).map(u => [u.id, u.isim_soyisim ?? '—']))
  const lokMap  = new Map(((loksRes.data ?? []) as any[]).map(l => [l.id, l.tanim ?? '—']))

  return (
    <div className="verde-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Son Yıkanan Araçlar
        </div>
        <a href="/oto-yikama/raporlar" style={{ fontSize: 12, fontWeight: 600, color: '#4F6AFF', textDecoration: 'none' }}>Tümünü Gör →</a>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <Th>Plaka</Th>
              <Th>İstasyon</Th>
              <Th>Tamamlayan</Th>
              <Th>Tarih</Th>
              <Th align="center">Başlama</Th>
              <Th align="center">Bitiş</Th>
              <Th align="right">Süre</Th>
            </tr>
          </thead>
          <tbody>
            {otoYikama.map((r, i) => (
              <tr key={i}>
                <Td bold mono>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {r.plaka}
                    {(r.onay_durumu === 'ONAY_BEKLIYOR' || r.onay_durumu === 'ONAYLANDI') ? (
                      <span style={{ padding: '1px 6px', borderRadius: 999, background: '#cffafe', color: '#0891b2', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>EKSTRA</span>
                    ) : r.ekstra ? (
                      <span style={{ padding: '1px 6px', borderRadius: 999, background: '#fef3c7', color: '#92400e', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>PLANSIZ</span>
                    ) : null}
                  </span>
                </Td>
                <Td>{lokMap.get(r.lokasyon_id) ?? '—'}</Td>
                <Td>{r.tamamlayan_id ? (userMap.get(r.tamamlayan_id) ?? '—') : '—'}</Td>
                <Td muted>{formatTarih(r.tamamlanma_tarihi)}</Td>
                <Td align="center" mono muted>{formatSaat(r.baslatilma_tarihi)}</Td>
                <Td align="center" mono muted>{formatSaat(r.tamamlanma_tarihi)}</Td>
                <Td align="right" bold>{formatSure(r.sure_saniye, r.baslatilma_tarihi, r.tamamlanma_tarihi)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Bos() {
  return (
    <div className="verde-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Son Yıkanan Araçlar
        </div>
        <a href="/oto-yikama/raporlar" style={{ fontSize: 12, fontWeight: 600, color: '#4F6AFF', textDecoration: 'none' }}>Tümünü Gör →</a>
      </div>
      <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
        Henüz tamamlanmış yıkama yok.
      </div>
    </div>
  )
}

const TR_TZ = 'Europe/Istanbul'

function formatTarih(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeZone: TR_TZ }).format(new Date(iso))
}

function formatSaat(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: TR_TZ }).format(new Date(iso))
}

function formatSure(saniye: number | null | undefined, basla?: string | null, bitis?: string | null): string {
  // DB'de tamamlanma_suresi_saniye yoksa baslatilma + tamamlanma'dan hesapla
  let sn = (typeof saniye === 'number' && saniye > 0) ? saniye : null
  if (sn == null && basla && bitis) {
    sn = Math.max(0, Math.floor((new Date(bitis).getTime() - new Date(basla).getTime()) / 1000))
  }
  if (sn == null || sn <= 0) return '—'
  if (sn < 60) return `${sn} sn`
  const dk = Math.floor(sn / 60), ksn = sn % 60
  if (dk < 60) return ksn > 0 ? `${dk} dk ${ksn} sn` : `${dk} dk`
  const sa = Math.floor(dk / 60), kdk = dk % 60
  return kdk > 0 ? `${sa} sa ${kdk} dk` : `${sa} sa`
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' | 'center' }) {
  return (
    <th style={{
      textAlign: align ?? 'left',
      padding: '8px 10px',
      borderBottom: '2px solid #e5e7eb',
      color: '#374151',
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.04em',
    }}>{children}</th>
  )
}

function Td({ children, bold, mono, muted, align }: { children: React.ReactNode; bold?: boolean; mono?: boolean; muted?: boolean; align?: 'right' | 'left' | 'center' }) {
  return (
    <td style={{
      padding: '10px',
      borderBottom: '1px solid #f1f5f9',
      textAlign: align ?? 'left',
      color: muted ? '#64748b' : '#0f172a',
      fontWeight: bold ? 700 : 400,
      fontFamily: mono ? 'monospace' : 'inherit',
      letterSpacing: mono ? '0.05em' : 'normal',
    }}>{children}</td>
  )
}
