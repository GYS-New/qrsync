import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { resolveScanContext } from '@/lib/scan/core'
import { completeTask } from '@/lib/tasks/completeTask'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Device-Token',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

async function getAuthUser(req: Request) {
  const deviceToken = req.headers.get('X-Device-Token')
  if (deviceToken) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('device_tokens')
      .select('user_id, aktif')
      .eq('device_token', deviceToken)
      .single()
    if (!data) return NextResponse.json({ ok: false, error: 'Geçersiz cihaz token', kod: 'ESLESMEDI' }, { status: 401, headers: CORS_HEADERS })
    if (!data.aktif) return NextResponse.json({ ok: false, error: 'Cihaz devre dışı', kod: 'ESLESMEDI' }, { status: 401, headers: CORS_HEADERS })
    return { id: data.user_id }
  }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const authResult = await getAuthUser(req)
  if (!authResult) return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401, headers: CORS_HEADERS })
  if (authResult instanceof NextResponse) return authResult
  const user = authResult as { id: string }
  try {
    const supabase = createAdminClient()
    const context = await resolveScanContext({ supabase, token: params.token, kanal: 'QR', userId: user.id })
    return NextResponse.json({ ok: true, ...context }, { headers: CORS_HEADERS })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'İşlem başarısız' }, { status: 400, headers: CORS_HEADERS })
  }
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const authResult = await getAuthUser(req)
  if (!authResult) return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401, headers: CORS_HEADERS })
  if (authResult instanceof NextResponse) return authResult
  const user = authResult as { id: string }

  try {
    const body = await req.json().catch(() => ({}))
    const selectedTaskId = body?.taskId as string | undefined
    const selectedTaskType = body?.taskType as 'gorevler' | 'canli_gorevler' | undefined
    const checklistResults = Array.isArray(body?.checklistResults) ? body.checklistResults : []
    const action = body?.action as string | undefined // 'basla' veya undefined (tamamla)

    const supabase = createAdminClient()
    const context = await resolveScanContext({ supabase, token: params.token, kanal: 'QR', userId: user.id })
    const task = context.tasks.find((t) => t.id === selectedTaskId && t.taskType === selectedTaskType)

    if (!task) {
      return NextResponse.json({ ok: false, error: 'Görev bulunamadı veya erişim yok' }, { status: 404, headers: CORS_HEADERS })
    }

    // ── GÖREVE BAŞLA ──────────────────────────────────────────────────────────
    if (action === 'basla') {
      const nowIso = new Date().toISOString()
      const table = selectedTaskType === 'gorevler' ? 'gorevler' : 'canli_gorevler'
      await supabase.from(table as any).update({
        baslatilma_tarihi: nowIso,
        durum: selectedTaskType === 'gorevler' ? 'ISLEMDE' : 'ACIK',
      } as any).eq('id', selectedTaskId!)
      return NextResponse.json({ ok: true, message: 'Görev başlatıldı', baslatilma_tarihi: nowIso }, { headers: CORS_HEADERS })
    }

    // ── GÖREVİ TAMAMLA ───────────────────────────────────────────────────────
    if (context.checklistTemplate?.items?.length) {
      const missingRequired = context.checklistTemplate.items.filter(
        (item) => item.zorunlu && !checklistResults.some((r: any) => r?.itemId === item.id && r?.durum === true)
      )
      if (missingRequired.length) {
        return NextResponse.json({ ok: false, error: 'Zorunlu checklist maddeleri tamamlanmalı' }, { status: 400, headers: CORS_HEADERS })
      }
      const insertPayload = checklistResults
        .filter((r: any) => r?.itemId)
        .map((r: any) => ({
          task_id: task.id,
          task_type: task.taskType,
          item_id: r.itemId,
          durum: !!r.durum,
          not_metni: typeof r.not === 'string' && r.not.trim() ? r.not.trim() : null,
          kullanici_id: user.id,
          tarih: new Date().toISOString(),
          kanal: 'QR',
        }))
      if (insertPayload.length) {
        const { error } = await supabase.from('checklist_results').insert(insertPayload as any)
        if (error) throw new Error(error.message)
      }
    }

    await completeTask({ supabase, taskId: task.id, taskType: task.taskType, userId: user.id, channel: 'QR' })
    return NextResponse.json({ ok: true, message: 'Görev QR ile tamamlandı' }, { headers: CORS_HEADERS })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'İşlem başarısız' }, { status: 400, headers: CORS_HEADERS })
  }
}
