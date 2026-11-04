import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import { auditLog } from '@/lib/audit/log'

// Tüm alt lokasyon id'lerini DB'den recursive çeker.
// fetchAll ile 1000-row cap sessiz truncate'i aslindi (buyuk firmada agacin
// yarisi gorunmeyip DELETE eksik calisiyordu).
async function getAllDescendantIds(adminSb: ReturnType<typeof createAdminClient>, rootId: string, firmaId: string): Promise<string[]> {
  const data = await fetchAll<any>(() => adminSb
    .from('lokasyonlar')
    .select('id, parent_id')
    .eq('firma_id', firmaId)
    .order('id', { ascending: true })
  )

  if (!data || data.length === 0) return [rootId]

  function collect(id: string): string[] {
    const children = data.filter((l: any) => l.parent_id === id).map((l: any) => l.id)
    return [id, ...children.flatMap(collect)]
  }
  return collect(rootId)
}

// CHUNK helper: tekrarlanan .in(col, ids) delete/select calgirilari icin.
async function chunkedDelete(
  qFactory: (slice: string[]) => any,
  ids: string[],
  errorPrefix: string,
) {
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await qFactory(ids.slice(i, i + 100))
    if (error) throw new Error(`${errorPrefix}: ${error.message}`)
  }
}
async function chunkedSelect<T = any>(
  qFactory: (slice: string[]) => any,
  ids: string[],
): Promise<T[]> {
  const out: T[] = []
  const seen = new Set<string>()
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await qFactory(ids.slice(i, i + 100))
    for (const r of (data ?? []) as any[]) {
      if (r?.id && !seen.has(r.id)) { seen.add(r.id); out.push(r) }
    }
  }
  return out
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Oturumu doğrula
    const userSb = createClient()
    const { data: { user } } = await userSb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

    // 2. Kullanıcı rolü ve firma kontrolü
    const { data: me } = await userSb
      .from('users')
      .select('rol, firma_id')
      .eq('id', user.id)
      .single()

    if (!me || !['tenant_admin', 'super_admin'].includes(me.rol)) {
      return NextResponse.json({ error: 'Bu işlem için yetkiniz yok' }, { status: 403 })
    }

    const lokId = params.id
    const adminSb = createAdminClient()

    // 3. Lokasyonun bu firmaya ait olduğunu doğrula
    const { data: lok } = await adminSb
      .from('lokasyonlar')
      .select('id, firma_id, tanim')
      .eq('id', lokId)
      .single()

    if (!lok) return NextResponse.json({ error: 'Lokasyon bulunamadı' }, { status: 404 })

    // TA sadece kendi firmasını silebilir
    if (me.rol === 'tenant_admin' && lok.firma_id !== me.firma_id) {
      return NextResponse.json({ error: 'Bu lokasyon size ait değil' }, { status: 403 })
    }

    const firmaId = lok.firma_id

    // 4. Tüm alt lokasyonları bul
    const allIds = await getAllDescendantIds(adminSb, lokId, firmaId)

    // 5. Çeklist kayıtlarını sil (aktif + arşiv) — CHUNK-AWARE
    const baslikIds = await chunkedSelect<{ id: string }>(
      (slice) => adminSb.from('checklist_sonuc_basliklari').select('id').in('lokasyon_id', slice),
      allIds,
    )
    if (baslikIds.length) {
      const ids = baslikIds.map((b: any) => b.id)
      await chunkedDelete(
        (slice) => adminSb.from('checklist_sonuc_maddeleri').delete().in('sonuc_id', slice),
        ids,
        'Çeklist maddeleri silinirken hata',
      )
    }
    await chunkedDelete(
      (slice) => adminSb.from('checklist_sonuc_basliklari').delete().in('lokasyon_id', slice),
      allIds,
      'Çeklist başlıkları silinirken hata',
    )

    const arsivBaslikIds = await chunkedSelect<{ id: string }>(
      (slice) => adminSb.from('checklist_sonuc_basliklari_arsiv').select('id').in('lokasyon_id', slice),
      allIds,
    )
    if (arsivBaslikIds.length) {
      const ids = arsivBaslikIds.map((b: any) => b.id)
      await chunkedDelete(
        (slice) => adminSb.from('checklist_sonuc_maddeleri_arsiv').delete().in('sonuc_id', slice),
        ids,
        'Arşiv çeklist maddeleri silinirken hata',
      )
    }
    await chunkedDelete(
      (slice) => adminSb.from('checklist_sonuc_basliklari_arsiv').delete().in('lokasyon_id', slice),
      allIds,
      'Arşiv çeklist başlıkları silinirken hata',
    )

    // 6. canli_gorevler sil — CHUNK-AWARE
    await chunkedDelete(
      (slice) => adminSb.from('canli_gorevler').delete().in('lokasyon_id', slice),
      allIds,
      'Canlı görevler silinirken hata',
    )

    // 7. gorevler sil — CHUNK-AWARE
    await chunkedDelete(
      (slice) => adminSb.from('gorevler').delete().in('lokasyon_id', slice),
      allIds,
      'Görevler silinirken hata',
    )

    // 8. Lokasyonları leaf → root sırasıyla sil
    const leafFirst = [...allIds].reverse()
    for (const id of leafFirst) {
      const { error: lokErr } = await adminSb
        .from('lokasyonlar')
        .delete()
        .eq('id', id)
      if (lokErr) throw new Error(`Lokasyon silinirken hata: ${lokErr.message}`)
    }

    await auditLog({
      tip: 'lokasyon_sil', tablo: 'lokasyonlar', satir_sayisi: allIds.length,
      kullanici_id: user.id, firma_id: firmaId,
      detay: {
        silinen_id: lokId,
        silinen_tanim: lok.tanim,
        alt_lokasyon_sayisi: allIds.length - 1,
        uyarı: 'Alt lokasyonlar, çeklist kayıtları ve görevler cascade silindi',
      },
    })

    return NextResponse.json({ ok: true, deleted: allIds.length, tanim: lok.tanim })
  } catch (err: any) {
    console.error('[lokasyon/delete]', err)
    try {
      const userSb = createClient()
      const { data: { user } } = await userSb.auth.getUser()
      await auditLog({
        tip: 'lokasyon_sil', tablo: 'lokasyonlar', basarili: false, hata_mesaji: err?.message ?? 'hata',
        kullanici_id: user?.id ?? null,
        detay: { silinen_id: params.id },
      })
    } catch {}
    return NextResponse.json({ error: err.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
