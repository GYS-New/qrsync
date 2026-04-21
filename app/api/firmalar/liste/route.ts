import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json([], { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) {
    return NextResponse.json([], { status: 403 })
  }

  const { data, error } = await supabase
    .from('firmalar')
    .select('id, firma_adi, ticari_unvan, birim_fiyat_aktif, rapor_ozellestir_aktif, manuel_push_aktif, manuel_push_u_rolu, manuel_push_m_rolu')
    .eq('aktif', true)
    .order('firma_adi')

  if (error) return NextResponse.json([], { status: 500 })
  return NextResponse.json(data ?? [])
}
