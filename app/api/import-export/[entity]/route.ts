import { NextResponse } from 'next/server'
import {
  buildExportFile,
  buildTemplateFile,
  getActorAndFirma,
  importFromXml,
  type ImportEntity,
} from '@/lib/import-export/config'

function isEntity(value: string): value is ImportEntity {
  return value === 'users' || value === 'locations' || value === 'live-tasks'
}

export async function GET(req: Request, { params }: { params: { entity: string } }) {
  try {
    if (!isEntity(params.entity)) {
      return NextResponse.json({ error: 'Geçersiz entity' }, { status: 404 })
    }

    const { searchParams } = new URL(req.url)
    const mode = searchParams.get('mode')
    const requestedFirmaId = searchParams.get('firmaId')

    const { firmaId } = await getActorAndFirma(requestedFirmaId, params.entity)
    const file = mode === 'export' ? await buildExportFile(params.entity, firmaId) : buildTemplateFile(params.entity)

    return new NextResponse(file.xml, {
      status: 200,
      headers: {
        'content-type': 'application/vnd.ms-excel; charset=utf-8',
        'content-disposition': `attachment; filename="${file.fileName}"`,
        'cache-control': 'no-store',
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'İşlem başarısız' }, { status: 400 })
  }
}

export async function POST(req: Request, { params }: { params: { entity: string } }) {
  try {
    if (!isEntity(params.entity)) {
      return NextResponse.json({ error: 'Geçersiz entity' }, { status: 404 })
    }

    const form = await req.formData()
    const requestedFirmaId = String(form.get('firmaId') ?? '') || null
    const file = form.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Dosya bulunamadı.' }, { status: 400 })
    }

    const { actor, firmaId } = await getActorAndFirma(requestedFirmaId, params.entity)
    const content = await file.text()
    const result = await importFromXml(params.entity, firmaId, actor, content)

    return NextResponse.json({ ok: true, ...result })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'İçe aktarım başarısız' }, { status: 400 })
  }
}
