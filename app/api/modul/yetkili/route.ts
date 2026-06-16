import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getYetkiliModuller } from '@/lib/modul/yetkiliModuller'

export const dynamic = 'force-dynamic'

/**
 * GET /api/modul/yetkili
 *
 * Mevcut kullanıcının yetkili+aktif modül listesini ve sayısını döner.
 * UserPanel "Modül Değiştir" butonunu sadece çoklu modül senaryosunda
 * göstermek için kullanılır.
 */
export async function GET() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('id, rol, firma_id').eq('id', authUser.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const yetkili = await getYetkiliModuller(me.rol, me.firma_id ?? null, me.id)
  const aktifSayi = yetkili.moduller.filter(m => m.aktif).length

  return NextResponse.json({
    ok: true,
    moduller: yetkili.moduller,
    aktif_sayi: aktifSayi,
  })
}
