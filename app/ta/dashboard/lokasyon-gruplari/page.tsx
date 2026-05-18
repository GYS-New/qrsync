import { redirect } from 'next/navigation'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import Topbar from '@/components/layout/Topbar'
import LokasyonGruplariClient from '@/components/lokasyon-grup/LokasyonGruplariClient'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function TALokasyonGruplariPage() {
  const supabase = createClient()
  const admin = createAdminClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')

  const firmaId = me.firma_id ?? null
  const aktifProje = await getAktifProje(firmaId)
  if (!aktifProje) return (
    <div>
      <Topbar title="Lokasyon Gruplari" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: 'Lokasyon Gruplari' }]} />
      <ProjeSecilmedi />
    </div>
  )

  const [groupsRes, membersRes, locationsRes] = firmaId
    ? await Promise.all([
        admin.from('lokasyon_gruplari').select('id,firma_id,ad,aciklama,aktif,kayit_tarihi,guncelleme_tarihi,kayit_yapan_id,ust_lokasyon_id').eq('firma_id', firmaId).eq('proje_id', aktifProje.id).order('ad'),
        admin.from('lokasyon_grup_uyeleri').select('grup_id,lokasyon_id'),
        admin.from('lokasyonlar').select('id,firma_id,parent_id,tanim,aktif,kayit_tarihi').eq('firma_id', firmaId).eq('proje_id', aktifProje.id).order('kayit_tarihi', { ascending: true }),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }, { data: [] as any[] }]

  const initialGroups = (groupsRes.data ?? []).map((g: any) => ({
    ...g,
    lokasyonIds: (membersRes.data ?? []).filter((m: any) => m.grup_id === g.id).map((m: any) => m.lokasyon_id),
  }))

  // Oto Yıkama modülü şu an SA-only — TA için bu lokasyonları gizle
  let filteredLocations = (locationsRes.data ?? []) as any[]
  if (firmaId) {
    const otoIds = await getOtoYikamaLokasyonIds(admin, firmaId)
    if (otoIds.size > 0) filteredLocations = filteredLocations.filter(l => !otoIds.has(l.id))
  }

  return (
    <div>
      <Topbar title="Lokasyon Gruplari" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: aktifProje.ad }, { label: 'Lokasyon Gruplari' }]} />
      <LokasyonGruplariClient
        base="/ta"
        initialFirmaId={firmaId}
        initialGroups={initialGroups as any}
        initialLocations={filteredLocations as any}
        projeId={aktifProje.id}
      />
    </div>
  )
}
