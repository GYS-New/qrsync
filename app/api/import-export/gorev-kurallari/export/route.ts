import { NextRequest, NextResponse } from 'next/server'
import { requireImportScope } from '@/lib/import-export/auth'
import { buildXlsxBuffer } from '@/lib/import-export/xlsx'

const GUN_KISALT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

function pathResolver(locs: any[]) {
  const m = new Map(locs.map(l => [l.id, l]))
  return (id: string) => {
    const parts: string[] = []; let cur: string | null = id; let g = 0
    while (cur && g++ < 10) { const l = m.get(cur); if (!l) break; parts.push(l.tanim); cur = l.parent_id }
    return parts.reverse().join(' / ')
  }
}

export async function GET(req: NextRequest) {
  try {
    const scope = await requireImportScope(req.nextUrl.searchParams.get('firmaId'))
    const [{ data: locs, error: le }, { data: kuralar, error: ke }] = await Promise.all([
      scope.admin.from('lokasyonlar').select('id,parent_id,tanim').eq('firma_id', scope.firmaId),
      scope.admin.from('gorev_kurallari')
        .select('tanim,lokasyon_id,aktif_gunler,gunluk_frekans_sayisi,aktif_olma_saati,baslangic_tarihi,bitis_tarihi,aktif,atanan:users!gorev_kurallari_atanan_kullanici_id_fkey(email)')
        .eq('firma_id', scope.firmaId)
        .order('kayit_tarihi', { ascending: false }),
    ])
    if (le) throw new Error(le.message)
    if (ke) throw new Error(ke.message)

    const pathOf = pathResolver(locs ?? [])
    const rows = (kuralar ?? []).map((k: any) => ({
      tanim: k.tanim,
      lokasyon_yolu: pathOf(k.lokasyon_id),
      atanan_email: k.atanan?.email ?? '',
      gunluk_frekans_sayisi: k.gunluk_frekans_sayisi,
      gorev_gunleri: (k.aktif_gunler ?? []).map((g: number) => GUN_KISALT[g]).join(','),
      aktif_olma_saati: k.aktif_olma_saati?.slice(0, 5) ?? '',
      baslangic_tarihi: k.baslangic_tarihi ?? '',
      bitis_tarihi: k.bitis_tarihi ?? '',
      aktif: k.aktif ? 'evet' : 'hayir',
    }))

    const file = await buildXlsxBuffer({
      sheets: [{
        name: 'GorevKurallari',
        headers: [
          { key: 'tanim',                label: 'tanim',                width: 30 },
          { key: 'lokasyon_yolu',         label: 'lokasyon_yolu',         width: 36 },
          { key: 'atanan_email',          label: 'atanan_email',          width: 28 },
          { key: 'gunluk_frekans_sayisi', label: 'gunluk_frekans_sayisi', width: 22 },
          { key: 'gorev_gunleri',         label: 'gorev_gunleri',         width: 28 },
          { key: 'aktif_olma_saati',      label: 'aktif_olma_saati',      width: 16 },
          { key: 'baslangic_tarihi',      label: 'baslangic_tarihi',      width: 18 },
          { key: 'bitis_tarihi',          label: 'bitis_tarihi',          width: 18 },
          { key: 'aktif',                 label: 'aktif',                 width: 10 },
        ],
        rows,
      }],
    })
    return new NextResponse(file, {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="gorev-kurallari.xlsx"',
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 })
  }
}
