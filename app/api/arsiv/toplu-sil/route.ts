/**
 * POST /api/arsiv/toplu-sil
 *
 * Mesai ve müşteri arşiv kayıtlarını admin client ile siler (RLS bypass).
 * Spesifik/frekansiyel görev arşivleri için /api/tasks/sil kullanılır
 * (checklist cascade gerekiyor).
 *
 * Body:
 *   {
 *     tip: 'mesai' | 'musteri',
 *     firma_id: string,
 *     proje_id?: string,
 *     from?: ISO,
 *     to?: ISO,
 *   }
 *
 * Yanıt:
 *   { ok: true, silinen: number }
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit/log'

type Tip = 'mesai' | 'musteri'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient()
    const admin = createAdminClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

    const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', user.id).single()
    if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

    const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
    const isTA = me.rol === 'tenant_admin'
    if (!isSA && !isTA) return NextResponse.json({ error: 'Yetki yetersiz' }, { status: 403 })

    const body = await req.json()
    const { tip, firma_id, proje_id, from, to } = body as { tip: Tip; firma_id?: string; proje_id?: string; from?: string; to?: string }

    if (tip !== 'mesai' && tip !== 'musteri') {
      return NextResponse.json({ error: `Geçersiz tip: "${tip}". 'mesai' veya 'musteri' olmalı.` }, { status: 400 })
    }
    const hedefFirmaId = isSA ? firma_id : me.firma_id
    if (!hedefFirmaId) return NextResponse.json({ error: 'Firma ID gerekli' }, { status: 400 })

    // 1. Aktif tabloda hâlâ arsivlendi=true kayıtlar olabilir (eski şema artığı) — onları da sil
    // 2. Asıl arşiv tablosunu sil
    const aktifTablo = tip === 'mesai' ? 'personel_mesai_kayitlari' : 'musteri_degerlendirmeleri'
    const arsivTablo = tip === 'mesai' ? 'personel_mesai_kayitlari_arsiv' : 'musteri_degerlendirmeleri_arsiv'
    const tarihKolonu = tip === 'mesai' ? 'giris_saati' : 'olusturma_tarihi'

    // Aktif tablodaki arsivlendi=true (eski model artığı)
    let aktifQ = admin.from(aktifTablo).delete({ count: 'exact' }).eq('firma_id', hedefFirmaId).eq('arsivlendi', true)
    if (proje_id) aktifQ = (aktifQ as any).eq('proje_id', proje_id)
    if (from) aktifQ = (aktifQ as any).gte(tarihKolonu, from)
    if (to)   aktifQ = (aktifQ as any).lte(tarihKolonu, to)
    const { count: aktifSilinen, error: aktifErr } = await aktifQ
    if (aktifErr) throw aktifErr

    // Asıl arşiv tablo
    let arsivQ = admin.from(arsivTablo).delete({ count: 'exact' }).eq('firma_id', hedefFirmaId)
    if (proje_id) arsivQ = (arsivQ as any).eq('proje_id', proje_id)
    if (from) arsivQ = (arsivQ as any).gte(tarihKolonu, from)
    if (to)   arsivQ = (arsivQ as any).lte(tarihKolonu, to)
    const { count: arsivSilinen, error: arsivErr } = await arsivQ
    if (arsivErr) throw arsivErr

    const toplam = (aktifSilinen ?? 0) + (arsivSilinen ?? 0)

    void auditLog({
      tip: tip === 'mesai' ? 'mesai_arsiv_toplu_sil' : 'musteri_arsiv_toplu_sil',
      tablo: arsivTablo, satir_sayisi: toplam,
      kullanici_id: user.id, firma_id: hedefFirmaId, proje_id: proje_id ?? null,
      detay: { aktif_silinen: aktifSilinen ?? 0, arsiv_silinen: arsivSilinen ?? 0, from, to },
    })

    return NextResponse.json({ ok: true, silinen: toplam, aktif: aktifSilinen ?? 0, arsiv: arsivSilinen ?? 0 })
  } catch (err: any) {
    console.error('[arsiv/toplu-sil]', err)
    return NextResponse.json({ error: err?.message ?? 'Sunucu hatası' }, { status: 500 })
  }
}
