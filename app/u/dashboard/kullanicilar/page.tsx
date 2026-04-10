import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import KullanicilarClient from '@/components/users/KullanicilarClient'
import { redirect } from 'next/navigation'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'
import { getLokasyonYetki } from '@/lib/yetki/getLokasyonYetki'

export const dynamic = 'force-dynamic'

export default async function UKullanicilarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me) redirect('/login')

  // Yetki kontrolü
  const yetki = await sayfaYetkileri(me.rol, 'kullanicilar', (me as any).firma_id ?? null)
  if (!yetki.gorebilir) redirect('/u/dashboard')

  const firmaId = me.firma_id
  const projeId = me.proje_id

  // U/M lokasyon kısıtlaması
  const yetkiliUstLokIds = await getLokasyonYetki(supabase)

  let q = supabase.from('users').select('*').eq('firma_id', firmaId).order('isim_soyisim')
  if (projeId) q = (q as any).or(`proje_id.eq.${projeId},rol.eq.tenant_admin`)

  const { data: users } = await q

  let lokQ = supabase.from('lokasyonlar').select('id,tanim').eq('firma_id', firmaId).is('parent_id', null).eq('aktif', true).order('tanim')
  if (projeId) lokQ = (lokQ as any).eq('proje_id', projeId)
  if (yetkiliUstLokIds) lokQ = lokQ.in('id', yetkiliUstLokIds)
  const { data: lokasyonlar } = await lokQ

  return (
    <div>
      <Topbar title="Kullanıcılar" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Kullanıcılar' }]} />
      <KullanicilarClient
        base="/u"
        firmaId={firmaId}
        initialUsers={(users as any) ?? []}
        canCreate={yetki.ekleyebilir}
        canManage={yetki.duzenleyebilir}
        canDelete={yetki.silebilir}
        projeId={projeId ?? undefined}
        ustLokasyonlar={(lokasyonlar as any) ?? []}
      />
    </div>
  )
}
