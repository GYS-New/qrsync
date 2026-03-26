import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// GET /api/profile/device-token — kullanıcının kendi cihaz eşleşme bilgisi
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('device_tokens')
    .select('device_id, aktif, son_kullanim')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, data: data ?? null })
}

// DELETE /api/profile/device-token — kullanıcının kendi cihaz eşleşmesini sil
export async function DELETE() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('device_tokens')
    .delete()
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
