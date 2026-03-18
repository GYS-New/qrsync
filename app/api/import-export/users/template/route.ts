export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server'
import { buildXlsxBuffer } from '@/lib/import-export/xlsx'

export async function GET() {
  const file = await buildXlsxBuffer({
    sheets: [{
      name: 'Kullanicilar',
      headers: [
        { key: 'isim_soyisim', label: 'isim_soyisim', width: 28 },
        { key: 'email', label: 'email', width: 32 },
        { key: 'telefon', label: 'telefon', width: 18 },
        { key: 'password', label: 'password', width: 18 },
      ],
      rows: [
        { isim_soyisim: 'Örnek Kullanıcı', email: 'ornek@example.com', telefon: '05550000000', password: '123456' },
      ],
    }],
  })
  return new NextResponse(file, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="kullanici-import-sablonu.xlsx"' } })
}
