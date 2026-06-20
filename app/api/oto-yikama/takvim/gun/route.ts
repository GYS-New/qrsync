/**
 * POST   /api/oto-yikama/takvim/gun
 * DELETE /api/oto-yikama/takvim/gun
 *
 * Yıkama Takvimi sayfasındaki günlük detay popup'tan düzenleme:
 *   • POST: o gün için seçilen plakaya görev ekle
 *           body: { firma_id, arac_id, tarih, lokasyon_id? }
 *   • DELETE (tümü): o günün TÜM planlı (HAZIR/ACIK) görevlerini sil
 *           ?firma_id=X&tarih=YYYY-MM-DD
 *   • DELETE (bireysel): o günün belirli aracını sil
 *           ?firma_id=X&tarih=YYYY-MM-DD&arac_id=UUID
 *
 * ISLEMDE/TAMAMLANDI/IPTAL/YAPILAMADI durumdaki görevler korunur — yalnız
 * henüz personel başlatmamış (HAZIR / ACIK) görevler silinir.
 *
 * Yetki: tüm authenticated + firma scope (assertModulYetkisi sayfa düzeyinde
 * Oto Yıkama erişimini zaten kontrol eder).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function yetki() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { err: NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 }) }
  const { data: me } = await supabase.from('users').select('id, rol, firma_id').eq('id', user.id).single()
  if (!me) return { err: NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 401 }) }
  return { me }
}

function scopeKontrol(me: any, firmaId: string): NextResponse | null {
  const isSA = ['super_admin', 'alt_super_admin'].includes(me.rol)
  if (!isSA && firmaId !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erişim yok' }, { status: 403 })
  }
  return null
}

function bugunTR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}

// ── POST: yeni görev ekle ─────────────────────────────────
export async function POST(req: NextRequest) {
  const y = await yetki(); if ('err' in y) return y.err
  const { me } = y

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400 }) }

  const firmaId = String(body?.firma_id ?? '')
  const aracId = String(body?.arac_id ?? '')
  const tarih = String(body?.tarih ?? '')
  let lokasyonId = body?.lokasyon_id ? String(body.lokasyon_id) : null
  // iptal=true → skip tablosuna kayıt yazılır (Migration 089 + 090).
  // Cron skip kaydını görür, görev üretmez. Görev/metadata tablolarına
  // dokunulmaz — DB temiz kalır, "hiç planlanmamış" gibi davranır.
  const iptalMi = body?.iptal === true

  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  if (!aracId)  return NextResponse.json({ ok: false, error: 'arac_id gerekli' }, { status: 400 })
  if (!DATE_RE.test(tarih)) return NextResponse.json({ ok: false, error: 'Geçersiz tarih (YYYY-MM-DD)' }, { status: 400 })
  if (tarih < bugunTR())    return NextResponse.json({ ok: false, error: 'Geçmiş tarihe görev eklenemez' }, { status: 400 })

  const scopeErr = scopeKontrol(me, firmaId); if (scopeErr) return scopeErr
  const admin = createAdminClient()

  if (!(await getFirmaModulDurumu(admin, firmaId, 'oto_yikama_aktif'))) {
    return NextResponse.json({ ok: false, error: 'Oto Yıkama modülü pasif' }, { status: 403 })
  }

  // Araç doğrulama (firma + aktif)
  const { data: arac } = await admin
    .from('araclar')
    .select('id, plaka, varsayilan_lokasyon_id, aktif, firma_id')
    .eq('id', aracId).maybeSingle()
  if (!arac) return NextResponse.json({ ok: false, error: 'Araç bulunamadı' }, { status: 404 })
  if (arac.firma_id !== firmaId) return NextResponse.json({ ok: false, error: 'Araç bu firmaya ait değil' }, { status: 400 })
  if (arac.aktif === false) return NextResponse.json({ ok: false, error: 'Araç pasif' }, { status: 400 })

  // ── IPTAL/SKİP yolu — tahmini planı atla, görev oluşturma yok
  if (iptalMi) {
    const { error: skipErr } = await admin
      .from('oto_yikama_gorev_skip')
      .upsert({ firma_id: firmaId, arac_id: aracId, tarih, olusturan_id: me.id },
              { onConflict: 'arac_id,tarih' })
    if (skipErr) {
      return NextResponse.json({ ok: false, error: 'Skip yazılamadı: ' + skipErr.message }, { status: 500 })
    }
    return NextResponse.json({
      ok: true, plaka: arac.plaka, tarih,
      skip: true, mesaj: `${arac.plaka} için ${tarih} planı iptal edildi (cron üretmeyecek)`,
    })
  }

  // ── EKLEME yolu — gerçek görev oluştur
  // Lokasyon: param yoksa aracın varsayılanını kullan
  if (!lokasyonId) lokasyonId = arac.varsayilan_lokasyon_id
  if (!lokasyonId) {
    return NextResponse.json({ ok: false, error: 'Aracın varsayılan istasyonu yok — lokasyon_id belirtin' }, { status: 400 })
  }
  // Lokasyon firma kontrolü
  const { data: lok } = await admin
    .from('lokasyonlar').select('id, firma_id, tanim').eq('id', lokasyonId).maybeSingle()
  if (!lok || lok.firma_id !== firmaId) {
    return NextResponse.json({ ok: false, error: 'Geçersiz lokasyon' }, { status: 400 })
  }

  // Mevcut kontrolü — aynı arac+tarih için zaten görev varsa engelle
  const { data: mevcut } = await admin
    .from('oto_yikama_gorev_metadata')
    .select('gorev_id')
    .eq('arac_id', aracId).eq('hedef_tarih', tarih)
  if (mevcut && mevcut.length > 0) {
    return NextResponse.json({
      ok: false,
      error: `${arac.plaka} için ${tarih} tarihinde zaten görev mevcut`,
      code: 'MEVCUT',
    }, { status: 409 })
  }

  // Manuel ekleme yaparken eski skip varsa kaldır (kullanıcı tekrar plan
  // ekliyor — niyetini onayla)
  await admin.from('oto_yikama_gorev_skip')
    .delete().eq('arac_id', aracId).eq('tarih', tarih)

  const isBugun = tarih === bugunTR()
  const yeniDurum = isBugun ? 'ACIK' : 'HAZIR'
  const { data: yeniGorev, error: gorevErr } = await admin
    .from('gorevler')
    .insert({
      firma_id: firmaId,
      tanim: `Oto Yıkama - ${arac.plaka}`,
      lokasyon_id: lokasyonId,
      durum: yeniDurum,
      olusturan_id: me.id,
    })
    .select('id').single()
  if (gorevErr || !yeniGorev) {
    return NextResponse.json({ ok: false, error: gorevErr?.message ?? 'Görev oluşturulamadı' }, { status: 500 })
  }

  const { error: metaErr } = await admin
    .from('oto_yikama_gorev_metadata')
    .insert({
      gorev_id: yeniGorev.id, arac_id: aracId, plaka_snapshot: arac.plaka,
      hedef_tarih: tarih, ekstra: false,
    })
  if (metaErr) {
    await admin.from('gorevler').delete().eq('id', yeniGorev.id)
    return NextResponse.json({ ok: false, error: 'metadata yazılamadı: ' + metaErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true, gorev_id: yeniGorev.id, plaka: arac.plaka, tarih,
    lokasyon: lok.tanim, durum: yeniDurum,
  })
}

// ── DELETE: tümünü veya bireysel sil ───────────────────────
export async function DELETE(req: NextRequest) {
  const y = await yetki(); if ('err' in y) return y.err
  const { me } = y

  const sp = req.nextUrl.searchParams
  const firmaId = sp.get('firma_id')
  const tarih = sp.get('tarih')
  const aracId = sp.get('arac_id')  // opsiyonel — varsa bireysel, yoksa toplu

  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  if (!tarih || !DATE_RE.test(tarih)) return NextResponse.json({ ok: false, error: 'Geçersiz tarih' }, { status: 400 })
  if (tarih < bugunTR()) return NextResponse.json({ ok: false, error: 'Geçmiş günden silinemez' }, { status: 400 })

  const scopeErr = scopeKontrol(me, firmaId); if (scopeErr) return scopeErr
  const admin = createAdminClient()

  // Aday metadata kayıtları
  let metaQ = admin
    .from('oto_yikama_gorev_metadata')
    .select('gorev_id, arac_id, plaka_snapshot')
    .eq('hedef_tarih', tarih)
  if (aracId) metaQ = metaQ.eq('arac_id', aracId)
  const { data: metaRows } = await metaQ
  const adayIds = (metaRows ?? []).map(m => m.gorev_id)
  if (adayIds.length === 0) {
    return NextResponse.json({ ok: true, silinen: 0, mesaj: 'Silinecek görev bulunamadı' })
  }

  // Firma scope + sadece silinebilir durumlar (HAZIR/ACIK)
  const { data: gorevler } = await admin
    .from('gorevler')
    .select('id, durum, firma_id')
    .in('id', adayIds)
    .eq('firma_id', firmaId)
    .in('durum', ['HAZIR', 'ACIK'])
  const silId = (gorevler ?? []).map((g: any) => g.id)

  if (silId.length === 0) {
    const korunan = adayIds.length
    return NextResponse.json({
      ok: true, silinen: 0,
      mesaj: `${korunan} görev korundu (ISLEMDE/TAMAMLANDI/IPTAL durumundakilere dokunulmaz)`,
    })
  }

  // Sil — metadata CASCADE ile birlikte silinir
  const { error: delErr } = await admin.from('gorevler').delete().in('id', silId)
  if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 })

  const korunan = adayIds.length - silId.length
  return NextResponse.json({
    ok: true, silinen: silId.length, korunan,
    mesaj: korunan > 0
      ? `${silId.length} planlı görev silindi, ${korunan} görev başlatıldığı için korundu`
      : `${silId.length} planlı görev silindi`,
  })
}
