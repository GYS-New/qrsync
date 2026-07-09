/**
 * PATCH  /api/oto-yikama/gunluk/[id]
 *   → Oto Yıkama görev durumunu ACIK ↔ TAMAMLANDI arasında toggle eder.
 *     Sadece SA. Görev firma'nın olmalı (audit/yetki).
 *
 * DELETE /api/oto-yikama/gunluk/[id]
 *   → Görev kaydını + metadata (FK cascade) siler. Sadece SA.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

async function authorize() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Yetkisiz', status: 401 as const }
  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
  if (!me) return { error: 'Kullanıcı bulunamadı', status: 401 as const }
  return { user, me }
}

// TA için firma scope kontrolü
function scopeKontrol(me: any, firmaId: string): NextResponse | null {
  const isSA = ['super_admin', 'alt_super_admin'].includes(me.rol)
  if (!isSA && firmaId !== me.firma_id) {
    return NextResponse.json({ ok: false, error: 'Bu firmaya erişim yok' }, { status: 403 })
  }
  return null
}

export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorize()
  if ('error' in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()

  // Görevi + metadata'yı çek
  const { data: gorev } = await admin
    .from('gorevler')
    .select('id, durum, firma_id, tanim')
    .eq('id', params.id)
    .single()
  if (!gorev) return NextResponse.json({ ok: false, error: 'Görev bulunamadı' }, { status: 404 })
  const scopeErr = scopeKontrol(auth.me, gorev.firma_id); if (scopeErr) return scopeErr

  // Bu Oto Yıkama metadata kaydı var mı? (Sadece Oto Yıkama görevleri için)
  const { data: meta } = await admin
    .from('oto_yikama_gorev_metadata')
    .select('gorev_id, plaka_snapshot, hedef_tarih')
    .eq('gorev_id', params.id)
    .maybeSingle()
  if (!meta) return NextResponse.json({ ok: false, error: 'Bu görev Oto Yıkama kaydı değil' }, { status: 400 })

  // Toggle: ACIK → TAMAMLANDI, TAMAMLANDI → ACIK
  const nowIso = new Date().toISOString()
  let yeniDurum: 'ACIK' | 'TAMAMLANDI'
  let update: Record<string, any>
  if (gorev.durum === 'ACIK') {
    yeniDurum = 'TAMAMLANDI'
    update = {
      durum: 'TAMAMLANDI',
      tamamlanma_tarihi: nowIso,
      durum_degisim_tarihi: nowIso,
      islemi_yapan_id: auth.user.id,
    }
    // NOT: onceki commit'teki personel-istasyon revizyonu iptal edildi
    // (2026-07-09) — users.ust_lokasyon_id parent (ARAC YIKAMA) donuyordu.
    // Gorevin mevcut lokasyon_id'si (aracin varsayilan child) korunur.
  } else if (gorev.durum === 'TAMAMLANDI') {
    yeniDurum = 'ACIK'
    update = {
      durum: 'ACIK',
      tamamlanma_tarihi: null,
      baslatilma_tarihi: null,
      tamamlanma_suresi_saniye: null,
      durum_degisim_tarihi: nowIso,
      islemi_yapan_id: null,
      baslatan_kullanici_id: null,
    }
  } else {
    return NextResponse.json(
      { ok: false, error: `Bu görev '${gorev.durum}' durumunda — sadece ACIK ↔ TAMAMLANDI toggle edilebilir.` },
      { status: 409 },
    )
  }

  const { error: updErr } = await admin.from('gorevler').update(update).eq('id', params.id)
  if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })

  void auditLog({
    tip: 'oto_yikama_durum_toggle',
    tablo: 'gorevler',
    firma_id: gorev.firma_id,
    kullanici_id: auth.user.id,
    detay: {
      gorev_id: params.id,
      plaka: meta.plaka_snapshot,
      eski_durum: gorev.durum,
      yeni_durum: yeniDurum,
    },
  })

  return NextResponse.json({ ok: true, yeni_durum: yeniDurum })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorize()
  if ('error' in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })

  const admin = createAdminClient()

  const { data: gorev } = await admin
    .from('gorevler')
    .select('id, firma_id, tanim')
    .eq('id', params.id)
    .single()
  if (!gorev) return NextResponse.json({ ok: false, error: 'Görev bulunamadı' }, { status: 404 })
  const scopeErr2 = scopeKontrol(auth.me, gorev.firma_id); if (scopeErr2) return scopeErr2

  const { data: meta } = await admin
    .from('oto_yikama_gorev_metadata')
    .select('gorev_id, plaka_snapshot')
    .eq('gorev_id', params.id)
    .maybeSingle()
  if (!meta) return NextResponse.json({ ok: false, error: 'Bu görev Oto Yıkama kaydı değil' }, { status: 400 })

  // metadata ON DELETE CASCADE FK ile gorevler'e bağlı → gorevler silinince otomatik silinir
  const { error: delErr } = await admin.from('gorevler').delete().eq('id', params.id)
  if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 })

  void auditLog({
    tip: 'oto_yikama_sil',
    tablo: 'gorevler',
    firma_id: gorev.firma_id,
    kullanici_id: auth.user.id,
    detay: { gorev_id: params.id, plaka: meta.plaka_snapshot, tanim: gorev.tanim },
  })

  return NextResponse.json({ ok: true })
}
