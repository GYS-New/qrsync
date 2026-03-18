import { createClient, createAdminClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import { redirect } from 'next/navigation'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'

export default async function TAPersonelTakibiPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')

  const firmaId = me.firma_id
  if (!firmaId) redirect('/ta/dashboard')

  const aktifProje = await getAktifProje(firmaId)
  if (!aktifProje) return (
    <div>
      <Topbar title="Personel Takibi" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: 'Personel Takibi' }]} />
      <ProjeSecilmedi />
    </div>
  )

  const admin = createAdminClient()

  // Projeye bağlı kullanıcılar
  const { data: kullanicilar, error: kulErr } = await admin
    .from('users')
    .select('id,isim_soyisim,email,rol,aktif,last_seen_at,profil_foto')
    .eq('firma_id', firmaId)
    .eq('proje_id', aktifProje.id)
    .eq('aktif', true)
    .order('isim_soyisim')

  if (kulErr) console.error('Kullanıcı sorgu hatası:', kulErr.message)

  // Her kullanıcının son 7 günlük görev istatistikleri
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const userIds = (kullanicilar ?? []).map(u => u.id)

  const { data: gorevStats } = userIds.length > 0
    ? await admin
        .from('canli_gorevler')
        .select('atanan_kullanici_id,durum')
        .eq('firma_id', firmaId)
        .eq('proje_id', aktifProje.id)
        .in('atanan_kullanici_id', userIds)
        .gte('aktif_olma_tarihi', since7d)
    : { data: [] }

  // Kullanıcı bazında istatistik hesapla
  const statsMap: Record<string, { toplam: number; tamamlandi: number; kayip: number }> = {}
  for (const g of gorevStats ?? []) {
    const uid = g.atanan_kullanici_id
    if (!uid) continue
    if (!statsMap[uid]) statsMap[uid] = { toplam: 0, tamamlandi: 0, kayip: 0 }
    statsMap[uid].toplam++
    if (g.durum === 'TAMAMLANDI') statsMap[uid].tamamlandi++
    else if (['ZAMANI_GECMIS', 'ZAMANINDA_YAPILAMAYAN', 'IPTAL'].includes(g.durum)) statsMap[uid].kayip++
  }

  const onlineSince = new Date(Date.now() - 2 * 60 * 1000).toISOString()

  return (
    <div>
      <Topbar
        title="Personel Takibi"
        base="/ta"
        breadcrumbs={[{ label: 'Yonetim' }, { label: aktifProje.ad }, { label: 'Personel Takibi' }]}
      />
      <div style={{ padding: 24 }}>

        {/* Özet */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Toplam Personel', val: kullanicilar?.length ?? 0, icon: '👥' },
            { label: 'Online (son 2dk)', val: (kullanicilar ?? []).filter(u => u.last_seen_at && u.last_seen_at > onlineSince).length, icon: '🟢' },
            { label: 'Son 7 Gün Görev', val: gorevStats?.length ?? 0, icon: '📋' },
          ].map(item => (
            <div key={item.label} className="verde-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ fontSize: 24 }}>{item.icon}</div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#0f1a0f' }}>{item.val}</div>
                <div style={{ fontSize: 12.5, color: '#7a907a', marginTop: 2 }}>{item.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Personel Listesi */}
        <div className="verde-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #e8f0e8', fontSize: 14, fontWeight: 800, color: '#0f1a0f' }}>
            Personel — {aktifProje.ad}
          </div>

          {(kullanicilar ?? []).length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#7a907a', fontSize: 14 }}>
              Bu projede henüz personel yok. Kullanıcılar sayfasından personel ekleyin.
            </div>
          ) : (
            <table className="verde-table">
              <thead>
                <tr>
                  <th>Personel</th>
                  <th>Durum</th>
                  <th>Son 7 Gün</th>
                  <th>Tamamlanan</th>
                  <th>Kayıp</th>
                  <th>Başarı</th>
                </tr>
              </thead>
              <tbody>
                {(kullanicilar ?? []).map(u => {
                  const st = statsMap[u.id] ?? { toplam: 0, tamamlandi: 0, kayip: 0 }
                  const basari = st.toplam > 0 ? Math.round((st.tamamlandi / st.toplam) * 100) : null
                  const isOnline = u.last_seen_at && u.last_seen_at > onlineSince
                  const initials = u.isim_soyisim?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#2e8b2e,#1f6b1f)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>
                            {initials}
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{u.isim_soyisim}</div>
                            <div style={{ fontSize: 11.5, color: '#7a907a' }}>{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 999, background: isOnline ? '#dcf0dc' : '#f3f4f6', color: isOnline ? '#1f6b1f' : '#6b7280' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: isOnline ? '#2e8b2e' : '#9ca3af' }} />
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700 }}>{st.toplam}</td>
                      <td style={{ color: '#2e8b2e', fontWeight: 700 }}>{st.tamamlandi}</td>
                      <td style={{ color: st.kayip > 0 ? '#dc2626' : '#6b7280', fontWeight: 700 }}>{st.kayip}</td>
                      <td>
                        {basari !== null ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: '#e8f0e8', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${basari}%`, background: basari >= 80 ? '#2e8b2e' : basari >= 50 ? '#d97706' : '#dc2626', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f1a0f', minWidth: 36 }}>%{basari}</span>
                          </div>
                        ) : <span style={{ color: '#9ca3af', fontSize: 12 }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
