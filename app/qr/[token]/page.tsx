import { createClient } from '@/lib/supabase/server'
import ChecklistScanClient from '@/components/checklist/ChecklistScanClient'
import DegerlendirmeClient from '@/components/degerlendirme/DegerlendirmeClient'

export default async function QrTokenPage({ params }: { params: { token: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Oturum açık → mevcut görev akışı
  if (user) {
    return (
      <div style={{ padding: '28px' }}>
        <ChecklistScanClient kanal="QR" token={params.token} />
      </div>
    )
  }

  // Oturum yok → anonim müşteri değerlendirme sayfası
  return <DegerlendirmeClient token={params.token} />
}
