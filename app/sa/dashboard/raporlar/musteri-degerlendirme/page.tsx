import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MusteriDegerlendirmeRaporClient from '@/components/reports/MusteriDegerlendirmeRaporClient'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'

export default async function SAMusteriDegerlendirmePage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')
  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/sa/dashboard')

  // alt_super_admin için yetki kontrolü (super_admin her zaman görebilir)
  const gorebilir = await sayfaGorebilirMi(me.rol, 'musteri-degerlendirme')
  if (!gorebilir) redirect('/sa/dashboard/raporlar')

  return <MusteriDegerlendirmeRaporClient base="/sa" isSA />
}
