import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/cron/mesai-arsiv
 *
 * DEVRE DISI (26.08.2026): Bu endpoint sadece `arsivlendi=true` flag yaziyordu,
 * kayitlari fiziksel olarak tasimiyordu. Bu yuzden `/api/tasks/arsivle` (6
 * saatte 1 calisan Node cron) bu kayitlari `personel_mesai_kayitlari_arsiv`
 * tablosuna tasiyamiyordu — cunku o cron `.eq('arsivlendi', false)` filtresi
 * kullaniyor.
 *
 * Iki cron cakisiyordu:
 *   - mesai-arsiv (23:59 TR): flag=true set → arsivle cron bu kayitlara
 *     dokunamaz → kayitlar sonsuza kadar canli tabloda kalir
 *   - tasks/arsivle (6h): flag=false olanlari tasir + siler (gercek arsiv)
 *
 * Cozum: mesai-arsiv devre disi. Tek dogru cron: tasks/arsivle. Bu endpoint
 * 200 doner ama hicbir sey yapmaz (backwards compatibility, Railway'de silme).
 */
export async function GET(_req: NextRequest) {
  return NextResponse.json({
    ok: true,
    arsivlenen: 0,
    mesaj: 'Devre disi — gercek arsivleme /api/tasks/arsivle icinde yapiliyor',
  })
}
