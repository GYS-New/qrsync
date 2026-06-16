import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { buildQrKartZip } from '@/lib/qr-kart/qr-kart-node'
import { getLokasyonYetki } from '@/lib/yetki/getLokasyonYetki'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

export const dynamic    = 'force-dynamic'
export const runtime    = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const admin    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  const isU  = me.rol === 'tenant_user'
  // U salt-okunur QR aksiyonları için izinli; musteri yasak
  if (!isSA && !isTA && !isU) return NextResponse.json({ error: 'Yetki yetersiz' }, { status: 403 })

  const url           = new URL(req.url)
  const firmaId       = url.searchParams.get('firma_id')
  const projeId       = url.searchParams.get('proje_id')
  const ustLokasyonId = url.searchParams.get('ust_lokasyon_id')
  let origin = url.searchParams.get('origin')
  if (!origin) {
    try {
      const { getSistemKonfig } = await import('@/lib/config/getSistemKonfig')
      const konfig = await getSistemKonfig()
      origin = `https://${konfig.uygulama_domain}`
    } catch { origin = 'https://app.qrsync.com' }
  }

  const effectiveFirmaId = isSA ? firmaId : me.firma_id
  if (!effectiveFirmaId) return NextResponse.json({ error: 'firma_id zorunlu' }, { status: 400 })
  if ((isTA || isU) && firmaId && firmaId !== me.firma_id) return NextResponse.json({ error: 'Yetkisiz firma' }, { status: 403 })

  // U için: ust_lokasyon_id kullanıcının yetkili olduğu üst lokasyon ağacında olmalı
  if (isU && ustLokasyonId) {
    const yetkiliUstLokIds = await getLokasyonYetki(supabase)
    // null = tüm erişim (kayıt yok), array = kısıtlı
    if (yetkiliUstLokIds !== null && !yetkiliUstLokIds.includes(ustLokasyonId)) {
      return NextResponse.json({ error: 'Bu üst lokasyon için yetkiniz yok' }, { status: 403 })
    }
  }

  // Modül izolasyonu: Oto Yıkama lokasyonlarının QR'ları GYS UI'dan indirilemez
  // (tüm roller). Oto Yıkama modülünün kendi QR yönetimi var.
  const otoIds = await getOtoYikamaLokasyonIds(admin, effectiveFirmaId)
  if (ustLokasyonId && otoIds.has(ustLokasyonId)) {
    return NextResponse.json({ error: 'Bu lokasyon için yetkiniz yok' }, { status: 403 })
  }

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
  // Modül izolasyonu: Oto Yıkama lokasyonları zip içeriğinden de hariç (tüm roller)
  if (otoIds.size > 0) {
    lokasyonlar = lokasyonlar.filter((l: any) => !otoIds.has(l.id))
  }
  if (!lokasyonlar.length) return NextResponse.json({ error: 'QR kodu olan aktif lokasyon bulunamadı' }, { status: 404 })

  const zipBuffer = await buildQrKartZip({
    lokasyonlar: lokasyonlar.map((l: any) => ({
      id:     l.id,
      tanim:  l.tanim,
      qr_url: `${origin}/qr/${l.qr_veri}`,
    })),
    ayarlar: { minimal_boyut: 320 },
  })

  return new NextResponse(zipBuffer as unknown as BodyInit, {
    headers: {
      'content-type':        'application/zip',
      'content-disposition': `attachment; filename="qr-kodlar-${new Date().toISOString().slice(0, 10)}.zip"`,
      'content-length':      zipBuffer.byteLength.toString(),
    },
  })
}
