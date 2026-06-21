/**
 * Kullanıcı-bazlı modül erişim yetkileri (kullanici_modul_yetkileri tablosu).
 * Migration 091 ile rol-bazlı sistem yerini bu tabloya bıraktı.
 *
 * GET  ?firma_id=… → o firmanın (ATALIAN OYAK Renault filtresi ile)
 *      kullanıcı listesi + her birinin GYS/FMS yetkisi
 * POST { firma_id, yetkiler: [{ user_id, modul_kodu, gorebilir }] } →
 *      tek seferde batch upsert
 *
 * Yetki: SA ve TA. TA sadece kendi firmasının kayıtlarını değiştirebilir.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

const YONETILEN_MODULLER = ['gys', 'fms'] as const
type ModulKodu = (typeof YONETILEN_MODULLER)[number]

const VARSAYILAN: Record<ModulKodu, boolean> = { gys: true, fms: false }

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
  if (!firmaId) {
    return NextResponse.json({ ok: true, firma_id: null, kullanicilar: [] })
  }

  const admin = createAdminClient()

  // ATALIAN OYAK Renault filtresi: firma seçili + (proje yok veya OYAK Renault)
  const { data: oyakProje } = await admin
    .from('projeler')
    .select('id')
    .eq('firma_id', firmaId)
    .eq('ad', 'OYAK RENAULT')
    .maybeSingle()
  const oyakProjeId = oyakProje?.id ?? null

  let q = admin
    .from('users')
    .select('id, isim_soyisim, email, rol, proje_id')
    .eq('firma_id', firmaId)
    .eq('aktif', true)
    .in('rol', ['tenant_admin', 'tenant_user', 'musteri'])
    .order('isim_soyisim')
  if (oyakProjeId) q = q.or(`proje_id.is.null,proje_id.eq.${oyakProjeId}`)

  const { data: users, error: usersErr } = await q
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })

  const userIds = (users ?? []).map(u => u.id)
  const yetkiMap = new Map<string, Record<ModulKodu, boolean>>()
  if (userIds.length > 0) {
    const { data: yetkiler } = await admin
      .from('kullanici_modul_yetkileri')
      .select('user_id, modul_kodu, gorebilir')
      .in('user_id', userIds)
      .in('modul_kodu', YONETILEN_MODULLER as unknown as string[])
    for (const r of (yetkiler ?? [])) {
      const cur = yetkiMap.get(r.user_id) ?? { ...VARSAYILAN }
      if ((YONETILEN_MODULLER as readonly string[]).includes(r.modul_kodu)) {
        cur[r.modul_kodu as ModulKodu] = r.gorebilir === true
      }
      yetkiMap.set(r.user_id, cur)
    }
  }

  return NextResponse.json({
    ok: true,
    firma_id: firmaId,
    kullanicilar: (users ?? []).map(u => ({
      id: u.id,
      isim_soyisim: u.isim_soyisim,
      email: u.email,
      rol: u.rol,
      yetkiler: yetkiMap.get(u.id) ?? { ...VARSAYILAN },
    })),
  })
}

export async function POST(req: NextRequest) {
  const auth = await yetkiKontrol(req)
  if ('hata' in auth) return auth.hata
  const { me, isSA } = auth

  const body = await req.json().catch(() => ({} as any))
  const firmaIdRaw = body?.firma_id ?? null
  const firmaId: string | null = isSA ? (firmaIdRaw || null) : me!.firma_id
  if (!firmaId) return NextResponse.json({ error: 'firma_id gerekli' }, { status: 400 })

  const yetkilerRaw = Array.isArray(body?.yetkiler) ? body.yetkiler : []
  // Format validasyonu
  type Yetki = { user_id: string; modul_kodu: ModulKodu; gorebilir: boolean }
  const yetkiler: Yetki[] = []
  for (const y of yetkilerRaw) {
    if (!y || typeof y !== 'object') continue
    if (typeof y.user_id !== 'string') continue
    if (!(YONETILEN_MODULLER as readonly string[]).includes(y.modul_kodu)) continue
    yetkiler.push({ user_id: y.user_id, modul_kodu: y.modul_kodu, gorebilir: y.gorebilir === true })
  }
  if (yetkiler.length === 0) return NextResponse.json({ ok: true, etkilenen: 0 })

  const admin = createAdminClient()

  // Firma scope kontrolü — gelen user_id'lerin hepsi belirtilen firmaya ait olmalı
  const userIds = [...new Set(yetkiler.map(y => y.user_id))]
  const { data: usersChk } = await admin
    .from('users')
    .select('id, firma_id')
    .in('id', userIds)
  const validIds = new Set((usersChk ?? []).filter(u => u.firma_id === firmaId).map(u => u.id))
  const finalYetkiler = yetkiler.filter(y => validIds.has(y.user_id))
  if (finalYetkiler.length === 0) {
    return NextResponse.json({ error: 'Geçerli kullanıcı bulunamadı' }, { status: 400 })
  }

  // Batch upsert
  const rows = finalYetkiler.map(y => ({
    user_id: y.user_id,
    modul_kodu: y.modul_kodu,
    gorebilir: y.gorebilir,
    updated_at: new Date().toISOString(),
    updated_by: me!.id,
  }))
  const { error: upErr, data: upData } = await admin
    .from('kullanici_modul_yetkileri')
    .upsert(rows, { onConflict: 'user_id,modul_kodu' })
    .select('user_id')
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  void auditLog({
    tip: 'modul_yetki_degisim',
    tablo: 'kullanici_modul_yetkileri',
    firma_id: firmaId,
    kullanici_id: me!.id,
    basarili: true,
    detay: { etkilenen: upData?.length ?? 0, batch_boyut: rows.length },
  })

  return NextResponse.json({ ok: true, etkilenen: upData?.length ?? 0 })
}
