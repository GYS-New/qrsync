import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import LokasyonlarClient from '@/components/lokasyon/LokasyonlarClient'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

export const dynamic = 'force-dynamic'

export default async function SALokasyonlarPage() {
  const supabase = createClient()
  const firmaId = getAktifFirmaId()
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null
  const { data: firmaData } = firmaId
    ? await supabase.from('firmalar').select('qr_sablon_aktif').eq('id', firmaId).single()
    : { data: null }
  const qrSablonAktif = firmaData?.qr_sablon_aktif !== false  // varsayılan true
  const projeId = aktifProje?.id ?? null

  // Modül izolasyonu: Oto Yıkama lokasyonları GYS UI'da görünmez.
  // Bunlar yıkama modülünün kendi sayfasında yönetilir.
  const gizliOtoYikamaIds = firmaId ? await getOtoYikamaLokasyonIds(supabase as any, firmaId) : new Set<string>()

  let q = firmaId
    ? supabase.from('lokasyonlar').select('*').eq('firma_id', firmaId).order('kayit_tarihi', { ascending: true })
    : null
  if (q && projeId) q = (q as any).eq('proje_id', projeId)
  if (q && gizliOtoYikamaIds.size > 0) q = (q as any).not('id', 'in', `(${[...gizliOtoYikamaIds].join(',')})`)

  const { data: lokasyonlar } = q ? await q : { data: [] as any[] }

  return (
    <div>
      <Topbar title="Lokasyonlar" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Lokasyonlar' }]} />
      <LokasyonlarClient
        base="/sa"
        initialFirmaId={firmaId}
        projeId={projeId}
        initialLokasyonlar={(lokasyonlar as any) ?? []}
        readonly={false}
        qrSablonAktif={qrSablonAktif}
      />
    </div>
  )
}
