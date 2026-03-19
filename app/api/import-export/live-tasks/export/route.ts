import { NextRequest, NextResponse } from 'next/server'
import { requireImportScope } from '@/lib/import-export/auth'
import { buildXlsxBuffer } from '@/lib/import-export/xlsx'

const GUN_KISALTMA = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

function createPathResolver(rows: any[]) {
  const map = new Map(rows.map((x) => [x.id, x]))
  return (id: string | null | undefined) => {
    const parts: string[] = []
    let cur = id || null
    let guard = 0
    while (cur && guard < 10) {
      const item = map.get(cur)
      if (!item) break
      parts.push(item.tanim)
      cur = item.parent_id
      guard++
    }
    return parts.reverse().join(' / ')
  }
}

export async function GET(req: NextRequest) {
  try {
    const scope = await requireImportScope(req.nextUrl.searchParams.get('firmaId'))

    const [{ data: locs, error: locErr }, { data: gorevler, error: gorevErr }, { data: kuralar, error: kuralErr }] = await Promise.all([
      scope.admin.from('lokasyonlar').select('id,parent_id,tanim').eq('firma_id', scope.firmaId),
      scope.admin.from('canli_gorevler')
        .select('tanim,lokasyon_id,aktif_olma_tarihi,gunluk_frekans_sayisi,atanan:users!atanan_kullanici_id(email)')
        .eq('firma_id', scope.firmaId).order('aktif_olma_tarihi', { ascending: false }),
      scope.admin.from('gorev_kurallari')
        .select('tanim,lokasyon_id,aktif_gunler,gunluk_frekans_sayisi,aktif_olma_saati,baslangic_tarihi,bitis_tarihi,aktif,atanan:users!gorev_kurallari_atanan_kullanici_id_fkey(email)')
        .eq('firma_id', scope.firmaId).order('kayit_tarihi', { ascending: false }),
    ])
    if (locErr) throw new Error(locErr.message)
    if (gorevErr) throw new Error(gorevErr.message)

    const pathOf = createPathResolver(locs ?? [])

    // Sheet 1: aktif canli_gorevler (bugünkü görevler)
    const gorevRows = (gorevler ?? []).map((x: any) => ({
      tanim: x.tanim,
      lokasyon_yolu: pathOf(x.lokasyon_id),
      atanan_email: x.atanan?.email ?? '',
      aktif_olma_tarihi: x.aktif_olma_tarihi?.slice(0, 16)?.replace('T', ' ') ?? '',
      gunluk_frekans_sayisi: x.gunluk_frekans_sayisi || '',
    }))

    // Sheet 2: gorev_kurallari (kalıcı kurallar)
    const kuralRows = (kuralar ?? []).map((x: any) => ({
      tanim: x.tanim,
      lokasyon_yolu: pathOf(x.lokasyon_id),
      atanan_email: (x.atanan as any)?.email ?? '',
      aktif_olma_saati: x.aktif_olma_saati?.slice(0, 5) ?? '',
      gunluk_frekans_sayisi: x.gunluk_frekans_sayisi,
      gorev_gunleri: (x.aktif_gunler ?? []).map((g: number) => GUN_KISALTMA[g]).join(','),
      baslangic_tarihi: x.baslangic_tarihi ?? '',
      bitis_tarihi: x.bitis_tarihi ?? '',
      aktif: x.aktif ? 'evet' : 'hayir',
    }))

    const file = await buildXlsxBuffer({
      sheets: [
        {
          name: 'Bugunun Gorevleri',
          headers: [
            { key: 'tanim', label: 'tanim', width: 30 },
            { key: 'lokasyon_yolu', label: 'lokasyon_yolu', width: 36 },
            { key: 'atanan_email', label: 'atanan_email', width: 30 },
            { key: 'aktif_olma_tarihi', label: 'aktif_olma_tarihi', width: 24 },
            { key: 'gunluk_frekans_sayisi', label: 'gunluk_frekans_sayisi', width: 22 },
          ],
          rows: gorevRows,
        },
        {
          name: 'Gorev Kurallari',
          headers: [
            { key: 'tanim', label: 'tanim', width: 30 },
            { key: 'lokasyon_yolu', label: 'lokasyon_yolu', width: 36 },
            { key: 'atanan_email', label: 'atanan_email', width: 30 },
            { key: 'aktif_olma_saati', label: 'aktif_olma_saati', width: 16 },
            { key: 'gunluk_frekans_sayisi', label: 'gunluk_frekans_sayisi', width: 22 },
            { key: 'gorev_gunleri', label: 'gorev_gunleri', width: 30 },
            { key: 'baslangic_tarihi', label: 'baslangic_tarihi', width: 18 },
            { key: 'bitis_tarihi', label: 'bitis_tarihi', width: 18 },
            { key: 'aktif', label: 'aktif', width: 10 },
          ],
          rows: kuralRows,
        },
      ],
    })

    return new NextResponse(new Uint8Array(file), {
      headers: {
        'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition': 'attachment; filename="canli-gorevler-ve-kurallar.xlsx"',
      },
    })
  } catch (e: any) {
    const status = e.message === 'Unauthorized' ? 401 : e.message.includes('Yetkisiz') ? 403 : 400
    return NextResponse.json({ error: e.message }, { status })
  }
}
