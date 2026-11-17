import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ReportsClient from '@/components/reports/ReportsClient'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function SARaporlarHamVeriPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/sa/dashboard')

  // SA aktif firma cookie'den (qrsync_sa_firma_id), aktif proje de cookie'den
  // (qrsync_aktif_proje_id via getAktifProje). TA pattern'iyle ayni — projeId
  // prop olarak ReportsClient'a gecirilir ki export filtresi dogru uygulansin.
  // Topbar'da firma/proje degisince FirmaProvider/ProjeProvider router.refresh()
  // tetikler, bu SSR yeni cookie'lerle yeniden calisir.
  const firmaId = getAktifFirmaId()
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null
  const projeId = aktifProje?.id ?? null

  return <ReportsClient base="/sa" title="Ham Veri Raporları" isSA projeId={projeId} />
}
