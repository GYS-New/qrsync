import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import ChecklistSablonlariClient from '@/components/checklist/ChecklistSablonlariClient'
import { redirect } from 'next/navigation'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'

export default async function TAChecklistSablonlariPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', authUser.id).single()
  const firmaId = me?.firma_id

  const aktifProje = await getAktifProje(firmaId ?? null)
  if (!aktifProje) return (
    <div>
      <Topbar title="Checklist Sablonlari" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: 'Checklist Sablonlari' }]} />
      <ProjeSecilmedi />
    </div>
  )

  const { data: sablonlar } = await supabase
    .from('checklist_sablonlari')
    .select('*')
    .eq('firma_id', firmaId)
    .eq('proje_id', aktifProje.id)
    .order('guncelleme_tarihi', { ascending: false })

  return (
    <div>
      <Topbar title="Checklist Sablonlari" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: aktifProje.ad }, { label: 'Checklist Sablonlari' }]} />
      <ChecklistSablonlariClient
        base="/ta"
        initialFirmaId={firmaId}
        initialSablonlar={(sablonlar as any) ?? []}
        readonly={me?.rol !== 'tenant_admin'}
        projeId={aktifProje.id}
      />
    </div>
  )
}
