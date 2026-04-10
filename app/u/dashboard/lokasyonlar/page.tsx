import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import LokasyonlarClient from '@/components/lokasyon/LokasyonlarClient'
import { redirect } from 'next/navigation'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'
import { getYetkiliLokasyonIds } from '@/lib/yetki/getLokasyonYetki'

export const dynamic = 'force-dynamic'

export default async function ULokasyonlarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me) redirect('/login')
  const firmaId = me.firma_id
  const projeId = me.proje_id

  const yetki = await sayfaYetkileri(me.rol, 'lokasyonlar', firmaId ?? null)
  if (!yetki.gorebilir) redirect('/u/dashboard')

  // Yetkili lokasyon kısıtlaması
  const yetkiliLokIds = firmaId ? await getYetkiliLokasyonIds(supabase, firmaId, projeId) : null

  let q = supabase
    .from('lokasyonlar')
    .select('*')
    .eq('firma_id', firmaId)
    .order('kayit_tarihi', { ascending: true })

  if (projeId) q = (q as any).eq('proje_id', projeId)
  if (yetkiliLokIds) q = q.in('id', yetkiliLokIds)

  const { data: lokasyonlar } = await q

  const readonly = !yetki.duzenleyebilir && !yetki.ekleyebilir

  return (
    <div>
      <Topbar title="Lokasyonlar" base="/u" breadcrumbs={[{ label:'Yönetim' }, { label:'Lokasyonlar' }]} />
      <LokasyonlarClient
        base="/u"
        initialFirmaId={firmaId}
        initialLokasyonlar={(lokasyonlar as any) ?? []}
        readonly={readonly}
        projeId={projeId ?? undefined}
        yetkiliLokIds={yetkiliLokIds}
      />
    </div>
  )
}
