import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import UcretlendirmePolitikasiClient from '@/components/ucretlendirme-politikasi/UcretlendirmePolitikasiClient'

export const dynamic = 'force-dynamic'

export default async function TAUcretlendirmePolitikasiPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') {
    redirect('/ta/dashboard')
  }

  // TA yalnizca kendi firmasinin analizini gorur — firma switcher yok.
  const firmaId = me.firma_id ?? null

  return (
    <div>
      <Topbar
        title="GYS Ücretlendirme Politikası"
        base="/ta"
        hideScopeControls
        hideNotifBar
        breadcrumbs={[{ label: 'Sistem' }, { label: 'Ücretlendirme Politikası' }]}
      />
      <div style={{ padding: '24px 28px' }}>
        <UcretlendirmePolitikasiClient firmaId={firmaId} />
      </div>
    </div>
  )
}
