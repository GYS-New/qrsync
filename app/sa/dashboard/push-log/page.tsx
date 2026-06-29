import { createClient, createAdminClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import PushLogClient from '@/components/push/PushLogClient'
import { redirect } from 'next/navigation'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'

export default async function SAPushLogPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/login')

  // Tüm firmaları çek (SA filtre seçici için)
  const admin = createAdminClient()
  const { data: firmalar } = await admin
    .from('firmalar')
    .select('id, firma_adi, ticari_unvan')
    .eq('aktif', true)
    .order('firma_adi')

  const aktifFirmaId = getAktifFirmaId()
  const aktifProje = aktifFirmaId ? await getAktifProje(aktifFirmaId) : null
  const projeId = aktifProje?.id ?? null

  return (
    <div>
      <Topbar title="Push Bildirim Geçmişi" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Push Bildirim Geçmişi' }]} />
      <PushLogClient
        firmaId={aktifFirmaId}
        projeId={projeId}
        canDelete={true}
        isSA={true}
        firmalarListesi={firmalar ?? []}
      />
    </div>
  )
}
