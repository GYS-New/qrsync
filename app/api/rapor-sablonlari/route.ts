import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - Rapor şablonlarını listele
export async function GET(request: NextRequest) {
  const supabase = createClient()
  const { searchParams } = new URL(request.url)

  try {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const { data: me, error: meError } = await supabase
      .from('users')
      .select('id, rol, firma_id')
      .eq('id', user.id)
      .single()

    if (meError || !me) {
      return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })
    }

    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const firmaId = me.firma_id
    const projeId = searchParams.get('proje_id')

    let query = supabase
      .from('rapor_sablonlari')
      .select('*')
      .eq('aktif', true)
      .order('varsayilan', { ascending: false })
      .order('kayit_tarihi', { ascending: true })

    // SA tüm şablonları görür, diğerleri kendi şablonlarını görür
    if (!isSA) {
      if (projeId) {
        // Proje seçili ise: o projeye özel şablonlar + genel şablonlar
        query = query.or(`proje_id.eq.${projeId},proje_id.is.null,firma_id.is.null`)
      } else if (firmaId) {
        // Proje seçili değilse: firma genel şablonlar + genel şablonlar
        query = query.or(`firma_id.eq.${firmaId},firma_id.is.null,proje_id.is.null`)
      } else {
        query = query.is('firma_id', null).is('proje_id', null)
      }
    }

    const { data, error } = await query

    if (error) {
      console.error('Rapor şablonları API hatası:', error)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ 
      ok: true, 
      data: data || [],
      debug: {
        isSA,
        firmaId,
        projeId,
        count: data?.length || 0,
        query: isSA ? 'all templates' : (projeId ? `project + global templates` : (firmaId ? `firm + global templates` : 'global only'))
      }
    })
  } catch (error) {
    console.error('API genel hata:', error)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}

// POST - Yeni rapor şablonu ekle
export async function POST(request: NextRequest) {
  const supabase = createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const { data: me, error: meError } = await supabase
    .from('users')
    .select('id, rol, firma_id')
    .eq('id', user.id)
    .single()

  if (meError || !me) {
    return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })
  }

  const body = await request.json()
  const { ad, aciklama, icerik, projeId } = body

  if (!ad || !icerik) {
    return NextResponse.json({ ok: false, error: 'ad ve icerik zorunludur' }, { status: 400 })
  }

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const firmaId = me.firma_id

  const insertData: any = {
    ad,
    aciklama,
    icerik,
    olusturan_id: me.id,
    guncelleyen_id: me.id,
    varsayilan: false, // Yeni şablonlar varsayılan olamaz
  }

  // SA için firma_id null olabilir, diğerleri için zorunlu
  if (!isSA) {
    insertData.firma_id = firmaId
    if (projeId) {
      insertData.proje_id = projeId
    }
  }

  const { data, error } = await supabase
    .from('rapor_sablonlari')
    .insert(insertData)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, data })
}
