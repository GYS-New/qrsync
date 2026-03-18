import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveLiveCompletionStatusByTask } from '@/lib/tasks/liveStatus'

export type SupportedTaskType = 'gorevler' | 'canli_gorevler'
export type CompletionChannel = 'QR' | 'NFC'

type CompleteTaskInput = {
  supabase: SupabaseClient
  taskId: string
  taskType: SupportedTaskType
  userId: string
  channel: CompletionChannel
}

function calcDurationSeconds(startedAt?: string | null, nowIso?: string) {
  if (!startedAt) return null
  const end = new Date(nowIso ?? new Date().toISOString()).getTime()
  const start = new Date(startedAt).getTime()
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return Math.max(0, Math.floor((end - start) / 1000))
}

export async function completeTask(input: CompleteTaskInput) {
  const { supabase, taskId, taskType, userId, channel } = input
  const nowIso = new Date().toISOString()

  if (taskType === 'gorevler') {
    const { data: task, error } = await supabase
      .from('gorevler')
      .select('id,durum,atanan_kullanici_id,baslatilma_tarihi,aktif_olma_tarihi,lokasyon_id,lokasyonlar!inner(sureli_gorev_aktif)')
      .eq('id', taskId)
      .single()

    if (error || !task) throw new Error('Görev bulunamadı')
    if (!['ACIK', 'ISLEMDE'].includes(task.durum)) {
      throw new Error('Bu görev henüz tamamlanabilir durumda değil')
    }
    if (task.atanan_kullanici_id && task.atanan_kullanici_id !== userId) {
      throw new Error('Bu görev size atanmış değil')
    }

    const sureli = !!(task as any).lokasyonlar?.sureli_gorev_aktif
    if (sureli && !task.baslatilma_tarihi) {
      throw new Error('Bu lokasyonda görev önce başlatılmalıdır')
    }

    const { error: updateError } = await supabase
      .from('gorevler')
      .update({
        durum: 'TAMAMLANDI',
        durum_degisim_tarihi: nowIso,
        tamamlanma_tarihi: nowIso,
        tamamlanma_suresi_saniye: calcDurationSeconds(task.baslatilma_tarihi, nowIso),
        islemi_yapan_id: userId,
        son_tamamlama_kanali: channel,
      } as any)
      .eq('id', taskId)

    if (updateError) throw new Error(updateError.message)
    return { ok: true as const, taskType, taskId }
  }

  const { data: liveTask, error: liveError } = await supabase
    .from('canli_gorevler')
    .select('id,durum,atanan_kullanici_id,baslatilma_tarihi,aktif_olma_tarihi,lokasyon_id,lokasyonlar!inner(sureli_gorev_aktif)')
    .eq('id', taskId)
    .single()

  if (liveError || !liveTask) throw new Error('Canlı görev bulunamadı')
  if (liveTask.durum === 'ZAMANI_GECMIS') {
    throw new Error('Zamanı geçmiş görevlerde işlem yapılamaz')
  }
  if (!['ACIK', 'BEKLEMEDE'].includes(liveTask.durum)) {
    throw new Error('Bu görev henüz tamamlanabilir durumda değil')
  }
  if (liveTask.atanan_kullanici_id && liveTask.atanan_kullanici_id !== userId) {
    throw new Error('Bu görev size atanmış değil')
  }

  const sureli = !!(liveTask as any).lokasyonlar?.sureli_gorev_aktif
  if (sureli && !liveTask.baslatilma_tarihi) {
    throw new Error('Bu lokasyonda görev önce başlatılmalıdır')
  }

  const liveCompletionStatus = resolveLiveCompletionStatusByTask(liveTask as any, nowIso)

  const { error: liveUpdateError } = await supabase
    .from('canli_gorevler')
    .update({
      durum: liveCompletionStatus,
      durum_degisim_tarihi: nowIso,
      tamamlanma_tarihi: nowIso,
      tamamlanma_suresi_saniye: calcDurationSeconds(liveTask.baslatilma_tarihi, nowIso),
      tamamlayan_kullanici_id: userId,
      islemi_yapan_id: userId,
      son_tamamlama_kanali: channel,
    } as any)
    .eq('id', taskId)

  if (liveUpdateError) throw new Error(liveUpdateError.message)
  return { ok: true as const, taskType, taskId }
}
