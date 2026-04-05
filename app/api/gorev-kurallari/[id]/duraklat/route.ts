import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const action = body.action // 'duraklat' | 'devam'
  const admin = createAdminClient()

  if (action === 'devam') {
    // Duraklatmayı kaldır
    await admin.from('gorev_kurallari').update({ duraklatma_bitis: null, duraklatma_neden: null }).eq('id', params.id)
    return NextResponse.json({ ok: true, message: 'Görev kuralı devam ediyor.' })
  }

  // Duraklat
  const saat = Number(body.saat)
  if (!saat || saat < 1 || saat > 720) return NextResponse.json({ error: 'Süre 1-720 saat arasında olmalı' }, { status: 400 })

  const bitis = new Date(Date.now() + saat * 3600000).toISOString()
  const neden = body.neden || null

  await admin.from('gorev_kurallari').update({ duraklatma_bitis: bitis, duraklatma_neden: neden }).eq('id', params.id)

  return NextResponse.json({ ok: true, duraklatma_bitis: bitis, message: `Görev kuralı ${saat} saatliğine duraklatıldı.` })
}
