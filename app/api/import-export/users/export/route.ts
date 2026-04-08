import { NextRequest, NextResponse } from 'next/server'
import { requireImportScope } from '@/lib/import-export/auth'
import { buildXlsxBuffer } from '@/lib/import-export/xlsx'

export async function GET(req: NextRequest) {
  try {
    const scope = await requireImportScope(req.nextUrl.searchParams.get('firmaId'))
    const { data, error } = await scope.admin.from('users').select('isim_soyisim,email,telefon,aktif,ust_lokasyon_id,cinsiyet').eq('firma_id', scope.firmaId).in('rol', ['tenant_user', 'tenant_admin']).order('kayit_tarihi', { ascending: false })
    if (error) throw new Error(error.message)

    // Üst lokasyon ID → ad map
    const lokIds = [...new Set((data ?? []).map((u: any) => u.ust_lokasyon_id).filter(Boolean))]
    const lokMap = new Map<string, string>()
    if (lokIds.length > 0) {
      const { data: loks } = await scope.admin.from('lokasyonlar').select('id,tanim').in('id', lokIds)
      for (const l of loks ?? []) lokMap.set(l.id, l.tanim ?? '')
    }

    const file = await buildXlsxBuffer({ sheets: [{ name: 'Kullanicilar', headers: [
      { key: 'isim_soyisim', label: 'isim_soyisim', width: 28 },
      { key: 'email', label: 'email', width: 32 },
      { key: 'telefon', label: 'telefon', width: 18 },
      { key: 'aktif', label: 'aktif', width: 12 },
      { key: 'ust_lokasyon', label: 'ust_lokasyon', width: 24 },
      { key: 'cinsiyet', label: 'cinsiyet', width: 12 },
    ], rows: (data ?? []).map((x: any) => ({ ...x, aktif: x.aktif ? 'evet' : 'hayir', ust_lokasyon: x.ust_lokasyon_id ? lokMap.get(x.ust_lokasyon_id) ?? '' : '', cinsiyet: x.cinsiyet ?? '' })) }] })
    return new NextResponse(file, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="kullanicilar.xlsx"' } })
  } catch (e: any) {
    const status = e.message === 'Unauthorized' ? 401 : e.message.includes('Yetkisiz') ? 403 : 400
    return NextResponse.json({ error: e.message }, { status })
  }
}
