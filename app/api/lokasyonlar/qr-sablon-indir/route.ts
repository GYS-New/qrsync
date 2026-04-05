import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { buildQrKartZip, type QrKartAyarlar } from '@/lib/qr-kart/qr-kart-node'

export const dynamic    = 'force-dynamic'
export const runtime    = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const admin    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return NextResponse.json({ error: 'Yetki yetersiz' }, { status: 403 })

  const form          = await req.formData()
  const sablonFile    = form.get('sablon') as File | null
  const firmaId       = form.get('firma_id') as string | null
  const projeId       = form.get('proje_id') as string | null
  const ustLokasyonId = form.get('ust_lokasyon_id') as string | null
  let origin = form.get('origin') as string | null
  if (!origin) {
    try {
      const { getSistemKonfig } = await import('@/lib/config/getSistemKonfig')
      const konfig = await getSistemKonfig()
      origin = `https://${konfig.uygulama_domain}`
    } catch { origin = 'https://app.qrsync.com' }
  }
  const ayarlarRaw    = form.get('ayarlar') as string | null

  if (!sablonFile) return NextResponse.json({ error: 'Şablon dosyası zorunlu (sablon)' }, { status: 400 })

  const effectiveFirmaId = isSA ? firmaId : me.firma_id
  if (!effectiveFirmaId) return NextResponse.json({ error: 'firma_id zorunlu' }, { status: 400 })
  if (isTA && firmaId && firmaId !== me.firma_id) return NextResponse.json({ error: 'Yetkisiz firma' }, { status: 403 })

  let ayarlar: QrKartAyarlar = {}
  if (ayarlarRaw) {
    try { ayarlar = JSON.parse(ayarlarRaw) } catch { /* varsayılan */ }
  }

  const sablonBuffer = Buffer.from(await sablonFile.arrayBuffer())
  const sablonExt    = sablonFile.name.split('.').pop()?.toLowerCase() ?? 'png'

  let lokQuery = admin
    .from('lokasyonlar')
    .select('id,tanim,qr_veri,parent_id,aktif')
    .eq('firma_id', effectiveFirmaId)
    .order('tanim')
  if (projeId) lokQuery = (lokQuery as any).eq('proje_id', projeId)

  const { data: tumLokasyonlar, error } = await lokQuery
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  function getAllDescendantIds(rootId: string): string[] {
    const result = [rootId]
    const children = (tumLokasyonlar ?? []).filter((l: any) => l.parent_id === rootId)
    for (const c of children) result.push(...getAllDescendantIds(c.id))
    return result
  }

  let lokasyonlar = (tumLokasyonlar ?? []).filter((l: any) => l.aktif && l.qr_veri)
  if (ustLokasyonId) {
    const altIds = new Set(getAllDescendantIds(ustLokasyonId))
    altIds.delete(ustLokasyonId)
    lokasyonlar = lokasyonlar.filter((l: any) => altIds.has(l.id))
  }
  if (!lokasyonlar.length) return NextResponse.json({ error: 'QR kodu olan aktif lokasyon bulunamadı' }, { status: 404 })

  const zipBuffer = await buildQrKartZip(
    {
      lokasyonlar: lokasyonlar.map((l: any) => ({
        id:     l.id,
        tanim:  l.tanim,
        qr_url: `${origin}/qr/${l.qr_veri}`,
      })),
      ayarlar,
    },
    sablonBuffer,
  )

  return new NextResponse(zipBuffer as unknown as BodyInit, {
    headers: {
      'content-type':        'application/zip',
      'content-disposition': `attachment; filename="qr-kartlar-sablon-${new Date().toISOString().slice(0, 10)}.zip"`,
      'content-length':      zipBuffer.byteLength.toString(),
    },
  })
}
