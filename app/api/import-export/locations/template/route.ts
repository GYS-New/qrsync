export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server'
import { buildXlsxBuffer } from '@/lib/import-export/xlsx'

export async function GET() {
  const file = await buildXlsxBuffer({
    sheets: [{
      name: 'Lokasyonlar',
      headers: [
        { key: 'seviye_1', label: 'seviye_1', width: 22 },
        { key: 'seviye_2', label: 'seviye_2', width: 22 },
        { key: 'seviye_3', label: 'seviye_3', width: 22 },
        { key: 'aciklama', label: 'aciklama', width: 28 },
        { key: 'aktif', label: 'aktif', width: 12 },
        { key: 'sureli_gorev_aktif', label: 'sureli_gorev_aktif', width: 18 },
        { key: 'grup', label: 'grup', width: 28 },
      ],
      rows: [
        { seviye_1: 'Merkez', seviye_2: 'Kat 1', seviye_3: 'Depo', aciklama: 'Örnek lokasyon', aktif: 'evet', sureli_gorev_aktif: 'evet', grup: 'Depo Grubu' },
      ],
    }],
  })
  return new NextResponse(file, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="lokasyon-import-sablonu.xlsx"' } })
}
