
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {

  const supabase = createClient()

  const body = await req.json()
  const { user_id, proje_id, tip } = body

  const today = new Date().toISOString().split('T')[0]

  const { data: kayit } = await supabase
    .from('personel_mesai_kayitlari')
    .select('*')
    .eq('user_id', user_id)
    .eq('proje_id', proje_id)
    .eq('kayit_tarihi', today)
    .is('cikis_saati', null)
    .maybeSingle()

  if(!kayit){

    await supabase.from('personel_mesai_kayitlari').insert({
      user_id,
      proje_id,
      giris_saati: new Date(),
      giris_tipi: tip
    })

    return NextResponse.json({ status:'giris' })
  }

  await supabase
    .from('personel_mesai_kayitlari')
    .update({
      cikis_saati: new Date(),
      cikis_tipi: tip
    })
    .eq('id', kayit.id)

  return NextResponse.json({ status:'cikis' })
}
