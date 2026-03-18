import { createClient, createAdminClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import ArsivClient from '@/components/arsiv/ArsivClient'
import { redirect } from 'next/navigation'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'

export default async function SAArsivPage() {
  const supabase = createClient()
  const admin = createAdminClient()

  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('*').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/login')

  const firmaId = getAktifFirmaId()
  const cookieProje = await getAktifProje(firmaId)
  const projeId = cookieProje?.id ?? null

  // Arşiv kayıtlarını getir
  const sel = `
    *,
    lokasyonlar(id, tanim),
    atanan:users!atanan_kullanici_id(isim_soyisim),
    olusturan:users!olusturan_id(isim_soyisim),
    tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim),
    iptalEden:users!iptal_eden_id(isim_soyisim),
    islemi_yapan:users!islemi_yapan_id(isim_soyisim),
    kural:gorev_kurallari!arsiv_kural_fkey(tanim)
  `

  let arsivQuery = admin
    .from('canli_gorevler_arsiv')
    .select(sel)
    .order('arsiv_tarihi', { ascending: false })
    .limit(1000)

  if (firmaId) arsivQuery = arsivQuery.eq('firma_id', firmaId)
  if (projeId) arsivQuery = arsivQuery.eq('proje_id', projeId)

  const { data: arsiv } = await arsivQuery

  return (
    <div>
      <Topbar
        title="Arşiv"
        base="/sa"
        breadcrumbs={[
          { label: 'Yönetim' },
          { label: 'Frekansiyel Görevler' },
          { label: 'Arşiv' },
        ]}
      />
      <ArsivClient base="/sa" initialArsiv={(arsiv as any) ?? []} />
    </div>
  )
}
