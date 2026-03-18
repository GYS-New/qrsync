import { NextResponse } from 'next/server'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { resolveScanContext } from '@/lib/scan/core'
import { completeTask } from '@/lib/tasks/completeTask'

async function getAuthUser() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(_: Request, { params }: { params: { token: string } }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401 })

  try {
    const supabase = createAdminClient()
    const context = await resolveScanContext({ supabase, token: params.token, kanal: 'QR', userId: user.id })
    return NextResponse.json({ ok: true, ...context })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'İşlem başarısız' }, { status: 400 })
  }
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const user = await getAuthUser()
  if (!user) return NextResponse.json({ ok: false, error: 'auth_required' }, { status: 401 })

  try {
    const body = await req.json().catch(() => ({}))
    const selectedTaskId = body?.taskId as string | undefined
    const selectedTaskType = body?.taskType as 'gorevler' | 'canli_gorevler' | undefined
    const checklistResults = Array.isArray(body?.checklistResults) ? body.checklistResults : []

    const supabase = createAdminClient()
    const context = await resolveScanContext({ supabase, token: params.token, kanal: 'QR', userId: user.id })

    const task = context.tasks.find((t) => t.id === selectedTaskId && t.taskType === selectedTaskType)
    if (!task) {
      return NextResponse.json({ ok: false, error: 'Görev bulunamadı veya erişim yok' }, { status: 404 })
    }

    if (context.checklistTemplate?.items?.length) {
      const missingRequired = context.checklistTemplate.items.filter(
        (item) => item.zorunlu && !checklistResults.some((r: any) => r?.itemId === item.id && r?.durum === true)
      )
      if (missingRequired.length) {
        return NextResponse.json({ ok: false, error: 'Zorunlu checklist maddeleri tamamlanmalı' }, { status: 400 })
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

    await completeTask({
      supabase,
      taskId: task.id,
      taskType: task.taskType,
      userId: user.id,
      channel: 'QR',
    })

    return NextResponse.json({ ok: true, message: 'Görev QR ile tamamlandı' })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message ?? 'İşlem başarısız' }, { status: 400 })
  }
}
