import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import KullanicilarClient from '@/components/users/KullanicilarClient'
import { redirect } from 'next/navigation'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'

export default async function UKullanicilarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me) redirect('/login')

  // Yetki kontrolü — görüntüleme kapalıysa dashboard'a yönlendir
  const gorebilir = await sayfaGorebilirMi(me.rol, 'kullanicilar')
  if (!gorebilir) redirect('/u/dashboard')

  const firmaId = me.firma_id
  const projeId = me.proje_id  // U ve Musteri sadece kendi projesini görür

  // Projeye ait kullanıcıları göster (admin + tenant_user)
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
