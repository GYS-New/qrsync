import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PersonelTakibiClient from '@/components/personel-takibi/PersonelTakibiClient'
import { sayfaGorebilirMi } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'

export default async function UPersonelTakibiPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase
    .from('users')
    .select('id,rol,firma_id,proje_id')
    .eq('id', authUser.id)
    .single()
  if (!me || (me.rol !== 'tenant_user' && me.rol !== 'musteri')) redirect('/login')

  const gorebilir = await sayfaGorebilirMi(me.rol, 'personel-takibi')
  if (!gorebilir) redirect('/u/dashboard')

  return (
    <PersonelTakibiClient
      base="/u"
      isSA={false}
      initialFirmaId={me.firma_id ?? null}
      initialProjeId={me.proje_id ?? null}
      readonly={true}
    />
  )
}
