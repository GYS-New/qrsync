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
    // Önce görevi çek (lokasyon join olmadan — join hatası "Görev bulunamadı" maskelemesini önler)
    const { data: task, error } = await supabase
      .from('gorevler')
      .select('id,durum,atanan_kullanici_id,baslatilma_tarihi,lokasyon_id')
      .eq('id', taskId)
      .single()

    if (error || !task) throw new Error('Görev bulunamadı')
    if (!['ACIK', 'ISLEMDE'].includes(task.durum)) {
      throw new Error('Bu görev henüz tamamlanabilir durumda değil')
    }
    if (task.atanan_kullanici_id && task.atanan_kullanici_id !== userId) {
      throw new Error('Bu görev size atanmış değil')
    }

    // Lokasyondan süreli görev durumunu ayrı sorgula (null-safe)
    let sureli = false
    if (task.lokasyon_id) {
      const { data: lok } = await supabase
        .from('lokasyonlar')
        .select('sureli_gorev_aktif')
        .eq('id', task.lokasyon_id)
        .maybeSingle()
      sureli = !!(lok as any)?.sureli_gorev_aktif
    }

    const baslatilmaTarihi = task.baslatilma_tarihi ?? (sureli ? nowIso : null)

    if (sureli && !task.baslatilma_tarihi) {
      await supabase.from('gorevler').update({
        baslatilma_tarihi: nowIso,
        baslatan_kullanici_id: userId,
        durum: 'ISLEMDE',
        durum_degisim_tarihi: nowIso,
      } as any).eq('id', taskId)
    }

    const { error: updateError } = await supabase
      .from('gorevler')
      .update({
        durum: 'TAMAMLANDI',
        durum_degisim_tarihi: nowIso,
        tamamlanma_tarihi: nowIso,
        tamamlanma_suresi_saniye: calcDurationSeconds(baslatilmaTarihi, nowIso),
        islemi_yapan_id: userId,
      } as any)
      .eq('id', taskId)

    if (updateError) throw new Error(updateError.message)
    return { ok: true as const, taskType, taskId }
  }

  // canli_gorevler
  const { data: liveTask, error: liveError } = await supabase
    .from('canli_gorevler')
    .select('id,durum,atanan_kullanici_id,baslatilma_tarihi,aktif_olma_tarihi,lokasyon_id')
    .eq('id', taskId)
    .single()

  if (liveError || !liveTask) throw new Error('Canlı görev bulunamadı')
  if (liveTask.durum === 'ZAMANI_GECMIS') {
    throw new Error('Zamanı geçmiş görevlerde işlem yapılamaz')
  }
  if (!['ACIK', 'BEKLEMEDE', 'ISLEMDE'].includes(liveTask.durum)) {
    throw new Error('Bu görev henüz tamamlanabilir durumda değil')
  }
  if (liveTask.atanan_kullanici_id && liveTask.atanan_kullanici_id !== userId) {
    throw new Error('Bu görev size atanmış değil')
  }

  // Lokasyondan süreli görev durumunu ayrı sorgula
  let sureli = false
  if (liveTask.lokasyon_id) {
    const { data: lok } = await supabase
      .from('lokasyonlar')
      .select('sureli_gorev_aktif')
      .eq('id', liveTask.lokasyon_id)
      .maybeSingle()
    sureli = !!(lok as any)?.sureli_gorev_aktif
  }

  const liveBaslatilmaTarihi = liveTask.baslatilma_tarihi ?? (sureli ? nowIso : null)

  if (sureli && !liveTask.baslatilma_tarihi) {
    await supabase.from('canli_gorevler').update({
      baslatilma_tarihi: nowIso,
      baslatan_kullanici_id: userId,
      durum: 'ISLEMDE',
      durum_degisim_tarihi: nowIso,
    } as any).eq('id', taskId)
  }

  const liveCompletionStatus = resolveLiveCompletionStatusByTask(liveTask as any, nowIso)

  const { error: liveUpdateError } = await supabase
    .from('canli_gorevler')
    .update({
      durum: liveCompletionStatus,
      durum_degisim_tarihi: nowIso,
      tamamlanma_tarihi: nowIso,
      tamamlanma_suresi_saniye: calcDurationSeconds(liveBaslatilmaTarihi, nowIso),
      tamamlayan_kullanici_id: userId,
      islemi_yapan_id: userId,
    } as any)
    .eq('id', taskId)

  if (liveUpdateError) throw new Error(liveUpdateError.message)
  return { ok: true as const, taskType, taskId }
}
