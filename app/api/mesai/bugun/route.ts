import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

/**
 * GET /api/mesai/bugun?firma_id=...&proje_id=...
 *
 * Bugünkü mesai kayıtlarını ve KPI özetini döner.
 * - aktif: iş başı yapmış, henüz iş bitimi yapmamış
 * - pasif: kayıt yok VEYA iş bitimi yapmış
 * - toplam: firmanın/projenin tüm aktif personeli
 */
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const admin    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return NextResponse.json({ ok: false, error: 'Yetki yetersiz' }, { status: 403 })

  const p       = new URL(req.url).searchParams
  const firmaId = isSA ? p.get('firma_id') : me.firma_id
  const projeId = p.get('proje_id') ?? null

  if (!firmaId) return NextResponse.json({ ok: true, kpi: null, kayitlar: [] })

  // TRT bugün
  const trtNow = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const bugun  = trtNow.toISOString().split('T')[0]

  // Bugünkü mesai kayıtları (arşivlenmemiş)
  let mesaiQ = admin
    .from('personel_mesai_kayitlari')
    .select('id,user_id,giris_saati,cikis_saati,giris_tipi,cikis_tipi,kayit_tarihi')
    .eq('firma_id', firmaId)
    .eq('kayit_tarihi', bugun)
    .eq('arsivlendi', false)
    .order('giris_saati', { ascending: true })

  if (projeId) mesaiQ = (mesaiQ as any).eq('proje_id', projeId)

  const { data: mesaiKayitlar, error: mesaiErr } = await mesaiQ
  if (mesaiErr) return NextResponse.json({ ok: false, error: mesaiErr.message }, { status: 500 })

  // Projedeki / firmadaki tüm aktif personel (SA ve alt_super_admin hariç)
  // TA (tenant_admin) proje_id'ye bağlı olmayabileceği için proje filtresi TA'ya uygulanmaz
  let kulQ = admin
    .from('users')
    .select('id,isim_soyisim,email,profil_foto,rol,last_seen_at')
    .eq('firma_id', firmaId)
    .eq('aktif', true)
    .not('rol', 'in', '(super_admin,alt_super_admin)')
    .order('isim_soyisim')

  // Proje filtresi: tenant_admin hariç diğerlerine uygula
  // (TA proje_id olmadan da listeye girmeli)
  if (projeId) {
    kulQ = (kulQ as any).or(
      `proje_id.eq.${projeId},rol.eq.tenant_admin`
    )
  }

  const { data: kullanicilar } = await kulQ

  // user_id → mesai kaydı map
  const mesaiMap = new Map<string, any>()
  for (const k of mesaiKayitlar ?? []) mesaiMap.set(k.user_id, k)

  // Zengin liste: her personel + bugünkü mesai durumu
  const liste = (kullanicilar ?? []).map((u: any) => {
    const kayit = mesaiMap.get(u.id) ?? null
    const aktif = kayit !== null && kayit.cikis_saati === null
    return {
      user_id:        u.id,
      isim_soyisim:   u.isim_soyisim,
      email:          u.email,
      profil_foto:    u.profil_foto ?? null,
      rol:            u.rol,
      last_seen_at:   u.last_seen_at ?? null,
      aktif,
      mesai_id:       kayit?.id        ?? null,
      giris_saati:    kayit?.giris_saati  ?? null,
      cikis_saati:    kayit?.cikis_saati  ?? null,
      giris_tipi:     kayit?.giris_tipi   ?? null,
      cikis_tipi:     kayit?.cikis_tipi   ?? null,
    }
  })

  const toplam = liste.length
  const aktif  = liste.filter(l => l.aktif).length
  const pasif  = toplam - aktif

  return NextResponse.json({
    ok: true,
    kpi:     { toplam, aktif, pasif },
    kayitlar: liste,
  })
}
