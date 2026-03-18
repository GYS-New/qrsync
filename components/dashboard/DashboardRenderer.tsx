import type { DashboardBlokTuru } from '@/lib/dashboard/blocks'
import CanliIslemlerBlock from './blocks/CanliIslemlerBlock'
import CanliAkisIzlemeBlock from './blocks/CanliAkisIzlemeBlock'
import AktiviteGrafigiBlock from './blocks/AktiviteGrafigiBlock'
import FrekansiyelGorevAnaliziBlock from './blocks/FrekansiyelGorevAnaliziBlock'
import LokasyonGorevAnaliziBlock from './blocks/LokasyonGorevAnaliziBlock'

import AktifKullanicilarBlock from './blocks/AktifKullanicilarBlock'
import GunlukPerformansBlock from './blocks/GunlukPerformansBlock'
import SonGorevlerBlock from './blocks/SonGorevlerBlock'
import PersonelBasariAnaliziBlock from './blocks/PersonelBasariAnaliziBlock'

type LayoutSize = 'big' | 'small'

function defaultSizeForType(t: DashboardBlokTuru): LayoutSize {
  // KPI row is handled separately
  if (t === 'aktif_kullanicilar') return 'small'
  // Daily performance is designed as a small/right-side widget (2x2 stats)
  if (t === 'gunluk_performans') return 'small'
  if (t === 'personel_basari_analizi') return 'small'
  if (t === 'lokasyon_gorev_analizi') return 'small'
  if (t === 'canli_akis_izleme') return 'big'
  if (t === 'aktivite_grafigi') return 'big'
  if (t === 'frekansiyel_gorev_analizi') return 'big'
  
  if (t === 'son_gorevler') return 'big'
  return 'big'
}

export default async function DashboardRenderer({
  bloklar,
  firmaId,
  isSuperAdmin,
  basePath,
  projeId,
}: {
  bloklar: any[]
  firmaId: string | null
  isSuperAdmin: boolean
  basePath: string
  projeId?: string | null
}) {
  const active = (bloklar ?? []).filter((b) => b.aktif).sort((a, b) => (a.sira ?? 0) - (b.sira ?? 0))

  // KPI row (always full width)
  const kpi = active.find((b: any) => (b.blok_turu as DashboardBlokTuru) === 'canli_islemler')
  const rest = active.filter((b: any) => (b.blok_turu as DashboardBlokTuru) !== 'canli_islemler')

  const left: any[] = []
  const right: any[] = []

  for (const b of rest) {
    const t = b.blok_turu as DashboardBlokTuru
    const ayarlar = (b.ayarlar ?? {}) as any
    const size: LayoutSize = (ayarlar.layout as LayoutSize) ?? defaultSizeForType(t)
    ;(size === 'small' ? right : left).push(b)
  }

  const render = (b: any) => {
    const t = b.blok_turu as DashboardBlokTuru
    const ayarlar = (b.ayarlar ?? {}) as any

   
    if (t === 'son_gorevler') {
      return <SonGorevlerBlock key={b.id} firmaId={firmaId} basePath={basePath} projeId={projeId} limit={Number(ayarlar.limit ?? 8)} />
    }
    if (t === 'aktif_kullanicilar') {
      return <AktifKullanicilarBlock key={b.id} firmaId={firmaId} basePath={basePath} projeId={projeId} limit={Number(ayarlar.limit ?? 6)} />
    }
    if (t === 'gunluk_performans') {
      return <GunlukPerformansBlock key={b.id} firmaId={firmaId} basePath={basePath} projeId={projeId} />
    }
    if (t === 'personel_basari_analizi') {
      return <PersonelBasariAnaliziBlock key={b.id} firmaId={firmaId} basePath={basePath} projeId={projeId} />
    }
    if (t === 'canli_akis_izleme') {
      return <CanliAkisIzlemeBlock key={b.id} firmaId={firmaId} basePath={basePath} projeId={projeId} />
    }
    if (t === 'aktivite_grafigi') {
      return <AktiviteGrafigiBlock key={b.id} firmaId={firmaId} basePath={basePath} projeId={projeId} />
    }
    if (t === 'frekansiyel_gorev_analizi') {
      return <FrekansiyelGorevAnaliziBlock key={b.id} firmaId={firmaId} basePath={basePath} projeId={projeId} />
    }
    if (t === 'lokasyon_gorev_analizi') {
      return <LokasyonGorevAnaliziBlock key={b.id} firmaId={firmaId} basePath={basePath} projeId={projeId} />
    }
    return null
  }

  return (
    <div className="space-y-4">
      {kpi && (
        <div className="mb-1">
          <CanliIslemlerBlock firmaId={firmaId} isSuperAdmin={isSuperAdmin} projeId={projeId} />
        </div>
      )}

      {/*
        Main grid:
        - KPI row is 4 columns on md+ (md:grid-cols-4)
        - To keep the right column width equal to a single KPI card width, use the same 4-column grid on lg+
          and make big blocks span 3 columns, small blocks span 1 column.
      */}
      <div className="grid gap-4 items-start lg:grid-cols-4">
        <div className="flex flex-col gap-4 lg:col-span-3">{left.map(render)}</div>
        <div className="flex flex-col gap-4 lg:col-span-1">{right.map(render)}</div>
      </div>
    </div>
  )
}
