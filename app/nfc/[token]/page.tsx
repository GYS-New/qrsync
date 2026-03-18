import { createClient } from '@/lib/supabase/server'
import ChecklistScanClient from '@/components/checklist/ChecklistScanClient'
import DegerlendirmeClient from '@/components/degerlendirme/DegerlendirmeClient'

export default async function NfcTokenPage({ params }: { params: { token: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    return (
      <div style={{ padding: '28px' }}>
        <ChecklistScanClient kanal="NFC" token={params.token} />
      </div>
    )
  }

  return <DegerlendirmeClient token={params.token} />
}
