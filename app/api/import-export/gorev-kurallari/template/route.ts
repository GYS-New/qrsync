import { NextResponse } from 'next/server'
import { buildXlsxBuffer } from '@/lib/import-export/xlsx'

export async function GET() {
  const file = await buildXlsxBuffer({
    sheets: [{
      name: 'GorevKurallari',
      headers: [
        { key: 'tanim',                 label: 'tanim',                 width: 30 },
        { key: 'lokasyon_yolu',          label: 'lokasyon_yolu',          width: 36 },
        { key: 'atanan_email',           label: 'atanan_email',           width: 28 },
        { key: 'gunluk_frekans_sayisi',  label: 'gunluk_frekans_sayisi',  width: 22 },
        { key: 'gorev_gunleri',          label: 'gorev_gunleri',          width: 30 },
        { key: 'aktif_olma_saati',       label: 'aktif_olma_saati',       width: 16 },
        { key: 'baslangic_tarihi',       label: 'baslangic_tarihi',       width: 18 },
        { key: 'bitis_tarihi',           label: 'bitis_tarihi',           width: 18 },
      ],
      rows: [
        {
          tanim: 'WC Temizlik',
          lokasyon_yolu: 'Merkez / Zemin / WC',
          atanan_email: '',
          gunluk_frekans_sayisi: 3,
          gorev_gunleri: 'Pzt,Sal,Car,Per,Cum',
          aktif_olma_saati: '08:00',
          baslangic_tarihi: new Date().toISOString().slice(0, 10),
          bitis_tarihi: '',
        },
        {
          tanim: 'Güvenlik Turu',
          lokasyon_yolu: 'Merkez / Giriş',
          atanan_email: 'guvenlik@example.com',
          gunluk_frekans_sayisi: 1,
          gorev_gunleri: 'Pzt,Sal,Car,Per,Cum,Cmt,Paz',
          aktif_olma_saati: '09:00',
          baslangic_tarihi: new Date().toISOString().slice(0, 10),
          bitis_tarihi: '',
        },
      ],
    }],
  })
  return new NextResponse(file, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="gorev-kural-sablonu.xlsx"',
    },
  })
}
