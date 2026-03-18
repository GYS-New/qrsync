import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'

export const PROJE_COOKIE = 'qrsync_aktif_proje_id'

export type AktifProje = {
  id: string
  ad: string
  aciklama?: string | null
  renk?: string
}

/**
 * Server component'lerde aktif projeyi cookie'den okur.
 * firmaId ile doğrular — başka firmanın projesini döndürmez.
 */
export async function getAktifProje(firmaId: string | null): Promise<AktifProje | null> {
  if (!firmaId) return null

  const cookieStore = cookies()
  const projeId = cookieStore.get(PROJE_COOKIE)?.value
  if (!projeId) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('projeler')
    .select('id,ad,aciklama,renk')
    .eq('id', projeId)
    .eq('firma_id', firmaId)
    .eq('aktif', true)
    .single()

  return data ?? null
}
