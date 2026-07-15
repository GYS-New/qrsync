/**
 * POST /api/oto-yikama/takvim/gun/toplu-iptal
 *   body: { firma_id, tarih, arac_ids: string[] }
 *
 * Bir günün tahmini planlı araçlarını **tek atomik istekte** iptal eder
 * (skip tablosuna toplu upsert). Öncesinde 37 sequential POST atılıyordu;
 * kullanıcı modal'ı kapatınca yarım kalıyor ve takvimde tahminler
 * kaybolmuyordu. (2026-07-14 kullanıcı raporu.)
 *
 * Gerçek HAZIR/ACIK görevler için ayrı DELETE endpoint hâlâ mevcut
 * (/api/oto-yikama/takvim/gun DELETE). Bu endpoint yalnızca tahminleri
 * skip'e yazar.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getFirmaModulDurumu } from '@/lib/firmalar/modulDurumu'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function bugunTR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date())
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase.from('users').select('id, rol, firma_id').eq('id', authUser.id).single()
  if (!me) return NextResponse.json({ ok: false, error: 'Kullanıcı bulunamadı' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Geçersiz JSON' }, { status: 400 }) }

  const firmaId = String(body?.firma_id ?? '')
  const tarih = String(body?.tarih ?? '')
  const aracIds: string[] = Array.isArray(body?.arac_ids) ? body.arac_ids.filter((x: any) => typeof x === 'string') : []

  if (!firmaId) return NextResponse.json({ ok: false, error: 'firma_id gerekli' }, { status: 400 })
  if (!DATE_RE.test(tarih)) return NextResponse.json({ ok: false, error: 'Geçersiz tarih (YYYY-MM-DD)' }, { status: 400 })
  if (tarih < bugunTR()) return NextResponse.json({ ok: false, error: 'Geçmiş tarihe iptal yapılamaz' }, { status: 400 })
  if (aracIds.length === 0) return NextResponse.json({ ok: true, skip_yazilan: 0 })

  const isSA = ['super_admin', 'alt_super_admin'].includes(me.rol)
  if (!isSA && me.firma_id !== firmaId) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erişim yok' }, { status: 403 })
  }

  const admin = createAdminClient()
  if (!(await getFirmaModulDurumu(admin, firmaId, 'oto_yikama_aktif'))) {
    return NextResponse.json({ ok: false, error: 'Oto Yıkama modülü pasif' }, { status: 403 })
  }

  // Araçların bu firmaya ait ve aktif olduğunu doğrula (defense-in-depth)
  const { data: gecerliAraclar } = await admin
    .from('araclar')
    .select('id')
    .eq('firma_id', firmaId)
    .eq('aktif', true)
    .in('id', aracIds)
  const gecerliIds = new Set(((gecerliAraclar ?? []) as any[]).map(a => a.id))
  const filtreliIds = aracIds.filter(id => gecerliIds.has(id))
  if (filtreliIds.length === 0) return NextResponse.json({ ok: true, skip_yazilan: 0 })

  // Toplu upsert — arac_id,tarih composite unique üzerinde çakışma olursa
  // günceller (yeniden iptal fikri; mevcut skip'e dokunmadan idempotent)
  const rows = filtreliIds.map(arac_id => ({
    firma_id: firmaId,
    arac_id,
    tarih,
    olusturan_id: me.id,
  }))
  const { error } = await admin
    .from('oto_yikama_gorev_skip')
    .upsert(rows, { onConflict: 'arac_id,tarih' })
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, skip_yazilan: rows.length })
}
