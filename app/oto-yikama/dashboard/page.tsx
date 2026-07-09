import Topbar from '@/components/layout/Topbar'
import { createAdminClient } from '@/lib/supabase/server'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import { getYikamaSahaPersoneliUserIds } from '@/lib/oto-yikama/yetkililer'
import { getOtoYikamaFirmaId } from '@/lib/oto-yikama/getOtoYikamaFirmaId'

import SonYikamalarBlock from '@/components/oto-yikama/blocks/SonYikamalarBlock'
import OnlinePersonelBlock from '@/components/oto-yikama/blocks/OnlinePersonelBlock'
import OranDonutBlock from '@/components/oto-yikama/blocks/OranDonutBlock'
import KategoriDagilimBlock from '@/components/oto-yikama/blocks/KategoriDagilimBlock'
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
  // Bu ayin ilk gunu (TR) — geciken kartinda sadece ay ici gerideler sayilir.
  const ayIlkGun = bugun.slice(0, 8) + '01'  // YYYY-MM-01

  // Üst sıra KPI'ları — sayfa-bazlı, blok değil (hızlı yükleme için)
  let kpiBugunPlanli = 0, kpiBugunPlanliTamamlanan = 0,
      kpiBugunEkstra = 0, kpiBugunTamamlanan = 0,
      kpiBugunPlansizTamamlanan = 0, kpiBugunEkstraTamamlanan = 0,
      kpiBugunOnayBekleyen = 0,
      kpiGeciken = 0, kpiAktifArac = 0, kpiYikamaPersonel = 0

  if (firmaId) {
    const [bugunRes, gecikenRes, aracRes, yikamaIds] = await Promise.all([
      // Ana KPI sorgusu — TÜM bugünkü metadata (onay bekleyen dahil)
      admin
        .from('oto_yikama_gorev_metadata')
        .select('gorev_id, ekstra, onay_durumu, gorev:gorevler!inner(durum, firma_id)')
        .eq('gorev.firma_id', firmaId)
        .eq('hedef_tarih', bugun),
      // Geciken = ay ici (ayIlkGun ≤ hedef_tarih < bugün) ve HAZIR/ACIK/ISLEMDE.
      // IPTAL, YAPILAMADI ve TAMAMLANDI kapali sayilir. Onceki aylardan gelen
      // gerideler sayilmaz (kullanici tercihi 2026-07-08).
      admin
        .from('oto_yikama_gorev_metadata')
        .select('gorev_id, gorev:gorevler!inner(durum, firma_id)', { count: 'exact', head: true })
        .eq('gorev.firma_id', firmaId)
        .gte('hedef_tarih', ayIlkGun)
        .lt('hedef_tarih', bugun)
        .in('gorev.durum', ['HAZIR', 'ACIK', 'ISLEMDE'])
        .neq('onay_durumu', 'ONAY_BEKLIYOR'),
      admin.from('araclar').select('id', { count: 'exact', head: true }).eq('firma_id', firmaId).eq('aktif', true),
      getYikamaSahaPersoneliUserIds(admin, firmaId),
    ])
    const bugunArr = (bugunRes.data ?? []) as any[]
    // 3 kategori:
    //   Planli   = ekstra=false
    //   Plansiz  = ekstra=true AND onay_durumu='ONAYSIZ' (kayitli plaka manuel)
    //   Ekstra   = onay_durumu IN ('ONAY_BEKLIYOR','ONAYLANDI') — tanimsiz plaka
    // Toplam Yikama = Planli + Plansiz + Ekstra; Bugun Tamamlanan tumu icerir.
    // Hedef sadece Planlidir (degismedi).
    const isEkstraTanimsiz = (r: any) =>
      r.onay_durumu === 'ONAY_BEKLIYOR' || r.onay_durumu === 'ONAYLANDI'
    kpiBugunPlanli       = bugunArr.filter(r => !r.ekstra).length
    kpiBugunPlanliTamamlanan = bugunArr.filter(r => !r.ekstra && r.gorev?.durum === 'TAMAMLANDI').length
    kpiBugunEkstra       = bugunArr.filter(r => r.ekstra === true && !isEkstraTanimsiz(r)).length
    kpiBugunOnayBekleyen = bugunArr.filter(r => isEkstraTanimsiz(r)).length
    kpiBugunPlansizTamamlanan = bugunArr.filter(r => r.ekstra === true && !isEkstraTanimsiz(r) && r.gorev?.durum === 'TAMAMLANDI').length
    kpiBugunEkstraTamamlanan  = bugunArr.filter(r => isEkstraTanimsiz(r) && r.gorev?.durum === 'TAMAMLANDI').length
    // Tamamlanan: durum=TAMAMLANDI olan tumu (planli + plansiz + ekstra dahil)
    kpiBugunTamamlanan   = bugunArr.filter(r => r.gorev?.durum === 'TAMAMLANDI').length
    kpiGeciken = gecikenRes.count ?? 0
    kpiAktifArac = aracRes.count ?? 0
    kpiYikamaPersonel = yikamaIds.length
  }

  // İlerleme: PLANLI hedef içinde PLANLI tamamlanan oranı. Ekstra ve plansız
  // yikamalar HEDEF'i arttirmadigi gibi bu oranin payini da sisirmez.
  // Onceki: kpiBugunTamamlanan (hepsi) / kpiBugunPlanli (sadece planli) —
  // iki farkli kategori boluyordu, ekran'da %62 gosteriyordu (24/39).
  // Yeni: kpiBugunPlanliTamamlanan (16) / kpiBugunPlanli (39) → %41 (donut ile ayni).
  const tamamlanmaPct = kpiBugunPlanli > 0 ? Math.round((kpiBugunPlanliTamamlanan / kpiBugunPlanli) * 100) : 0

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
              <KpiCard label="Bugün Planlı"      value={kpiBugunPlanli}          ikon="🗓️" renk="#1d4ed8" />
              <KpiCard label="Bugün Tamamlanan"  value={kpiBugunTamamlanan}       suffix={`(%${tamamlanmaPct})`} ikon="✓" renk="#16a34a" />
              <KpiCard label="Planlı Tamamlanan" value={kpiBugunPlanliTamamlanan} ikon="✅" renk="#0d9488" />
              <KpiCard label="Bugün Plansız"     value={kpiBugunEkstra}          ikon="➕" renk="#d97706" />
              <KpiCard label="Bugün Ekstra"      value={kpiBugunOnayBekleyen}    ikon="✋" renk={kpiBugunOnayBekleyen > 0 ? '#0891b2' : '#6b7280'} />
              <KpiCard label="Geciken"           value={kpiGeciken}              ikon="⏰" renk={kpiGeciken > 0 ? '#dc2626' : '#6b7280'} />
              <KpiCard label="Aktif Araç"        value={kpiAktifArac}            ikon="🚗" renk="#0f172a" />
              <KpiCard label="Yıkama Personeli"  value={kpiYikamaPersonel}       ikon="👥" renk="#7c3aed" />
            </div>

            {/* SIRA 2: Bugün İlerleme + Donut + Kategori Dağılımı + Online Personel (4 kolon, sabit) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
              <BugunIlerleme
                tamamlanan={kpiBugunPlanliTamamlanan}
                toplamTamamlanan={kpiBugunTamamlanan}
                hedef={kpiBugunPlanli}
                geciken={kpiGeciken}
              />
              <OranDonutBlock firmaId={firmaId} />
              <KategoriDagilimBlock
                hedef={kpiBugunPlanli}
                toplamTamamlanan={kpiBugunTamamlanan}
                planliTamamlanan={kpiBugunPlanliTamamlanan}
                plansizTamamlanan={kpiBugunPlansizTamamlanan}
                ekstraTamamlanan={kpiBugunEkstraTamamlanan}
              />
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

function BugunIlerleme({
  tamamlanan, toplamTamamlanan, hedef, geciken,
}: { tamamlanan: number; toplamTamamlanan: number; hedef: number; geciken: number }) {
  const planliPct = hedef > 0 ? Math.round((tamamlanan / hedef) * 100) : 0
  // Toplam bar: planli+plansiz+ekstra tamamlanan / planli hedef.
  // %100'i asabilir (aracin ekstra yikanmasi + planli tamamlanma). Bar gorseli
  // 100'de clamp, sayi gercek yuzdeyi gosterir.
  const toplamPct = hedef > 0 ? Math.round((toplamTamamlanan / hedef) * 100) : 0
  const toplamBarWidth = Math.min(100, toplamPct)
  return (
    <div className="verde-card" style={{ padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>
        Bugün İlerleme
      </div>

      {/* Bar 1: Planli tamamlanan / Planli hedef */}
      <Ilerleme
        baslik="Planlı Tamamlanan"
        pct={planliPct}
        deger={tamamlanan}
        hedef={hedef}
        renk={planliPct >= 80 ? '#16a34a' : planliPct >= 50 ? '#f59e0b' : '#dc2626'}
        barWidth={Math.min(100, planliPct)}
      />

      {/* Bar 2: Toplam tamamlanan (planli+plansiz+ekstra) / planli hedef */}
      <div style={{ marginTop: 28 }}>
        <Ilerleme
          baslik="Toplam Tamamlanan"
          pct={toplamPct}
          deger={toplamTamamlanan}
          hedef={hedef}
          renk={toplamPct >= 100 ? '#7c3aed' : '#1d4ed8'}
          barWidth={toplamBarWidth}
        />
      </div>

      {geciken > 0 && (
        <div style={{ marginTop: 14, padding: '8px 12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#991b1b' }}>
          <strong>{geciken}</strong> yıkama önceki günlerden eksik kaldı
        </div>
      )}
    </div>
  )
}

function Ilerleme({ baslik, pct, deger, hedef, renk, barWidth }: {
  baslik: string; pct: number; deger: number; hedef: number; renk: string; barWidth: number
}) {
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
        {baslik}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 8 }}>
        <div style={{ fontSize: 30, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>%{pct}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 3 }}>{deger} / {hedef} araç</div>
      </div>
      <div style={{ height: 8, background: '#e5e7eb', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${barWidth}%`,
          background: renk,
          transition: 'width 0.3s',
        }} />
      </div>
    </>
  )
}
