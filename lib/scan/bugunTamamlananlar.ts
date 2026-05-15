import type { SupabaseClient } from '@supabase/supabase-js'

/** Türkiye saatiyle bugünün UTC başlangıç ISO string'i (UTC+3) */
export function bugunTRISO(): string {
  const now = new Date()
  const trNow = new Date(now.getTime() + 3 * 60 * 60 * 1000)
  trNow.setUTCHours(0, 0, 0, 0)
  return new Date(trNow.getTime() - 3 * 60 * 60 * 1000).toISOString()
}

/**
 * Mobil ekstra-frekansiyel modal'ı için dropdown verisini hazırlar.
 *
 * Dönüş: {
 *   bugun_tamamlananlar: [{ tanim, adet }, ...]   — bugün (TR) o lokasyonda tamamlanmış kural-tabanlı görevler, adet DESC
 *   lokasyon_kurallari:  [{ tanim, adet: 0 }, ...] — o lokasyonun aktif frekans kuralları (adet 0)
 *
 * Mobil akışı:
 *   - Önce bugun_tamamlananlar'ı göster (tercihen; operatör daha önce hangi işleri yaptığını bilir)
 *   - Onlarda yoksa (hiç iş yapılmamış / yeni vardiya) lokasyon_kurallari'ndaki tanımları göster
 *   - İkisi birleştirilerek de sunulabilir (distinct tanım bazında)
 */
export async function lokasyonEkstraFrekansDropdown(
  supabase: SupabaseClient<any>,
  lokasyonId: string,
): Promise<{
  bugun_tamamlananlar: { tanim: string; adet: number }[]
  lokasyon_kurallari:  { tanim: string; adet: number }[]
}> {
  // ── Oto Yıkama dalı: lokasyonun üst lokasyonu oto_yikama_lokasyon=true ise
  //   "kural tanımları" yerine firmanın aktif PLAKA listesi döner. Bugün
  //   tamamlananlar metadata'dan plaka bazında sayılır. Mobil dropdown bu
  //   plakalardan seçim yapar, ekstra-frekans endpoint'inde plaka eşleşir.
  {
    const { data: lok } = await supabase
      .from('lokasyonlar')
      .select('id, firma_id, parent_id')
      .eq('id', lokasyonId)
      .maybeSingle()
    if (lok?.parent_id) {
      const { data: ust } = await supabase
        .from('lokasyonlar')
        .select('oto_yikama_lokasyon')
        .eq('id', lok.parent_id)
        .maybeSingle()
      if ((ust as any)?.oto_yikama_lokasyon) {
        const today = new Date().toISOString().slice(0, 10)
        const [aracRes, metaRes] = await Promise.all([
          supabase.from('araclar').select('plaka')
            .eq('firma_id', (lok as any).firma_id)
            .eq('aktif', true),
          supabase.from('oto_yikama_gorev_metadata')
            .select('plaka_snapshot, gorevler!inner(durum, lokasyon_id)')
            .eq('hedef_tarih', today)
            .eq('gorevler.lokasyon_id', lokasyonId)
            .eq('gorevler.durum', 'TAMAMLANDI'),
        ])
        const plakaList = ((aracRes.data ?? []) as any[])
          .map(a => (typeof a.plaka === 'string' ? a.plaka.trim() : ''))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, 'tr'))
        const bugunSayac = new Map<string, number>()
        for (const m of ((metaRes.data ?? []) as any[])) {
          const p = m?.plaka_snapshot
          if (typeof p === 'string' && p.trim()) bugunSayac.set(p, (bugunSayac.get(p) ?? 0) + 1)
        }
        return {
          bugun_tamamlananlar: Array.from(bugunSayac.entries())
            .map(([tanim, adet]) => ({ tanim, adet }))
            .sort((a, b) => b.adet - a.adet),
          lokasyon_kurallari: plakaList.map(tanim => ({ tanim, adet: 0 })),
        }
      }
    }
  }

  const baslangic = bugunTRISO()
  const [aktifRes, arsivRes, kuralRes] = await Promise.all([
    supabase.from('canli_gorevler').select('tanim')
      .eq('lokasyon_id', lokasyonId)
      .not('kural_id', 'is', null)
      .eq('durum', 'TAMAMLANDI')
      .gte('tamamlanma_tarihi', baslangic),
    supabase.from('canli_gorevler_arsiv').select('tanim')
      .eq('lokasyon_id', lokasyonId)
      .not('kural_id', 'is', null)
      .eq('durum', 'TAMAMLANDI')
      .gte('tamamlanma_tarihi', baslangic),
    supabase.from('gorev_kurallari').select('tanim')
      .eq('lokasyon_id', lokasyonId)
      .eq('aktif', true),
  ])

  // 1. Bugün tamamlananlar (adet bazında)
  const bugunSayac = new Map<string, number>()
  for (const r of [...(aktifRes.data ?? []), ...(arsivRes.data ?? [])]) {
    const t = (r as any)?.tanim
    if (typeof t === 'string' && t.trim()) bugunSayac.set(t, (bugunSayac.get(t) ?? 0) + 1)
  }
  const bugun_tamamlananlar = Array.from(bugunSayac.entries())
    .map(([tanim, adet]) => ({ tanim, adet }))
    .sort((a, b) => b.adet - a.adet)

  // 2. Lokasyonun aktif frekans kuralları (distinct tanım)
  const kuralSet = new Set<string>()
  for (const r of kuralRes.data ?? []) {
    const t = (r as any)?.tanim
    if (typeof t === 'string' && t.trim()) kuralSet.add(t.trim())
  }
  const lokasyon_kurallari = Array.from(kuralSet)
    .map(tanim => ({ tanim, adet: 0 }))
    .sort((a, b) => a.tanim.localeCompare(b.tanim, 'tr'))

  return { bugun_tamamlananlar, lokasyon_kurallari }
}

/** @deprecated Yerine lokasyonEkstraFrekansDropdown kullanın. Geriye dönük uyumluluk için kalıyor. */
export async function lokasyonBugunTamamlananlar(
  supabase: SupabaseClient<any>,
  lokasyonId: string,
): Promise<{ tanim: string; adet: number }[]> {
  const { bugun_tamamlananlar } = await lokasyonEkstraFrekansDropdown(supabase, lokasyonId)
  return bugun_tamamlananlar
}
