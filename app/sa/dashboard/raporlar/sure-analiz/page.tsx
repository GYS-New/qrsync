import { redirect } from 'next/navigation'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import SureAnalizClient from '@/components/reports/SureAnalizClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SASureAnalizPage() {
  const supabase = createClient()
  const admin = createAdminClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')
  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/sa/dashboard')
  const firmaId = getAktifFirmaId()
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null
    // Projede süreli görev aktif mi? (herhangi bir lokasyonda açıksa aktif)
  let sureliGorevAktif = false
  if (aktifProje) {
    const { data: loks } = await admin
      .from('lokasyonlar')
      .select('sureli_gorev_aktif')
      .eq('proje_id', aktifProje.id)
      .eq('sureli_gorev_aktif', true)
      .limit(1)
    sureliGorevAktif = (loks?.length ?? 0) > 0
  }

return <SureAnalizClient base="/sa" isSA projeId={aktifProje?.id ?? null} sureliGorevAktif={sureliGorevAktif} />
}
