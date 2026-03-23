import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(
  _: Request,
  { params }: { params: { id: string } }
) {
  const admin = createAdminClient()
  const projeId = params.id

  // Projeye ait lokasyonların mevcut sureli_gorev_aktif durumlarını çek
  const { data: loks, error: fetchErr } = await admin
    .from('lokasyonlar')
    .select('id, sureli_gorev_aktif')
    .eq('proje_id', projeId)

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!loks?.length) return NextResponse.json({ message: 'Bu projeye ait lokasyon bulunamadı.' })

  // Herhangi biri kapalıysa tümünü aç, hepsi açıksa tümünü kapat
  const enableAll = loks.some(l => !(l as any).sureli_gorev_aktif)

  const { error: updateErr } = await admin
    .from('lokasyonlar')
    .update({ sureli_gorev_aktif: enableAll })
    .eq('proje_id', projeId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    message: enableAll
      ? `${loks.length} lokasyonda süreli görev açıldı.`
      : `${loks.length} lokasyonda süreli görev kapatıldı.`,
  })
}
