import { createAdminClient } from '@/lib/supabase/server'

const DEFAULTS = {
  gorev_suresi_hedef_orani: 10,
  arsiv_mesai_saat: 24,
  arsiv_musteri_saat: 24,
  arsiv_spesifik_saat: 48,
  arsiv_frekansiyel_saat: 24,
  spesifik_ceklist_aktif: true,
  spesifik_personel_atama_aktif: true,
  frekansiyel_personel_atama_aktif: true,
  frekansiyel_ceklist_aktif: true,
  ardisik_baslatma_suresi_dk: 0,
  personel_takip_bildirim_dk: 0,
  canli_akis_sure_saat: 8,
}

const SEL = Object.keys(DEFAULTS).join(',')

export type EfektifAyarlar = typeof DEFAULTS

/**
 * Efektif ayarları döndürür: proje override > firma default
 */
export async function getEfektifAyar(firmaId: string, projeId?: string | null): Promise<EfektifAyarlar> {
  const admin = createAdminClient()

  const { data: firma } = await admin.from('firmalar').select(SEL).eq('id', firmaId).single()

  const result = { ...DEFAULTS }
  if (firma) {
    for (const k of Object.keys(DEFAULTS)) {
      if ((firma as any)[k] != null) (result as any)[k] = (firma as any)[k]
    }
  }

  if (projeId) {
    const { data: proje } = await admin.from('projeler').select(SEL).eq('id', projeId).single()
    if (proje) {
      for (const k of Object.keys(DEFAULTS)) {
        if ((proje as any)[k] != null) (result as any)[k] = (proje as any)[k]
      }
    }
  }

  return result
}
