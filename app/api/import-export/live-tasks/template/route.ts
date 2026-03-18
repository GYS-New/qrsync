import { NextResponse } from 'next/server'
import { buildXlsxBuffer } from '@/lib/import-export/xlsx'

export async function GET() {
  const file = await buildXlsxBuffer({
    sheets: [{
      name: 'CanliGorevler',
      headers: [
        { key: 'tanim',                label: 'tanim',                width: 30 },
        { key: 'lokasyon_yolu',        label: 'lokasyon_yolu',        width: 36 },
        { key: 'atanan_email',         label: 'atanan_email',         width: 30 },
        { key: 'aktif_olma_tarihi',    label: 'aktif_olma_tarihi',    width: 24 },
        { key: 'gunluk_frekans_sayisi',label: 'gunluk_frekans_sayisi',width: 22 },
        { key: 'gorev_gunleri',        label: 'gorev_gunleri',        width: 30 },
        { key: 'bitis_tarihi',         label: 'bitis_tarihi',         width: 18 },
      ],
      rows: [
        {
          // TEKİL GÖREV: gunluk_frekans_sayisi ve gorev_gunleri boş bırakılır
          tanim: 'Günlük kontrol',
          lokasyon_yolu: 'Merkez / Kat 1 / Depo',
          atanan_email: 'ornek@example.com',
          aktif_olma_tarihi: '2026-03-10 09:00',
          gunluk_frekans_sayisi: '',
          gorev_gunleri: '',
          bitis_tarihi: '',
        },
        {
          // FREKANS KURALI: gunluk_frekans_sayisi + gorev_gunleri dolu olursa
          // → gorev_kurallari tablosuna kural yazılır, her gece otomatik görev üretilir
          // bitis_tarihi boş bırakılırsa kural süresiz devam eder
          tanim: 'WC Temizlik',
          lokasyon_yolu: 'Merkez / Zemin / WC',
          atanan_email: '',
          aktif_olma_tarihi: '2026-03-10 08:00',
          gunluk_frekans_sayisi: 3,
          gorev_gunleri: 'Pzt,Sal,Car,Per,Cum',
          bitis_tarihi: '',
        },
      ],
    }],
  })
  return new NextResponse(file, {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': 'attachment; filename="canli-gorev-import-sablonu.xlsx"',
    },
  })
}
