import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import LokasyonlarClient from '@/components/lokasyon/LokasyonlarClient'
import { redirect } from 'next/navigation'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

export const dynamic = 'force-dynamic'

export default async function TALokasyonlarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', authUser.id).single()
  const firmaId = me?.firma_id
  const { data: firmaData } = firmaId
    ? await supabase.from('firmalar').select('qr_sablon_aktif').eq('id', firmaId).single()
    : { data: null }
  const qrSablonAktif = firmaData?.qr_sablon_aktif !== false

  const aktifProje = await getAktifProje(firmaId ?? null)
  if (!aktifProje) return (
    <div>
      <Topbar title="Lokasyonlar" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: 'Lokasyonlar' }]} />
      <ProjeSecilmedi />
    </div>
  )

  // Modül izolasyonu: Oto Yıkama lokasyonları GYS UI'da görünmez.
  const gizliOtoYikamaIds = firmaId ? await getOtoYikamaLokasyonIds(supabase as any, firmaId) : new Set<string>()

  let lokQ = supabase
    .from('lokasyonlar')
    .select('*')
    .eq('firma_id', firmaId)
    .eq('proje_id', aktifProje.id)
    .order('kayit_tarihi', { ascending: true })
  if (gizliOtoYikamaIds.size > 0) lokQ = (lokQ as any).not('id', 'in', `(${[...gizliOtoYikamaIds].join(',')})`)
  const { data: lokasyonlar } = await lokQ

  return (
    <div>
      <Topbar title="Lokasyonlar" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: aktifProje.ad }, { label: 'Lokasyonlar' }]} />
      <LokasyonlarClient
        base="/ta"
        initialFirmaId={firmaId}
        initialLokasyonlar={(lokasyonlar as any) ?? []}
        readonly={me?.rol !== 'tenant_admin'}
        projeId={aktifProje.id}
        qrSablonAktif={qrSablonAktif}
      />
    </div>
  )
}
