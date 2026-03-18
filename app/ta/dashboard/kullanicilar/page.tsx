import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import KullanicilarClient from '@/components/users/KullanicilarClient'
import { redirect } from 'next/navigation'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'

export default async function TAKullanicilarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  const firmaId = me?.firma_id

  const aktifProje = await getAktifProje(firmaId ?? null)
  if (!aktifProje) return (
    <div>
      <Topbar title="Kullanicilar" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: 'Kullanicilar' }]} />
      <ProjeSecilmedi />
    </div>
  )

  // Sadece aktif projeye bağlı tenant_user'ları göster
  const { data: users } = await supabase
    .from('users')
    .select('*')
    .eq('firma_id', firmaId)
    .eq('rol', 'tenant_user')
    .eq('proje_id', aktifProje.id)
    .order('kayit_tarihi', { ascending: false })

  return (
    <div>
      <Topbar title="Kullanicilar" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: aktifProje.ad }, { label: 'Kullanicilar' }]} />
      <KullanicilarClient
        base="/ta"
        firmaId={firmaId}
        initialUsers={(users as any) ?? []}
        canCreate={me?.rol === 'tenant_admin'}
        canManage={me?.rol === 'tenant_admin'}
        enableBulkImport={me?.rol === 'tenant_admin'}
        projeId={aktifProje.id}
      />
    </div>
  )
}
