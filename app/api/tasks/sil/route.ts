/**
 * POST /api/tasks/sil
 * body: { ids: string[], tablo: 'gorevler' | 'gorevler_arsiv' | 'canli_gorevler' | 'canli_gorevler_arsiv', firma_id }
 *
 * Görevi silerken ilgili checklist kayıtlarını da cascade siler.
 * Çeklistler hem aktif hem arşiv tablolarında aranır.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'

type GorevTablo = 'gorevler' | 'gorevler_arsiv' | 'canli_gorevler' | 'canli_gorevler_arsiv'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const admin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

    const { data: me } = await supabase
      .from('users').select('id,rol,firma_id').eq('id', user.id).single()
    if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const isTA = me.rol === 'tenant_admin'
    if (!isSA && !isTA) return NextResponse.json({ error: 'Yetki yetersiz' }, { status: 403 })

    const body = await req.json()
    const { ids, tablo, firma_id }: { ids: string[], tablo: GorevTablo, firma_id?: string } = body

    if (!ids?.length) return NextResponse.json({ error: 'ids gerekli' }, { status: 400 })
    if (!tablo) return NextResponse.json({ error: 'tablo gerekli' }, { status: 400 })

    const hedefFirmaId = isSA ? firma_id : me.firma_id
    if (!hedefFirmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

    // TA güvenliği: silmek istediği görevlerin firma_id'si kontrolü
    if (isTA) {
      const { data: gorevler } = await admin
        .from(tablo).select('id,firma_id').in('id', ids)
      const yabanci = (gorevler ?? []).find((g: any) => g.firma_id !== hedefFirmaId)
      if (yabanci) return NextResponse.json({ error: 'Bu göreve erişim yetkiniz yok' }, { status: 403 })
    }

    const isCanli = tablo === 'canli_gorevler' || tablo === 'canli_gorevler_arsiv'
    const fkKolonu = isCanli ? 'canli_gorev_id' : 'gorev_id'

    // 1. Aktif checklist kayıtlarını sil
    const { data: aktifBasliklar } = await admin
      .from('checklist_sonuc_basliklari').select('id').in(fkKolonu, ids)
    if (aktifBasliklar?.length) {
      const baslikIds = aktifBasliklar.map((b: any) => b.id)
      await admin.from('checklist_sonuc_maddeleri').delete().in('sonuc_id', baslikIds)
    }
    await admin.from('checklist_sonuc_basliklari').delete().in(fkKolonu, ids)

    // 2. Arşiv checklist kayıtlarını sil
    const { data: arsivBasliklar } = await admin
      .from('checklist_sonuc_basliklari_arsiv').select('id').in(fkKolonu, ids)
    if (arsivBasliklar?.length) {
      const baslikIds = arsivBasliklar.map((b: any) => b.id)
      await admin.from('checklist_sonuc_maddeleri_arsiv').delete().in('sonuc_id', baslikIds)
    }
    await admin.from('checklist_sonuc_basliklari_arsiv').delete().in(fkKolonu, ids)

    // 3. Görevi sil
    const { error: gorevErr } = await admin.from(tablo).delete().in('id', ids)
    if (gorevErr) throw gorevErr

    // Audit log
    const isArsiv = tablo === 'gorevler_arsiv' || tablo === 'canli_gorevler_arsiv'
    const tip = isCanli
      ? (isArsiv ? 'canli_gorev_arsiv_sil' : 'canli_gorev_sil')
      : (isArsiv ? 'gorev_arsiv_sil' : 'gorev_sil')
    await auditLog({
      tip, tablo, satir_sayisi: ids.length,
      kullanici_id: user.id, firma_id: hedefFirmaId,
      detay: {
        silinen_sayi: ids.length,
        ornek_ids: ids.slice(0, 10),
        cekList_aktif_sil: aktifBasliklar?.length ?? 0,
        ceklist_arsiv_sil: arsivBasliklar?.length ?? 0,
      },
    })

    return NextResponse.json({ ok: true, silinen: ids.length })
  } catch (err: any) {
    console.error('[tasks/sil]', err)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      await auditLog({
        tip: 'gorev_sil', tablo: 'gorevler', basarili: false, hata_mesaji: err?.message ?? 'hata',
        kullanici_id: user?.id ?? null,
      })
    } catch {}
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
