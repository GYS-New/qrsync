import { createAdminClient } from '@/lib/supabase/server'
import { getYikamaSahaPersoneliUserIds } from '@/lib/oto-yikama/yetkililer'

/**
 * Şu anda online olan (son 10 dk içinde mobil aktivite olan) Oto Yıkama
 * saha personeli. Veri: device_tokens.son_kullanim + users JOIN.
 * Sadece birincil saha personeli sayılır (TA'lar / cross-functional U'lar
 * hariç) — KPI'daki "Yıkama Personeli" sayısıyla tutarlı.
 */
export default async function OnlinePersonelBlock({ firmaId }: { firmaId: string }) {
  const admin = createAdminClient()
  const onlineSince = new Date(Date.now() - 10 * 60 * 1000).toISOString()

  const yikamaUserIds = await getYikamaSahaPersoneliUserIds(admin, firmaId)
  let onlineUsers: { id: string; isim_soyisim: string; sonAktivite: string }[] = []

  if (yikamaUserIds.length > 0) {
    const { data: dtRows } = await admin
      .from('device_tokens')
      .select('user_id, son_kullanim')
      .eq('firma_id', firmaId)
      .eq('aktif', true)
      .in('user_id', yikamaUserIds)
      .gte('son_kullanim', onlineSince)
      .order('son_kullanim', { ascending: false })

    // user_id → en yeni son_kullanim
    const enYeniMap = new Map<string, string>()
    for (const r of (dtRows ?? []) as any[]) {
      if (!enYeniMap.has(r.user_id)) enYeniMap.set(r.user_id, r.son_kullanim)
    }
    const onlineIds = [...enYeniMap.keys()]
    if (onlineIds.length > 0) {
      const { data: us } = await admin
        .from('users').select('id, isim_soyisim').in('id', onlineIds)
      const isimMap = new Map(((us ?? []) as any[]).map(u => [u.id, u.isim_soyisim ?? '—']))
      onlineUsers = onlineIds.map(id => ({
        id,
        isim_soyisim: isimMap.get(id) ?? '—',
        sonAktivite: enYeniMap.get(id) ?? '',
      })).slice(0, 10)
    }
  }

  function relTime(iso: string): string {
    if (!iso) return '—'
    const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (diffSec < 60) return `${diffSec}sn önce`
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}dk önce`
    return `${Math.floor(diffSec / 3600)}sa önce`
  }

  function bashar(isim: string): string {
    return isim.split(' ').filter(Boolean).slice(0, 2).map(s => s[0] ?? '').join('').toUpperCase() || '?'
  }

  return (
    <div className="verde-card" style={{ padding: 20, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Online Personel
        </div>
        <div style={{
          fontSize: 11, fontWeight: 700, color: '#16a34a',
          padding: '3px 10px', background: '#dcfce7', borderRadius: 999,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{ width: 7, height: 7, background: '#16a34a', borderRadius: '50%' }} />
          {onlineUsers.length} kişi
        </div>
      </div>

      {onlineUsers.length === 0 ? (
        <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
          Şu an online yıkama personeli yok.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {onlineUsers.map(u => (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', borderRadius: 8, background: '#f8fafc',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'linear-gradient(145deg, #16a34a, #15803d)',
                color: '#fff', fontSize: 12, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>{bashar(u.isim_soyisim)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.isim_soyisim}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{relTime(u.sonAktivite)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
