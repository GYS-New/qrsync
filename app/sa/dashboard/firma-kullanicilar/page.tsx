import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import FirmaKullanicilariClient from '@/components/users/FirmaKullanicilariClient'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SAFirmaKullanicilarPage() {
  const supabase = createClient()
  const firmaId = getAktifFirmaId()
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null
  const projeId = aktifProje?.id ?? null

  let q = firmaId
    ? supabase.from('users').select('*').eq('firma_id', firmaId).eq('rol', 'tenant_user').order('kayit_tarihi', { ascending: false })
    : null
  if (q && projeId) q = (q as any).eq('proje_id', projeId)

  const { data: users } = q ? await q : { data: [] as any[] }

  return (
    <div>
      <Topbar title="Firma Kullanıcıları" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Firma Kullanıcıları' }]} />
      <FirmaKullanicilariClient initialFirmaId={firmaId} initialUsers={(users as any) ?? []} />
    </div>
  )
}
