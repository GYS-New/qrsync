import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { ssoTokenUret } from '@/lib/fms/ssoToken'

export const dynamic = 'force-dynamic'

/**
 * /fms — Transit sayfa. Yetki kontrolü + SSO token üretip İO-TEKNİK'e
 * yönlendirir. Kullanıcı burada beklemez; render fazına ulaşmadan redirect
 * çalışır (server component'te sync redirect).
 *
 * İO-TEKNİK'te /sso endpoint'i token'ı doğrular, email lookup yapar,
 * gerekirse auto-provision eder, session cookie set + /dashboard'a yönlendirir.
 */
export default async function FMSLandingPage() {
  const { me } = await assertModulYetkisi('fms')
  const supabase = createClient()
  const { data: u } = await supabase
    .from('users')
    .select('email, isim_soyisim, firma_id')
    .eq('id', me.id)
    .single()

  const email = (u as any)?.email ?? null
  if (!email) {
    // Email olmadan FMS'ye SSO yapılamaz — kritik bir audit kaydı için
    // burada bir hata sayfası daha iyi ama mevcut akışta basit redirect:
    redirect('/modul-sec?force=1&hata=email_eksik')
  }

  const baseUrl = process.env.FMS_BASE_URL
  if (!baseUrl) {
    throw new Error('FMS_BASE_URL tanımlı değil (env)')
  }

  const token = await ssoTokenUret({
    email,
    isim_soyisim: (u as any)?.isim_soyisim ?? null,
    gys_user_id: me.id,
  })

  // İO-TEKNİK SSO endpoint: app/api/sso/route.ts (GET)
  const ssoUrl = `${baseUrl.replace(/\/$/, '')}/api/sso?token=${encodeURIComponent(token)}`
  redirect(ssoUrl)
}
