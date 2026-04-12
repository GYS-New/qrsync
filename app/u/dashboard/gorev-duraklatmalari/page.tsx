import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import GorevDuraklatmalariClient from '@/components/gorev-kurallari/GorevDuraklatmalariClient'
import { redirect } from 'next/navigation'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'

export default async function UGorevDuraklatmalariPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase
    .from('users')
    .select('id,rol,firma_id,proje_id')
    .eq('id', authUser.id)
    .single()
  if (!me) redirect('/login')

  const firmaId = me.firma_id
  const projeId = me.proje_id

  // Yetki kontrolü
  const yetki = await sayfaYetkileri(me.rol, 'gorev-duraklatmalari', firmaId ?? null)
  if (!yetki.gorebilir) redirect('/u/dashboard')

  return (
    <div>
      <Topbar
        title="Görev Duraklatmaları"
        base="/u"
        breadcrumbs={[{ label: 'Görev Duraklatmaları' }]}
      />
      <div style={{ padding: '24px 28px' }}>
        <GorevDuraklatmalariClient firmaId={firmaId!} projeId={projeId ?? null} ekleyebilir={yetki.ekleyebilir} silebilir={yetki.silebilir} />
      </div>
    </div>
  )
}
