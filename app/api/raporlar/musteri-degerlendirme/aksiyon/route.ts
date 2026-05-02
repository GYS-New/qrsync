/**
 * /api/raporlar/musteri-degerlendirme/aksiyon
 *
 * Müşteri değerlendirmesine alınan aksiyon kaydı.
 * Sadece düzenleme yetkisi olan kullanıcılar (TA, yetkili U, SA) yazabilir.
 *
 * POST: upsert (yeni veya mevcut aksiyonu güncelle)
 *   { degerlendirmeId, aksiyon_metni, gorsel_urls?: string[] }
 *
 * DELETE: aksiyon kaydını sil
 *   { degerlendirmeId }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'
import { getYetkiliLokasyonIds } from '@/lib/yetki/getLokasyonYetki'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function yetkiVeSahiplik(req: NextRequest, supabase: any, admin: any, degerlendirmeId: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401, error: 'Yetkisiz' }
  const { data: me } = await supabase.from('users').select('id,rol,firma_id,isim_soyisim').eq('id', user.id).single()
  if (!me) return { ok: false as const, status: 403, error: 'Kullanıcı bulunamadı' }

  // Değerlendirmeyi bul (önce aktif tablo, sonra arşiv)
  const { data: deger } = await admin
    .from('musteri_degerlendirmeleri')
    .select('id,firma_id,proje_id,lokasyon_id,yildiz')
    .eq('id', degerlendirmeId).maybeSingle()
  const { data: degArs } = !deger ? await admin
    .from('musteri_degerlendirmeleri_arsiv')
    .select('id,firma_id,proje_id,lokasyon_id,yildiz')
    .eq('id', degerlendirmeId).maybeSingle() : { data: null }
  const target = deger || degArs
  if (!target) return { ok: false as const, status: 404, error: 'Değerlendirme bulunamadı' }

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  const isU  = me.rol === 'tenant_user' || me.rol === 'musteri'

  // Firma scope
  if ((isTA || isU) && target.firma_id !== me.firma_id) {
    return { ok: false as const, status: 403, error: 'Yetkisiz firma' }
  }

  // Lokasyon scope (U/M için)
  if (isU) {
    const yetkiliIds = await getYetkiliLokasyonIds(supabase, me.firma_id, target.proje_id ?? null)
    if (yetkiliIds !== null && !yetkiliIds.includes(target.lokasyon_id)) {
      return { ok: false as const, status: 403, error: 'Bu lokasyon için yetkiniz yok' }
    }
  }

  // Sayfa yetkisi (görüntülenebilir → aksiyon ekleyebilir)
  // Aksiyon ekleme değerlendirmenin kendisini değiştirmez (ek not),
  // bu yüzden gorebilir yetkisi yeterli. Lokasyon scope (yukarıda) zaten
  // U'yu kendi yetkili olduğu üst lokasyonun değerlendirmeleriyle sınırlar.
  const yetki = await sayfaYetkileri(me.rol, 'musteri-degerlendirme', me.firma_id ?? null)
  if (!yetki.gorebilir) {
    return { ok: false as const, status: 403, error: 'Bu sayfaya erişiminiz yok' }
  }

  return { ok: true as const, me, target, isSA, isTA }
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const admin = createAdminClient()
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Geçersiz istek' }, { status: 400 }) }

  const degerlendirmeId = String(body?.degerlendirmeId ?? '')
  const aksiyonMetni = String(body?.aksiyon_metni ?? '').trim()
  const gorselUrls: string[] = Array.isArray(body?.gorsel_urls)
    ? body.gorsel_urls.filter((u: any) => typeof u === 'string').slice(0, 10)  // max 10 görsel
    : []

  if (!degerlendirmeId) return NextResponse.json({ ok: false, error: 'degerlendirmeId zorunlu' }, { status: 400 })
  if (!aksiyonMetni || aksiyonMetni.length < 3) {
    return NextResponse.json({ ok: false, error: 'Aksiyon metni en az 3 karakter olmalı' }, { status: 400 })
  }

  const auth = await yetkiVeSahiplik(req, supabase, admin, degerlendirmeId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const now = new Date().toISOString()
  // Mevcut aksiyon var mı?
  const { data: mevcut } = await admin
    .from('musteri_degerlendirme_aksiyonlari')
    .select('id').eq('degerlendirme_id', degerlendirmeId).maybeSingle()

  if (mevcut) {
    const { error } = await admin
      .from('musteri_degerlendirme_aksiyonlari')
      .update({
        aksiyon_metni: aksiyonMetni,
        gorsel_urls: gorselUrls,
        guncelleme_tarihi: now,
      })
      .eq('id', mevcut.id)
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  } else {
    const { error } = await admin
      .from('musteri_degerlendirme_aksiyonlari')
      .insert({
        degerlendirme_id: degerlendirmeId,
        aksiyon_metni: aksiyonMetni,
        gorsel_urls: gorselUrls,
        olusturan_id: auth.me.id,
        olusturma_tarihi: now,
      })
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    aksiyon: {
      aksiyon_metni: aksiyonMetni,
      gorsel_urls: gorselUrls,
      olusturan_id: auth.me.id,
      olusturan_isim: auth.me.isim_soyisim ?? null,
      olusturma_tarihi: mevcut ? undefined : now,
      guncelleme_tarihi: mevcut ? now : null,
    },
  })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const admin = createAdminClient()
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Geçersiz istek' }, { status: 400 }) }
  const degerlendirmeId = String(body?.degerlendirmeId ?? '')
  if (!degerlendirmeId) return NextResponse.json({ ok: false, error: 'degerlendirmeId zorunlu' }, { status: 400 })

  const auth = await yetkiVeSahiplik(req, supabase, admin, degerlendirmeId)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const { error } = await admin
    .from('musteri_degerlendirme_aksiyonlari')
    .delete()
    .eq('degerlendirme_id', degerlendirmeId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
