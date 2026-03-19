import { NextRequest, NextResponse } from 'next/server'
import { requireImportScope } from '@/lib/import-export/auth'
import { buildXlsxBuffer } from '@/lib/import-export/xlsx'

export async function GET(req: NextRequest) {
  try {
    const scope = await requireImportScope(req.nextUrl.searchParams.get('firmaId'))
    const { data, error } = await scope.admin.from('users').select('isim_soyisim,email,telefon,aktif').eq('firma_id', scope.firmaId).in('rol', ['tenant_user', 'tenant_admin']).order('kayit_tarihi', { ascending: false })
    if (error) throw new Error(error.message)
    const file = await buildXlsxBuffer({ sheets: [{ name: 'Kullanicilar', headers: [
      { key: 'isim_soyisim', label: 'isim_soyisim', width: 28 },
      { key: 'email', label: 'email', width: 32 },
      { key: 'telefon', label: 'telefon', width: 18 },
      { key: 'aktif', label: 'aktif', width: 12 },
    ], rows: (data ?? []).map((x: any) => ({ ...x, aktif: x.aktif ? 'evet' : 'hayir' })) }] })
    return new NextResponse(new Uint8Array(file), { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="kullanicilar.xlsx"' } })
  } catch (e: any) {
    const status = e.message === 'Unauthorized' ? 401 : e.message.includes('Yetkisiz') ? 403 : 400
    return NextResponse.json({ error: e.message }, { status })
  }
}
