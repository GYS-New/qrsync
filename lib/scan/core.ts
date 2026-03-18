import type { SupabaseClient } from '@supabase/supabase-js'
import { getLicenseStatus } from '@/lib/license'
import { syncLiveTaskStatuses } from '@/lib/tasks/liveStatus'
import type { CompletionChannel, SupportedTaskType } from '@/lib/tasks/completeTask'

export type ScanTask = {
  id: string
  taskType: SupportedTaskType
  tanim: string
  durum: string
  atanan_kullanici_id: string | null
  olusturma_tarihi?: string | null
}

export type ScanChecklistItem = {
  id: string
  sira: number
  madde: string
  zorunlu: boolean
}

export type ScanContext = {
  kanal: CompletionChannel
  firma: {
    id: string
    ad: string
    aktif: boolean
    qr_sistemi_aktif: boolean
    nfc_sistemi_aktif: boolean
  }
  lokasyon: {
    id: string
    tanim: string
    aktif: boolean
  }
  checklistTemplate: {
    id: string
    isim: string
    items: ScanChecklistItem[]
  } | null
  tasks: ScanTask[]
}

export async function resolveScanContext(opts: {
  supabase: SupabaseClient
  token: string
  kanal: CompletionChannel
  userId: string
}): Promise<ScanContext> {
  const { supabase, token, kanal, userId } = opts
  const tokenColumn = kanal === 'QR' ? 'qr_veri' : 'nfc_token'

  const { data: loc, error: locErr } = await supabase
    .from('lokasyonlar')
    .select(`
      id,
      firma_id,
      tanim,
      aktif,
      ${tokenColumn},
      checklist_template_id,
      firmalar(id, firma_adi, ticari_unvan, aktif, qr_sistemi_aktif, nfc_sistemi_aktif)
    `)
    .eq(tokenColumn, token)
    .single()

  if (locErr || !loc) {
    throw new Error(kanal === 'QR' ? 'QR lokasyonu bulunamadı' : 'NFC lokasyonu bulunamadı')
  }

  const firmaId = (loc as any).firma_id as string
  const firma = (loc as any).firmalar as any
  if (!firmaId || !firma) throw new Error('Firma bilgisi bulunamadı')

  // Firma pasif kontrolü
  if (firma.aktif === false) throw new Error('Firma aktif değil')

  const license = await getLicenseStatus(supabase, firmaId)
  if (license.expired) throw new Error('Firma lisansı süresi dolmuş')

  // QR/NFC sistem kontrolleri — firma aktif ve lisans geçerliyse TA ayarı geçerli
  if (kanal === 'QR' && firma.qr_sistemi_aktif === false) throw new Error('QR sistemi aktif değil')
  if (kanal === 'NFC' && firma.nfc_sistemi_aktif === false) throw new Error('NFC sistemi aktif değil')
  if (loc.aktif === false) throw new Error('Lokasyon aktif değil')

  await syncLiveTaskStatuses({ supabase, locationId: loc.id })

  const [manualRes, liveRes] = await Promise.all([
    supabase
      .from('gorevler')
      .select('id,tanim,durum,atanan_kullanici_id,olusturma_tarihi')
      .eq('lokasyon_id', loc.id)
      .eq('durum', 'ACIK')
      .order('olusturma_tarihi', { ascending: true }),
    supabase
      .from('canli_gorevler')
      .select('id,tanim,durum,atanan_kullanici_id,olusturma_tarihi')
      .eq('lokasyon_id', loc.id)
      .eq('durum', 'ACIK')
      .order('olusturma_tarihi', { ascending: true }),
  ])

  if (manualRes.error) throw new Error(manualRes.error.message)
  if (liveRes.error) throw new Error(liveRes.error.message)

  const visibleManual: ScanTask[] = (manualRes.data ?? [])
    .filter((t: any) => !t.atanan_kullanici_id || t.atanan_kullanici_id === userId)
    .map((t: any) => ({ ...t, taskType: 'gorevler' }))

  const visibleLive: ScanTask[] = (liveRes.data ?? [])
    .filter((t: any) => !t.atanan_kullanici_id || t.atanan_kullanici_id === userId)
    .map((t: any) => ({ ...t, taskType: 'canli_gorevler' }))

  let checklistTemplate: ScanContext['checklistTemplate'] = null
  const checklistTemplateId = (loc as any).checklist_template_id as string | null
  if (checklistTemplateId) {
    const { data: template, error: templateError } = await supabase
      .from('checklist_templates')
      .select('id,isim')
      .eq('id', checklistTemplateId)
      .single()

    if (templateError && templateError.code !== 'PGRST116') throw new Error(templateError.message)

    if (template) {
      const { data: items, error: itemsError } = await supabase
        .from('checklist_items')
        .select('id,sira,madde,zorunlu')
        .eq('template_id', template.id)
        .order('sira', { ascending: true })

      if (itemsError) throw new Error(itemsError.message)

      checklistTemplate = {
        id: (template as any).id,
        isim: (template as any).isim,
        items: ((items as any[]) ?? []).map((item: any) => ({
          id: item.id,
          sira: item.sira,
          madde: item.madde,
          zorunlu: !!item.zorunlu,
        })),
      }
    }
  }

  return {
    kanal,
    firma: {
      id: firma.id,
      ad: firma.firma_adi || firma.ticari_unvan || 'Firma',
      qr_sistemi_aktif: firma.qr_sistemi_aktif !== false,
      nfc_sistemi_aktif: firma.nfc_sistemi_aktif !== false,
    },
    lokasyon: {
      id: loc.id,
      tanim: loc.tanim,
      aktif: !!loc.aktif,
    },
    checklistTemplate,
    tasks: [...visibleManual, ...visibleLive],
  }
}
