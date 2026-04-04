/**
 * PATCH /api/lokasyonlar/sure
 * Bir lokasyonun min_sure_dakika ve max_sure_dakika alanlarını günceller.
 * Sadece SA, alt_super_admin ve tenant_admin yetkilidir.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest) {
  try {
    const supabase = createClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return NextResponse.json({ error: 'Oturum bulunamadı' }, { status: 401 })

    const { data: me } = await supabase
      .from('users')
      .select('rol, firma_id')
      .eq('id', authUser.id)
      .single()

    if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol)) {
      return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 403 })
    }

    const body = await req.json()
    const { id, min_sure_dakika, max_sure_dakika, hedef_sure_dakika } = body

    if (!id) return NextResponse.json({ error: 'Lokasyon ID gerekli' }, { status: 400 })

    // Lokasyonun bu kullanıcının firmasına ait olduğunu doğrula
    const { data: lok } = await supabase
      .from('lokasyonlar')
      .select('id, firma_id')
      .eq('id', id)
      .single()

    if (!lok) return NextResponse.json({ error: 'Lokasyon bulunamadı' }, { status: 404 })

    // TA için firma kontrolü (SA hepsini görebilir)
    if (me.rol === 'tenant_admin' && lok.firma_id !== me.firma_id) {
      return NextResponse.json({ error: 'Bu lokasyona erişim yetkiniz yok' }, { status: 403 })
    }

    const toInt = (v: any) => (v === '' || v === undefined || v === null) ? null : Number(v)
    const minVal    = toInt(min_sure_dakika)
    const maxVal    = toInt(max_sure_dakika)
    const hedefVal  = toInt(hedef_sure_dakika)

    const { error } = await supabase
      .from('lokasyonlar')
      .update({
        min_sure_dakika:   minVal   != null && !isNaN(minVal)   ? minVal   : null,
        max_sure_dakika:   maxVal   != null && !isNaN(maxVal)   ? maxVal   : null,
        hedef_sure_dakika: hedefVal != null && !isNaN(hedefVal) ? hedefVal : null,
      })
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[lokasyonlar/sure]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
