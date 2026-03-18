import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import FirmaAdminleriClient from '@/components/users/FirmaAdminleriClient'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SAFirmaAdminleriPage() {
  const supabase = createClient()
  const firmaId = getAktifFirmaId()

  // Adminler (tenant_admin) projeye bağlı değil — sadece firma filtresi
  const { data: users } = firmaId
    ? await supabase
        .from('users')
        .select('*')
        .eq('firma_id', firmaId)
        .eq('rol', 'tenant_admin')
        .order('kayit_tarihi', { ascending: false })
    : { data: [] as any[] }

  return (
    <div>
      <Topbar title="Firma Adminleri" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Firma Adminleri' }]} />
      <FirmaAdminleriClient initialFirmaId={firmaId} initialUsers={(users as any) ?? []} />
    </div>
  )
}
