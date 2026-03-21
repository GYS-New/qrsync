/**
 * GET /api/mesai/kontrol?user_id=...&firma_id=...&proje_id=...
 *
 * Client-side görev atama formları bu endpoint'i çağırarak
 * seçilen personelin iş başı yapıp yapmadığını sorgular.
 *
 * Yanıt:
 *   { ok: true,  atanabilir: true  }  → atama serbest
 *   { ok: true,  atanabilir: false, neden: string }  → atama engelli
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { mesaiKontrolEt } from '@/lib/mesai/kontrolEt'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Yetkisiz' }, { status: 401 })

  const p       = new URL(req.url).searchParams
  const userId  = p.get('user_id')
  const firmaId = p.get('firma_id')
  const projeId = p.get('proje_id') ?? null

  if (!userId || !firmaId) {
    return NextResponse.json({ ok: false, error: 'user_id ve firma_id gerekli' }, { status: 400 })
  }

  const admin = createAdminClient()
  const neden = await mesaiKontrolEt(admin, { firmaId, projeId, atananUserId: userId })

  if (neden) {
    return NextResponse.json({ ok: true, atanabilir: false, neden })
  }

  return NextResponse.json({ ok: true, atanabilir: true })
}
