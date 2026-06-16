import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getYetkiliModuller, type ModulKodu } from '@/lib/modul/yetkiliModuller'
import { setAktifModul, clearAktifModul, modulLandingUrl } from '@/lib/modul/cookie'

export const dynamic = 'force-dynamic'

/**
 * POST /api/modul/sec
 * body: { modul: 'gys' | 'oto_yikama' | 'fms' }
 *
 * Kullanıcının seçtiği modülü cookie'ye yazar ve o modülün landing URL'ini döner.
 * UI client tarafı bu URL'e router.push() yapar.
 *
 * Yetki kontrolü: kullanıcı seçtiği modülde gerçekten yetkili olmalı (aktif + yetkili).
 * Aksi takdirde 403.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) return NextResponse.json({ error: 'Yetkisiz' }, { status: 401 })

  const { data: me } = await supabase
    .from('users').select('rol, firma_id').eq('id', authUser.id).single()
  if (!me) return NextResponse.json({ error: 'Kullanıcı bulunamadı' }, { status: 403 })

  const body = await req.json().catch(() => ({} as any))
  const modul = body?.modul as ModulKodu | undefined
  if (!modul || !['gys', 'oto_yikama', 'fms'].includes(modul)) {
    return NextResponse.json({ error: 'Geçersiz modül' }, { status: 400 })
  }

  // Yetki doğrulama: client tarafından gelen seçimi backend tarafında tekrar doğrula
  const yetkili = await getYetkiliModuller(me.rol, me.firma_id)
  const secilenModul = yetkili.moduller.find(m => m.kod === modul)
  if (!secilenModul || !secilenModul.aktif || !secilenModul.yetkili) {
    return NextResponse.json({ error: 'Bu modüle yetkiniz yok veya modül aktif değil' }, { status: 403 })
  }

  setAktifModul(modul)
  const url = modulLandingUrl(modul, me.rol)
  return NextResponse.json({ ok: true, url })
}

/**
 * DELETE /api/modul/sec
 * "Modül Değiştir" akışı: aktif modül cookie'sini siler.
 * Client `/modul-sec`'e yönlendirir.
 */
export async function DELETE() {
  clearAktifModul()
  return NextResponse.json({ ok: true })
}
