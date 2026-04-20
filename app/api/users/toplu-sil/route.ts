import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'

export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('rol,firma_id').eq('id', user.id).single()
  if (!me || !['super_admin', 'alt_super_admin', 'tenant_admin'].includes(me.rol))
    return NextResponse.json({ error: 'Yetkisiz' }, { status: 403 })

  const body = await req.json()
  const ids: string[] = body.ids
  if (!Array.isArray(ids) || ids.length === 0)
    return NextResponse.json({ error: 'Silinecek kullanıcı ID listesi gerekli' }, { status: 400 })

  if (ids.length > 500)
    return NextResponse.json({ error: 'Tek seferde en fazla 500 kullanıcı silinebilir' }, { status: 400 })

  const admin = createAdminClient()
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'

  // Silinecek kullanıcıları çek — TA koruma
  const { data: hedefler } = await admin.from('users').select('id,rol,firma_id').in('id', ids)
  const silinecekIds = (hedefler ?? [])
    .filter(u => {
      if (u.rol === 'tenant_admin' || u.rol === 'super_admin' || u.rol === 'alt_super_admin') return false
      if (!isSA && u.firma_id !== me.firma_id) return false
      return true
    })
    .map(u => u.id)

  if (silinecekIds.length === 0)
    return NextResponse.json({ error: 'Silinebilecek kullanıcı bulunamadı (TA/SA korumalı)' }, { status: 400 })

  // FK bağımlılıkları temizle — GÖREV SİLMEDEN ÖNCE bağlı çeklistleri temizle (yetim düşmesin)
  // Kullanıcıya atanmış spesifik görevlerin id'lerini al
  const { data: kullaniciGorevAktif } = await admin
    .from('gorevler').select('id').in('atanan_kullanici_id', silinecekIds)
  const { data: kullaniciGorevArsiv } = await admin
    .from('gorevler_arsiv').select('id').in('atanan_kullanici_id', silinecekIds)
  const silinecekGorevIds = [
    ...(kullaniciGorevAktif ?? []).map((g: any) => g.id),
    ...(kullaniciGorevArsiv ?? []).map((g: any) => g.id),
  ]
  if (silinecekGorevIds.length > 0) {
    // Aktif + arşiv çeklist başlıklarını + bağlı maddeleri temizle
    for (const tbl of ['checklist_sonuc_basliklari', 'checklist_sonuc_basliklari_arsiv'] as const) {
      const madde_tbl = tbl === 'checklist_sonuc_basliklari'
        ? 'checklist_sonuc_maddeleri'
        : 'checklist_sonuc_maddeleri_arsiv'
      const { data: basliklar } = await admin.from(tbl).select('id').in('gorev_id', silinecekGorevIds)
      if (basliklar?.length) {
        const baslikIds = basliklar.map((b: any) => b.id)
        await admin.from(madde_tbl).delete().in('sonuc_id', baslikIds)
      }
      await admin.from(tbl).delete().in('gorev_id', silinecekGorevIds)
    }
  }

  await admin.from('gorevler').delete().in('atanan_kullanici_id', silinecekIds)
  await admin.from('gorevler_arsiv').delete().in('atanan_kullanici_id', silinecekIds)
  await admin.from('personel_mesai_kayitlari').delete().in('user_id', silinecekIds)
  await admin.from('personel_mesai_kayitlari_arsiv').delete().in('user_id', silinecekIds)
  await admin.from('bildirimler').delete().in('alici_id', silinecekIds)
  await admin.from('device_tokens').delete().in('user_id', silinecekIds)

  // canli_gorevler atamalarını temizle (NULL yapılabilir)
  await admin.from('canli_gorevler').update({ atanan_kullanici_id: null }).in('atanan_kullanici_id', silinecekIds)
  await admin.from('canli_gorevler_arsiv').update({ atanan_kullanici_id: null }).in('atanan_kullanici_id', silinecekIds)

  // users sil
  const { error: usersErr } = await admin.from('users').delete().in('id', silinecekIds)
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })

  // auth sil
  let authSilinen = 0
  for (const id of silinecekIds) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (!error) authSilinen++
  }

  await auditLog({
    tip: 'kullanici_sil', tablo: 'users', satir_sayisi: silinecekIds.length,
    kullanici_id: user.id,
    firma_id: me.firma_id ?? null,
    detay: {
      islem: 'toplu_sil',
      silinen_ids: silinecekIds.slice(0, 20),
      toplam: silinecekIds.length,
      auth_silinen: authSilinen,
    },
  })

  return NextResponse.json({ ok: true, silinen: silinecekIds.length, auth_silinen: authSilinen })
}
