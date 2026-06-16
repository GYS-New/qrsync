import Topbar from '@/components/layout/Topbar'
import { createAdminClient } from '@/lib/supabase/server'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'

export const dynamic = 'force-dynamic'

function bugunTRDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}

export default async function OtoYikamaDashboardPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const firmaId = isSA ? getAktifFirmaId() : me.firma_id
  const admin = createAdminClient()
  const bugun = bugunTRDate()

  // Veri çekme — firma yoksa boş değerler
  let kpiBugunPlanli = 0
  let kpiBugunTamamlanan = 0
  let kpiGeciken = 0
  let kpiAktifArac = 0
  let kpiYikamaPersonel = 0
  let sonYikamalar: { plaka: string; tamamlanma: string; tamamlayan: string }[] = []

  if (firmaId) {
    // Oto Yıkama üst lokasyonlarını al (KPI'lar bu kapsamda)
    const { data: otoLoks } = await admin
      .from('lokasyonlar').select('id').eq('firma_id', firmaId).eq('oto_yikama_lokasyon', true)
    const otoUstIds = (otoLoks ?? []).map((l: any) => l.id)

    // BFS ile alt lokasyonları topla
    let kapsamLokIds: string[] = [...otoUstIds]
    if (otoUstIds.length > 0) {
      const { data: tumLoks } = await admin
        .from('lokasyonlar').select('id, parent_id').eq('firma_id', firmaId)
      const queue = [...otoUstIds]
      const seti = new Set<string>(otoUstIds)
      while (queue.length) {
        const cur = queue.shift()!
        for (const l of (tumLoks ?? []) as any[]) {
          if (l.parent_id === cur && !seti.has(l.id)) { seti.add(l.id); queue.push(l.id) }
        }
      }
      kapsamLokIds = [...seti]
    }

    // KPI: Bugün planlı + tamamlanan + geciken (oto_yikama_gorev_metadata + gorevler JOIN)
    const { data: bugunGorevler } = await admin
      .from('oto_yikama_gorev_metadata')
      .select('gorev_id, hedef_tarih, plaka_snapshot, gorev:gorevler!inner(durum, tamamlanma_tarihi, tamamlayan_kullanici_id, firma_id, lokasyon_id)')
      .eq('gorev.firma_id', firmaId)
      .eq('hedef_tarih', bugun)
    const bugunArr = (bugunGorevler ?? []) as any[]
    kpiBugunPlanli = bugunArr.length
    kpiBugunTamamlanan = bugunArr.filter(r => r.gorev?.durum === 'TAMAMLANDI').length

    const { count: gecikenCount } = await admin
      .from('oto_yikama_gorev_metadata')
      .select('gorev_id, gorev:gorevler!inner(durum, firma_id)', { count: 'exact', head: true })
      .eq('gorev.firma_id', firmaId)
      .lt('hedef_tarih', bugun)
      .neq('gorev.durum', 'TAMAMLANDI')
    kpiGeciken = gecikenCount ?? 0

    // KPI: Aktif araç
    const { count: aracCount } = await admin
      .from('araclar')
      .select('id', { count: 'exact', head: true })
      .eq('firma_id', firmaId)
      .eq('aktif', true)
    kpiAktifArac = aracCount ?? 0

    // KPI: Yıkama personeli (kullanici_lokasyon_yetkileri + users.ust_lokasyon_id)
    if (otoUstIds.length > 0) {
      const [yetkiRes, userRes] = await Promise.all([
        admin.from('kullanici_lokasyon_yetkileri').select('user_id').eq('firma_id', firmaId).in('ust_lokasyon_id', otoUstIds),
        admin.from('users').select('id').eq('firma_id', firmaId).in('ust_lokasyon_id', otoUstIds),
      ])
      const ids = new Set<string>()
      for (const r of (yetkiRes.data ?? [])) ids.add((r as any).user_id)
      for (const u of (userRes.data ?? [])) ids.add((u as any).id)
      kpiYikamaPersonel = ids.size
    }

    // Son 5 tamamlanan yıkama
    const { data: sonRes } = await admin
      .from('oto_yikama_gorev_metadata')
      .select('plaka_snapshot, gorev:gorevler!inner(durum, tamamlanma_tarihi, tamamlayan_kullanici_id, firma_id)')
      .eq('gorev.firma_id', firmaId)
      .eq('gorev.durum', 'TAMAMLANDI')
      .order('hedef_tarih', { ascending: false })
      .limit(5)
    const userIds = [...new Set(((sonRes ?? []) as any[]).map(r => r.gorev?.tamamlayan_kullanici_id).filter(Boolean))]
    let userMap = new Map<string, string>()
    if (userIds.length > 0) {
      const { data: us } = await admin.from('users').select('id, isim_soyisim').in('id', userIds)
      userMap = new Map(((us ?? []) as any[]).map(u => [u.id, u.isim_soyisim ?? '—']))
    }
    sonYikamalar = ((sonRes ?? []) as any[]).map(r => ({
      plaka: r.plaka_snapshot ?? '—',
      tamamlanma: r.gorev?.tamamlanma_tarihi
        ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(r.gorev.tamamlanma_tarihi))
        : '—',
      tamamlayan: userMap.get(r.gorev?.tamamlayan_kullanici_id) ?? '—',
    }))
  }

  // Tamamlanma yüzdesi
  const tamamlanmaPct = kpiBugunPlanli > 0 ? Math.round((kpiBugunTamamlanan / kpiBugunPlanli) * 100) : 0

  return (
    <div>
      <Topbar title="Oto Yıkama" base={rolBase} breadcrumbs={[{ label: 'Oto Yıkama' }]} hideScopeControls />
      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!firmaId && (
          <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Görüntülemek için üstten bir firma seçin (GYS modülüne geçip orada firma seç).
          </div>
        )}

        {firmaId && (
          <>
            {/* KPI kartları */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 12,
            }}>
              <KpiCard label="Bugün Planlı" value={kpiBugunPlanli} ikon="🗓️" renk="#1d4ed8" />
              <KpiCard label="Bugün Tamamlanan" value={kpiBugunTamamlanan} suffix={` (%${tamamlanmaPct})`} ikon="✓" renk="#16a34a" />
              <KpiCard label="Geciken" value={kpiGeciken} ikon="⏰" renk={kpiGeciken > 0 ? '#dc2626' : '#6b7280'} />
              <KpiCard label="Aktif Araç" value={kpiAktifArac} ikon="🚗" renk="#0f172a" />
              <KpiCard label="Yıkama Personeli" value={kpiYikamaPersonel} ikon="👥" renk="#7c3aed" />
            </div>

            {/* Bugün ilerleme + Son yıkamalar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 2fr', gap: 16 }}>
              <div className="verde-card" style={{ padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Bugün İlerleme</div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 10 }}>
                  <div style={{ fontSize: 36, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>%{tamamlanmaPct}</div>
                  <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
                    {kpiBugunTamamlanan} / {kpiBugunPlanli} araç
                  </div>
                </div>
                <div style={{ height: 8, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${tamamlanmaPct}%`,
                    background: tamamlanmaPct >= 80 ? '#16a34a' : tamamlanmaPct >= 50 ? '#f59e0b' : '#dc2626',
                    transition: 'width 0.3s',
                  }} />
                </div>
                {kpiGeciken > 0 && (
                  <div style={{ marginTop: 14, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#991b1b' }}>
                    <strong>{kpiGeciken}</strong> yıkama önceki günlerden eksik kaldı
                  </div>
                )}
              </div>

              <div className="verde-card" style={{ padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Son Tamamlanan Yıkamalar</div>
                {sonYikamalar.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>Henüz tamamlanmış yıkama yok.</div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', color: '#374151', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Plaka</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', color: '#374151', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tamamlanma</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #e5e7eb', color: '#374151', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tamamlayan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sonYikamalar.map((y, i) => (
                        <tr key={i}>
                          <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9', fontWeight: 700, color: '#0f172a', fontFamily: 'monospace', letterSpacing: '0.05em' }}>{y.plaka}</td>
                          <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9', color: '#374151' }}>{y.tamamlanma}</td>
                          <td style={{ padding: '10px', borderBottom: '1px solid #f1f5f9', color: '#374151' }}>{y.tamamlayan}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Hızlı erişim */}
            <div className="verde-card" style={{ padding: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Hızlı Erişim</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
                <QuickLink href="/oto-yikama/gunluk"        ikon="📋" baslik="Günlük Tablo"   alt="Bugünün araç listesi" />
                <QuickLink href="/oto-yikama/gorev-olustur" ikon="➕" baslik="Görev Oluştur"  alt="Plaka × tarih bazlı yıkama planı" />
                <QuickLink href="/oto-yikama/araclar"       ikon="🚗" baslik="Araç Kayıtları" alt="Plaka, periyot, kullanıcı yönetimi" />
                <QuickLink href="/oto-yikama/raporlar"      ikon="📊" baslik="Raporlar"        alt="Plaka geçmişi, gecikmeler, istatistik" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, suffix, ikon, renk }: { label: string; value: number; suffix?: string; ikon: string; renk: string }) {
  return (
    <div className="verde-card" style={{ padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: renk + '14',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 22,
      }}>
        {ikon}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: renk, lineHeight: 1.1 }}>
          {value}{suffix && <span style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginLeft: 6 }}>{suffix}</span>}
        </div>
      </div>
    </div>
  )
}

function QuickLink({ href, ikon, baslik, alt }: { href: string; ikon: string; baslik: string; alt: string }) {
  return (
    <a href={href} style={{ textDecoration: 'none' }}>
      <div style={{
        padding: 14,
        border: '1px solid #e2e8f0',
        borderRadius: 10,
        background: '#f8fafc',
        cursor: 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
      }}>
        <div style={{ fontSize: 22, marginBottom: 6 }}>{ikon}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{baslik}</div>
        <div style={{ fontSize: 11.5, color: '#64748b', lineHeight: 1.4 }}>{alt}</div>
      </div>
    </a>
  )
}
