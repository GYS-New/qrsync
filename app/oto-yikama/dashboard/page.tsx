import Topbar from '@/components/layout/Topbar'
import { createAdminClient } from '@/lib/supabase/server'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import { getYikamaSahaPersoneliUserIds } from '@/lib/oto-yikama/yetkililer'
import { getOtoYikamaFirmaId } from '@/lib/oto-yikama/getOtoYikamaFirmaId'

import SonYikamalarBlock from '@/components/oto-yikama/blocks/SonYikamalarBlock'
import OnlinePersonelBlock from '@/components/oto-yikama/blocks/OnlinePersonelBlock'
import OranDonutBlock from '@/components/oto-yikama/blocks/OranDonutBlock'
import YikamaTakvimiBlock from '@/components/oto-yikama/blocks/YikamaTakvimiBlock'
import AktiviteBlock from '@/components/oto-yikama/blocks/AktiviteBlock'

export const dynamic = 'force-dynamic'

function bugunTRDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}

export default async function OtoYikamaDashboardPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const admin = createAdminClient()
  const firmaId = await getOtoYikamaFirmaId(admin, me)
  const bugun = bugunTRDate()

  // Üst sıra KPI'ları — sayfa-bazlı, blok değil (hızlı yükleme için)
  let kpiBugunPlanli = 0, kpiBugunEkstra = 0, kpiBugunTamamlanan = 0,
      kpiGeciken = 0, kpiAktifArac = 0, kpiYikamaPersonel = 0

  if (firmaId) {
    const [bugunRes, gecikenRes, aracRes, yikamaIds] = await Promise.all([
      admin
        .from('oto_yikama_gorev_metadata')
        .select('gorev_id, ekstra, gorev:gorevler!inner(durum, firma_id)')
        .eq('gorev.firma_id', firmaId)
        .eq('hedef_tarih', bugun),
      // Geciken = hedef_tarih < bugün ve hâlâ AÇIK durumda (HAZIR/ACIK/ISLEMDE).
      // IPTAL, YAPILAMADI ve TAMAMLANDI kapalı sayılır — geciken'e dahil edilmez.
      admin
        .from('oto_yikama_gorev_metadata')
        .select('gorev_id, gorev:gorevler!inner(durum, firma_id)', { count: 'exact', head: true })
        .eq('gorev.firma_id', firmaId)
        .lt('hedef_tarih', bugun)
        .in('gorev.durum', ['HAZIR', 'ACIK', 'ISLEMDE']),
      admin.from('araclar').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId).eq('aktif', true),
      getYikamaSahaPersoneliUserIds(admin, firmaId),
    ])
    const bugunArr = (bugunRes.data ?? []) as any[]
    // Planlı = ekstra olmayanlar (cron'un ürettikleri); Ekstra = ekstra=true
    kpiBugunPlanli     = bugunArr.filter(r => !r.ekstra).length
    kpiBugunEkstra     = bugunArr.filter(r => r.ekstra === true).length
    kpiBugunTamamlanan = bugunArr.filter(r => r.gorev?.durum === 'TAMAMLANDI').length
    kpiGeciken = gecikenRes.count ?? 0
    kpiAktifArac = aracRes.count ?? 0
    kpiYikamaPersonel = yikamaIds.length
  }

  // İlerleme: hedef = planlı (ekstra hariç). Ekstralar bonus sayılır, oranı şişirmez.
  const tamamlanmaPct = kpiBugunPlanli > 0 ? Math.round((kpiBugunTamamlanan / kpiBugunPlanli) * 100) : 0

  return (
    <div>
      <Topbar title="Oto Yıkama" base={rolBase} breadcrumbs={[{ label: 'Oto Yıkama' }]} hideScopeControls hideNotifBar />
      <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!firmaId && (
          <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Görüntülemek için üstten bir firma seçin (GYS modülüne geçip orada firma seç).
          </div>
        )}

        {firmaId && (
          <>
            {/* SIRA 1: KPI kartları */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
              <KpiCard label="Bugün Planlı"     value={kpiBugunPlanli}     ikon="🗓️" renk="#1d4ed8" />
              <KpiCard label="Bugün Plansız"    value={kpiBugunEkstra}     ikon="➕" renk="#d97706" />
              <KpiCard label="Bugün Tamamlanan" value={kpiBugunTamamlanan} suffix={`(%${tamamlanmaPct})`} ikon="✓"  renk="#16a34a" />
              <KpiCard label="Geciken"          value={kpiGeciken}         ikon="⏰" renk={kpiGeciken > 0 ? '#dc2626' : '#6b7280'} />
              <KpiCard label="Aktif Araç"       value={kpiAktifArac}       ikon="🚗" renk="#0f172a" />
              <KpiCard label="Yıkama Personeli" value={kpiYikamaPersonel}  ikon="👥" renk="#7c3aed" />
            </div>

            {/* SIRA 2: Bugün İlerleme + Hedef/Tamamlanan/İptal Donut + Online Personel */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              <BugunIlerleme
                tamamlanan={kpiBugunTamamlanan}
                hedef={kpiBugunPlanli}
                geciken={kpiGeciken}
              />
              <OranDonutBlock firmaId={firmaId} />
              <OnlinePersonelBlock firmaId={firmaId} />
            </div>

            {/* SIRA 3: Yıkama Aktivitesi (geniş) */}
            <AktiviteBlock firmaId={firmaId} />

            {/* SIRA 4: Yıkama Takvimi (önümüzdeki 7 gün) */}
            <YikamaTakvimiBlock firmaId={firmaId} />

            {/* SIRA 5: Son Yıkanan Araçlar */}
            <SonYikamalarBlock firmaId={firmaId} limit={8} />
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

function BugunIlerleme({ tamamlanan, hedef, geciken }: { tamamlanan: number; hedef: number; geciken: number }) {
  const pct = hedef > 0 ? Math.round((tamamlanan / hedef) * 100) : 0
  return (
    <div className="verde-card" style={{ padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
        Bugün İlerleme
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 10 }}>
        <div style={{ fontSize: 36, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>%{pct}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>{tamamlanan} / {hedef} araç</div>
      </div>
      <div style={{ height: 8, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: pct >= 80 ? '#16a34a' : pct >= 50 ? '#f59e0b' : '#dc2626',
          transition: 'width 0.3s',
        }} />
      </div>
      {geciken > 0 && (
        <div style={{ marginTop: 14, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#991b1b' }}>
          <strong>{geciken}</strong> yıkama önceki günlerden eksik kaldı
        </div>
      )}
    </div>
  )
}
