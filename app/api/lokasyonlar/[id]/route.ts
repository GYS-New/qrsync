import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

// Tüm alt lokasyon id'lerini DB'den recursive çeker
async function getAllDescendantIds(adminSb: ReturnType<typeof createAdminClient>, rootId: string, firmaId: string): Promise<string[]> {
  const { data } = await adminSb
    .from('lokasyonlar')
    .select('id, parent_id')
    .eq('firma_id', firmaId)

  if (!data) return [rootId]

  function collect(id: string): string[] {
    const children = data!.filter(l => l.parent_id === id).map(l => l.id)
    return [id, ...children.flatMap(collect)]
  }
  return collect(rootId)
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

    // 5. Çeklist kayıtlarını sil (aktif + arşiv)
    const { data: baslikIds } = await adminSb
      .from('checklist_sonuc_basliklari')
      .select('id')
      .in('lokasyon_id', allIds)
    if (baslikIds?.length) {
      const ids = baslikIds.map((b: any) => b.id)
      await adminSb.from('checklist_sonuc_maddeleri').delete().in('sonuc_id', ids)
    }
    await adminSb.from('checklist_sonuc_basliklari').delete().in('lokasyon_id', allIds)

    const { data: arsivBaslikIds } = await adminSb
      .from('checklist_sonuc_basliklari_arsiv')
      .select('id')
      .in('lokasyon_id', allIds)
    if (arsivBaslikIds?.length) {
      const ids = arsivBaslikIds.map((b: any) => b.id)
      await adminSb.from('checklist_sonuc_maddeleri_arsiv').delete().in('sonuc_id', ids)
    }
    await adminSb.from('checklist_sonuc_basliklari_arsiv').delete().in('lokasyon_id', allIds)

    // 6. canli_gorevler sil
    const { error: canliErr } = await adminSb
      .from('canli_gorevler')
      .delete()
      .in('lokasyon_id', allIds)
    if (canliErr) throw new Error('Canlı görevler silinirken hata: ' + canliErr.message)

    // 7. gorevler sil
    const { error: gorevErr } = await adminSb
      .from('gorevler')
      .delete()
      .in('lokasyon_id', allIds)
    if (gorevErr) throw new Error('Görevler silinirken hata: ' + gorevErr.message)

    // 8. Lokasyonları leaf → root sırasıyla sil
    const leafFirst = [...allIds].reverse()
    for (const id of leafFirst) {
      const { error: lokErr } = await adminSb
        .from('lokasyonlar')
        .delete()
        .eq('id', id)
      if (lokErr) throw new Error(`Lokasyon silinirken hata: ${lokErr.message}`)
    }

    return NextResponse.json({ ok: true, deleted: allIds.length, tanim: lok.tanim })
  } catch (err: any) {
    console.error('[lokasyon/delete]', err)
    return NextResponse.json({ error: err.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
