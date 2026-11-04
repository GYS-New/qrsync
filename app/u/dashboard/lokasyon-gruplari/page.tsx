import { redirect } from 'next/navigation'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import LokasyonGruplariClient from '@/components/lokasyon-grup/LokasyonGruplariClient'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'
import { getLokasyonYetki, getYetkiliLokasyonIds } from '@/lib/yetki/getLokasyonYetki'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

export const dynamic = 'force-dynamic'

export default async function ULokasyonGruplariPage() {
  const supabase = createClient()
  const admin = createAdminClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'tenant_user' && me.rol !== 'musteri')) redirect('/u/dashboard')

  const yetki = await sayfaYetkileri(me.rol, 'lokasyon-gruplari', me.firma_id ?? null)
  if (!yetki.gorebilir) redirect('/u/dashboard')

  const readonly = !yetki.ekleyebilir && !yetki.duzenleyebilir && !yetki.silebilir

  const firmaId = me.firma_id ?? null
  const projeId = me.proje_id ?? null

  if (!firmaId) redirect('/u/dashboard')

  // Yetkili lokasyon kısıtlaması
  const yetkiliUstLokIds = await getLokasyonYetki(supabase)
  const yetkiliLokIds = await getYetkiliLokasyonIds(supabase, firmaId, projeId)

  // CHUNK-AWARE helpers: musteri yetkiliLokIds binlerce UUID -> URL overflow -> fetch failed.
  const buildGroupQ = (slice: string[] | null) => {
    let q = admin.from('lokasyon_gruplari')
      .select('id,firma_id,ad,aciklama,aktif,kayit_tarihi,guncelleme_tarihi,kayit_yapan_id,ust_lokasyon_id')
      .eq('firma_id', firmaId).order('ad')
    if (projeId) q = (q as any).eq('proje_id', projeId)
    if (slice) q = q.in('ust_lokasyon_id', slice)
    return q
  }
  const buildLocQ = (slice: string[] | null) => {
    let q = admin.from('lokasyonlar')
      .select('id,firma_id,parent_id,tanim,aktif,kayit_tarihi')
      .eq('firma_id', firmaId).eq('aktif', true).order('kayit_tarihi', { ascending: true })
    if (projeId) q = (q as any).eq('proje_id', projeId)
    if (slice) q = q.in('id', slice)
    return q
  }

  async function chunkedFetch<T = any>(ids: string[] | null, build: (slice: string[] | null) => any): Promise<T[]> {
    if (!ids) { const { data } = await build(null); return (data ?? []) as T[] }
    if (ids.length === 0) return []
    const seen = new Set<string>()
    const out: T[] = []
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await build(ids.slice(i, i + 100))
      for (const r of (data ?? [])) {
        if ((r as any)?.id && !seen.has((r as any).id)) { seen.add((r as any).id); out.push(r) }
      }
    }
    return out
  }

  const [groups, membersRes, locationsRaw] = await Promise.all([
    chunkedFetch<any>(yetkiliUstLokIds, buildGroupQ),
    admin.from('lokasyon_grup_uyeleri').select('grup_id,lokasyon_id'),
    chunkedFetch<any>(yetkiliLokIds, buildLocQ),
  ])

  let locations = locationsRaw

  // Oto Yıkama modülü şu an SA-only — U/M için bu lokasyonları gizle
  const otoIds = await getOtoYikamaLokasyonIds(admin, firmaId)
  if (otoIds.size > 0) locations = locations.filter((l: any) => !otoIds.has(l.id))

  const initialGroups = groups.map((g: any) => ({
    ...g,
    lokasyonIds: (membersRes.data ?? []).filter((m: any) => m.grup_id === g.id).map((m: any) => m.lokasyon_id),
  }))

  return (
    <div>
      <Topbar title="Lokasyon Grupları" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Lokasyon Grupları' }]} />
      <LokasyonGruplariClient
        base="/u"
        initialFirmaId={firmaId}
        initialGroups={initialGroups as any}
        initialLocations={locations as any}
        projeId={projeId}
        readonly={readonly}
      />
    </div>
  )
}
