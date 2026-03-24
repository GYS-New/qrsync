import { NextRequest, NextResponse } from 'next/server'
import { requireImportScope } from '@/lib/import-export/auth'
import { buildXlsxBuffer } from '@/lib/import-export/xlsx'

function buildPathMap(rows: any[]) {
  const map = new Map(rows.map((x) => [x.id, x]))
  const pathOf = (id: string | null | undefined) => {
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
    return parts.reverse()
  }
  return pathOf
}

export async function GET(req: NextRequest) {
  try {
    const scope = await requireImportScope(req.nextUrl.searchParams.get('firmaId'))
    const projeIdParam = req.nextUrl.searchParams.get('proje_id') ?? null

    let lokQuery = scope.admin.from('lokasyonlar').select('id,parent_id,tanim,aciklama,aktif,sureli_gorev_aktif').eq('firma_id', scope.firmaId).order('kayit_tarihi', { ascending: true })
    if (projeIdParam) lokQuery = (lokQuery as any).eq('proje_id', projeIdParam)

    const [lokRes, groupsRes, membersRes] = await Promise.all([
      lokQuery,
      scope.admin.from('lokasyon_gruplari').select('id,ad,ust_lokasyon_id').eq('firma_id', scope.firmaId),
      scope.admin.from('lokasyon_grup_uyeleri').select('grup_id,lokasyon_id'),
    ])
    if (lokRes.error) throw new Error(lokRes.error.message)
    if (groupsRes.error) throw new Error(groupsRes.error.message)
    if (membersRes.error) throw new Error(membersRes.error.message)

    // lokasyon_id → grup adı map
    const grupMap = new Map<string, string>()
    for (const member of membersRes.data ?? []) {
      const group = (groupsRes.data ?? []).find((g: any) => g.id === member.grup_id)
      if (group) grupMap.set(member.lokasyon_id, group.ad)
    }

    const pathOf = buildPathMap(lokRes.data ?? [])
    const rows = (lokRes.data ?? []).map((x: any) => {
      const parts = pathOf(x.id)
      return {
        seviye_1: parts[0] ?? '',
        seviye_2: parts[1] ?? '',
        seviye_3: parts[2] ?? '',
        aciklama: x.aciklama ?? '',
        aktif: x.aktif ? 'evet' : 'hayir',
        sureli_gorev_aktif: x.sureli_gorev_aktif ? 'evet' : 'hayir',
        grup: grupMap.get(x.id) ?? '',
      }
    })
    const file = await buildXlsxBuffer({ sheets: [{ name: 'Lokasyonlar', headers: [
      { key: 'seviye_1', label: 'seviye_1', width: 22 },
      { key: 'seviye_2', label: 'seviye_2', width: 22 },
      { key: 'seviye_3', label: 'seviye_3', width: 22 },
      { key: 'aciklama', label: 'aciklama', width: 28 },
      { key: 'aktif', label: 'aktif', width: 12 },
      { key: 'sureli_gorev_aktif', label: 'sureli_gorev_aktif', width: 18 },
      { key: 'grup', label: 'grup', width: 28 },
    ], rows }] })
    return new NextResponse(file, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': 'attachment; filename="lokasyonlar.xlsx"' } })
  } catch (e: any) {
    const status = e.message === 'Unauthorized' ? 401 : e.message.includes('Yetkisiz') ? 403 : 400
    return NextResponse.json({ error: e.message }, { status })
  }
}
