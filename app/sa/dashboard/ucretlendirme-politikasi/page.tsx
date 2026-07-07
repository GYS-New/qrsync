import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import UcretlendirmePolitikasiClient from '@/components/ucretlendirme-politikasi/UcretlendirmePolitikasiClient'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'

export const dynamic = 'force-dynamic'

export default async function SAUcretlendirmePolitikasiPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) {
    redirect('/sa/dashboard')
  }

  // Sekme 2 (Firma Analizi) icin Topbar firma switcher'i aktif — SA farkli
  // firmalar arasinda gecebilsin. Aktif firma_id cookie'den alinir.
  const firmaId = getAktifFirmaId()

  return (
    <div>
      <Topbar
        title="GYS Ücretlendirme Politikası"
        base="/sa"
        hideNotifBar
        breadcrumbs={[{ label: 'Sistem' }, { label: 'Ücretlendirme Politikası' }]}
      />
      <div style={{ padding: '24px 28px' }}>
        <UcretlendirmePolitikasiClient firmaId={firmaId} />
      </div>
    </div>
  )
}
