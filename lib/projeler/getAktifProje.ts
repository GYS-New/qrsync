import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/server'

export const PROJE_COOKIE = 'qrsync_aktif_proje_id'

export type AktifProje = {
  id: string
  ad: string
  aciklama?: string | null
  renk?: string
  birim_fiyat_aktif?: boolean
}

/**
 * Server component'lerde aktif projeyi cookie'den okur.
 * firmaId ile doğrular — başka firmanın projesini döndürmez.
 *
 * 2026-05-08 itibariyle: cookie yoksa veya geçersizse (örn. pasif/silinmiş
 * projeye işaret ediyor) firmanın ilk aktif projesini fallback olarak döner.
 * Bu sayede "Tüm Projeler"in kaldırıldığı yeni akışta server hep bir
 * projeyle dönüş yapar; sayfaların ProjeSecilmedi fallback'i yalnızca
 * firmanın HİÇ aktif projesi olmadığı edge case'de tetiklenir.
 *
 * Sıralama: kayit_tarihi ASC — firmanın ilk oluşturduğu proje "ana proje"
 * sayılır (ATALIAN'da OYAK RENAULT'tur).
 */
export async function getAktifProje(firmaId: string | null): Promise<AktifProje | null> {
  if (!firmaId) return null

  const admin = createAdminClient()
  const cookieStore = cookies()
  const projeId = cookieStore.get(PROJE_COOKIE)?.value

  // 1) Cookie'deki proje hâlâ aktif ve doğru firmaya aitse onu kullan
  if (projeId) {
    const { data } = await admin
      .from('projeler')
      .select('id,ad,aciklama,renk,birim_fiyat_aktif')
      .eq('id', projeId)
      .eq('firma_id', firmaId)
      .eq('aktif', true)
      .maybeSingle()
    if (data) return data as AktifProje
  }

  // 2) Cookie yok veya geçersiz → firmanın ilk aktif projesini dön
  const { data: ilkAktif } = await admin
    .from('projeler')
    .select('id,ad,aciklama,renk,birim_fiyat_aktif')
    .eq('firma_id', firmaId)
    .eq('aktif', true)
    .order('kayit_tarihi', { ascending: true })
    .limit(1)
    .maybeSingle()

  return (ilkAktif as AktifProje | null) ?? null
}
