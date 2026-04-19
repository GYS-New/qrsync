import { createClient } from '@/lib/supabase/server'
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

  const firmaId = getAktifFirmaId()
  if (!firmaId) {
    return (
      <div>
        <Topbar title="Push Bildirim Geçmişi" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Push Bildirim Geçmişi' }]} />
        <div style={{ padding: '24px 28px' }}>
          <div className="verde-card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 700, color: '#111827', marginBottom: 6 }}>Firma seçimi gerekli</div>
            <div style={{ color: '#6b7280', fontSize: 12.5 }}>Süper Admin olarak push bildirim geçmişini görüntülemek için üstteki listeden bir firma seçin.</div>
          </div>
        </div>
      </div>
    )
  }

  const aktifProje = await getAktifProje(firmaId)
  const projeId = aktifProje?.id ?? null

  return (
    <div>
      <Topbar title="Push Bildirim Geçmişi" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Push Bildirim Geçmişi' }]} />
      <PushLogClient firmaId={firmaId} projeId={projeId} />
    </div>
  )
}
