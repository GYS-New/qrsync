import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import FirmaAyarlarClient from '@/components/firmalar/FirmaAyarlarClient'
import { redirect } from 'next/navigation'

export default async function FirmaAyarlarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('*').eq('id', authUser.id).single()
  const firmaId = (me as any)?.firma_id
  const { data: firma } = firmaId ? await supabase.from('firmalar').select('*').eq('id', firmaId).single() : { data: null }

  return (
    <div>
      <Topbar title="Firma Ayarları" base="/ta" breadcrumbs={[{ label: 'Sistem' }, { label: 'Firma Ayarları' }]} />
      <div style={{ padding: '24px 28px' }}>
        {firma ? <FirmaAyarlarClient firma={firma as any} /> : <div className="verde-card" style={{ padding: 18 }}>Firma bulunamadı.</div>}
      </div>
    </div>
  )
}
