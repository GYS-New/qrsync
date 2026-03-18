import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import ChecklistSablonlariClient from '@/components/checklist/ChecklistSablonlariClient'
import { redirect } from 'next/navigation'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'

export default async function SAChecklistSablonlariPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('rol').eq('id', authUser.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) redirect('/login')

  const firmaId = getAktifFirmaId()
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null
  const projeId = aktifProje?.id ?? null

  let q = firmaId
    ? supabase.from('checklist_sablonlari').select('*').eq('firma_id', firmaId).order('guncelleme_tarihi', { ascending: false })
    : null
  if (q && projeId) q = (q as any).eq('proje_id', projeId)

  const { data: sablonlar } = q ? await q : { data: [] as any[] }

  return (
    <div>
      <Topbar title="Checklist Şablonları" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Checklist Şablonları' }]} />
      <ChecklistSablonlariClient
        base="/sa"
        initialFirmaId={firmaId}
        projeId={projeId}
        initialSablonlar={(sablonlar as any) ?? []}
        readonly={false}
      />
    </div>
  )
}
