import { createAdminClient } from '@/lib/supabase/server'

/**
 * Son N tamamlanan yıkama görevi (plaka, tamamlanma zamanı, tamamlayan personel).
 * Veri: oto_yikama_gorev_metadata + gorevler (durum=TAMAMLANDI) + users JOIN.
 */
export default async function SonYikamalarBlock({ firmaId, limit = 8 }: {
  firmaId: string
  limit?: number
}) {
  const admin = createAdminClient()

  const { data: rows } = await admin
    .from('oto_yikama_gorev_metadata')
    .select('plaka_snapshot, hedef_tarih, gorev:gorevler!inner(id, durum, tamamlanma_tarihi, tamamlayan_kullanici_id, firma_id, lokasyon_id)')
    .eq('gorev.firma_id', firmaId)
    .eq('gorev.durum', 'TAMAMLANDI')
    .order('hedef_tarih', { ascending: false })
    .limit(limit)

  const arr = (rows ?? []) as any[]

  // Personel + lokasyon adlarını çek
  const userIds = [...new Set(arr.map(r => r.gorev?.tamamlayan_kullanici_id).filter(Boolean))]
  const lokIds  = [...new Set(arr.map(r => r.gorev?.lokasyon_id).filter(Boolean))]
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

      {arr.length === 0 ? (
        <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
          Henüz tamamlanmış yıkama yok.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <Th>Plaka</Th>
                <Th>İstasyon</Th>
                <Th>Tamamlayan</Th>
                <Th align="right">Tamamlanma</Th>
              </tr>
            </thead>
            <tbody>
              {arr.map((r, i) => (
                <tr key={i}>
                  <Td bold mono>{r.plaka_snapshot ?? '—'}</Td>
                  <Td>{lokMap.get(r.gorev?.lokasyon_id) ?? '—'}</Td>
                  <Td>{userMap.get(r.gorev?.tamamlayan_kullanici_id) ?? '—'}</Td>
                  <Td align="right" muted>
                    {r.gorev?.tamamlanma_tarihi
                      ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(r.gorev.tamamlanma_tarihi))
                      : '—'}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' | 'left' }) {
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

function Td({ children, bold, mono, muted, align }: { children: React.ReactNode; bold?: boolean; mono?: boolean; muted?: boolean; align?: 'right' | 'left' }) {
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
