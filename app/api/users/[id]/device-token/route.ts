import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function DELETE(
  _: Request,
  { params }: { params: { id: string } }
) {
  const admin = createAdminClient()

  const { error } = await admin
    .from('device_tokens')
    .delete()
    .eq('user_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
