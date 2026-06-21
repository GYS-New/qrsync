/**
 * Modül erişim yetkileri (kullanici_grubu_yetkileri tablosu üzerinden,
 * sayfa_kodu='_modul_giris' marker'ı ile).
 *
 * GET  → mevcut yetki kayıtlarını döner: { firma_id?, yetkiler: [{rol, modul_kodu}] }
 * POST → tam-replace: önceki kayıtlar silinir, yeni satırlar yazılır.
 *
 * Yetki: SA ve TA. TA sadece kendi firmasının kayıtlarını değiştirebilir.
 * GYS modülü için kayıt tutulmaz (varsayılan herkes açık).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

const MODUL_GIRIS_SAYFA_KODU = '_modul_giris'
// GYS yetkisi de buradan yönetilir (default açık; kapatılırsa o rolün
// kullanıcıları GYS'ye giremez — sadece diğer yetkili modüllere). Oto
// Yıkama buradan yönetilmez — lokasyon ataması
// (kullanici_lokasyon_yetkileri / users.ust_lokasyon_id) tek source of truth.
const YONETILEN_MODULLER: string[] = ['gys', 'fms']

async function yetkiKontrol(req: NextRequest) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return { hata: NextResponse.json({ error: 'Yetkisiz' }, { status: 401 }) }

  const { data: me } = await supabase
    .from('users').select('id, rol, firma_id').eq('id', authUser.id).single()
  if (!me) return { hata: NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 }) }

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const isTA = me.rol === 'tenant_admin'
  if (!isSA && !isTA) return { hata: NextResponse.json({ error: 'Yetkisiz' }, { status: 403 }) }

  return { me, isSA }
}

export async function GET(req: NextRequest) {
  const auth = await yetkiKontrol(req)
  if ('hata' in auth) return auth.hata
  const { me, isSA } = auth

  const url = new URL(req.url)
  const firmaIdParam = url.searchParams.get('firma_id')
  const firmaId = isSA ? (firmaIdParam || null) : me!.firma_id

  const admin = createAdminClient()
  // GYS için "kayıt yok = AÇIK" semantiği var; bu yüzden gorebilir filtresi
  // YOK — hem true hem false satırlar dönmeli ki client doğru tick state'i
  // hesaplayabilsin. Client tarafında default'la birleştirilir.
  let q = admin.from('kullanici_grubu_yetkileri')
    .select('rol, modul_kodu, gorebilir')
    .eq('sayfa_kodu', MODUL_GIRIS_SAYFA_KODU)
    .in('modul_kodu', YONETILEN_MODULLER)
  q = firmaId ? q.eq('firma_id', firmaId) : q.is('firma_id', null)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    firma_id: firmaId,
    yetkiler: (data ?? []).map(r => ({ rol: r.rol, modul_kodu: r.modul_kodu, gorebilir: r.gorebilir === true })),
  })
}

export async function POST(req: NextRequest) {
  const auth = await yetkiKontrol(req)
  if ('hata' in auth) return auth.hata
  const { me, isSA } = auth

  const body = await req.json().catch(() => ({} as any))
  const firmaIdRaw = body?.firma_id ?? null
  const firmaId: string | null = isSA ? (firmaIdRaw || null) : me!.firma_id
  const yetkilerRaw = Array.isArray(body?.yetkiler) ? body.yetkiler : []

  // Yetkiler artık {rol, modul_kodu, gorebilir} formatında — gorebilir
  // explicit olarak yazılır (true=AÇIK, false=KAPALI). Default ile aynı
  // olan satırlar client tarafında filtrelenir, server burada gelmesini
  // beklemez ama gelirse de kabul eder (zararı yok, sadece DB satır sayısı).
  const ROL_LISTE = ['tenant_admin', 'tenant_user', 'musteri', 'alt_super_admin']
  const yetkiler: { rol: string; modul_kodu: string; gorebilir: boolean }[] = []
  for (const y of yetkilerRaw) {
    if (!y || typeof y !== 'object') continue
    if (!ROL_LISTE.includes(y.rol)) continue
    if (!YONETILEN_MODULLER.includes(y.modul_kodu)) continue
    yetkiler.push({ rol: y.rol, modul_kodu: y.modul_kodu, gorebilir: y.gorebilir === true })
  }

  const admin = createAdminClient()

  // 1) Mevcut modül giriş kayıtlarını sil (sadece yönetilen modüller, bu firma için)
  let delQ = admin.from('kullanici_grubu_yetkileri')
    .delete()
    .eq('sayfa_kodu', MODUL_GIRIS_SAYFA_KODU)
    .in('modul_kodu', YONETILEN_MODULLER)
  delQ = firmaId ? delQ.eq('firma_id', firmaId) : delQ.is('firma_id', null)
  const { error: delErr } = await delQ
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // 2) Yeni satırları insert (varsa)
  let insertedCount = 0
  if (yetkiler.length > 0) {
    const rows = yetkiler.map(y => ({
      firma_id: firmaId,
      rol: y.rol,
      sayfa_kodu: MODUL_GIRIS_SAYFA_KODU,
      modul_kodu: y.modul_kodu,
      gorebilir: y.gorebilir,
      ekleyebilir: y.gorebilir,
      duzenleyebilir: y.gorebilir,
      silebilir: y.gorebilir,
    }))
    const { error: insErr, data: insData } = await admin
      .from('kullanici_grubu_yetkileri').insert(rows).select('id')
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    insertedCount = insData?.length ?? 0
  }

  void auditLog({
    tip: 'modul_yetki_degisim',
    tablo: 'kullanici_grubu_yetkileri',
    firma_id: firmaId,
    kullanici_id: me!.id,
    basarili: true,
    detay: { yeni_yetkiler: yetkiler, eklenen: insertedCount },
  })

  return NextResponse.json({ ok: true, eklenen: insertedCount })
}
