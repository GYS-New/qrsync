import { redirect } from 'next/navigation'
import Topbar from '@/components/layout/Topbar'
import LokasyonGruplariClient from '@/components/lokasyon-grup/LokasyonGruplariClient'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function SALokasyonGruplariPage() {
  const supabase = createClient()
  const admin = createAdminClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/sa/dashboard')

  const firmaId = getAktifFirmaId()
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null
  const projeId = aktifProje?.id ?? null

  if (!firmaId) {
    const [groupsRes, membersRes, locationsRes] = [{ data: [] as any[] }, { data: [] as any[] }, { data: [] as any[] }]
    return (
      <div>
        <Topbar title="Lokasyon Grupları" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Lokasyon Grupları' }]} />
        <LokasyonGruplariClient base="/sa" initialFirmaId={null} initialGroups={[]} initialLocations={[]} />
      </div>
    )
  }

  // Modül izolasyonu: Oto Yıkama lokasyonları + ust_lokasyon_id'si yıkama
  // olan grupları gizle.
  const gizliOtoIds = await getOtoYikamaLokasyonIds(admin as any, firmaId)
  const gizliFilterArg = gizliOtoIds.size > 0 ? `(${[...gizliOtoIds].join(',')})` : null

  let groupQ = admin.from('lokasyon_gruplari')
    .select('id,firma_id,ad,aciklama,aktif,kayit_tarihi,guncelleme_tarihi,kayit_yapan_id,ust_lokasyon_id')
    .eq('firma_id', firmaId).order('ad')
  if (projeId) groupQ = (groupQ as any).eq('proje_id', projeId)
  if (gizliFilterArg) groupQ = (groupQ as any).not('ust_lokasyon_id', 'in', gizliFilterArg)

  let locQ = admin.from('lokasyonlar')
    .select('id,firma_id,parent_id,tanim,aktif,kayit_tarihi')
    .eq('firma_id', firmaId).order('kayit_tarihi', { ascending: true })
  if (projeId) locQ = (locQ as any).eq('proje_id', projeId)
  if (gizliFilterArg) locQ = (locQ as any).not('id', 'in', gizliFilterArg)

  const [groupsRes, membersRes, locationsRes] = await Promise.all([
    groupQ,
    admin.from('lokasyon_grup_uyeleri').select('grup_id,lokasyon_id'),
    locQ,
  ])

  const initialGroups = (groupsRes.data ?? []).map((g: any) => ({
    ...g,
    lokasyonIds: (membersRes.data ?? []).filter((m: any) => m.grup_id === g.id).map((m: any) => m.lokasyon_id),
  }))

  return (
    <div>
      <Topbar title="Lokasyon Grupları" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Lokasyon Grupları' }]} />
      <LokasyonGruplariClient
        base="/sa"
        initialFirmaId={firmaId}
        projeId={projeId}
        initialGroups={initialGroups as any}
        initialLocations={(locationsRes.data as any) ?? []}
      />
    </div>
  )
}
