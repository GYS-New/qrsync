import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import KullanicilarClient from '@/components/users/KullanicilarClient'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function UKullanicilarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me) redirect('/login')

  const firmaId = me.firma_id
  const projeId = me.proje_id  // U sadece kendi projesini görür

  // U projesine ait tüm kullanıcıları göster (admin + user)
  let q = supabase.from('users').select('*').eq('firma_id', firmaId).order('isim_soyisim')
  if (projeId) q = (q as any).or(`proje_id.eq.${projeId},rol.eq.tenant_admin`)

  const { data: users } = await q

  return (
    <div>
      <Topbar title="Kullanıcılar" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Kullanıcılar' }]} />
      <KullanicilarClient
        base="/u"
        firmaId={firmaId}
        initialUsers={(users as any) ?? []}
        canCreate={false}
        canManage={false}
      />
    </div>
  )
}
