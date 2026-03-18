import { NextResponse } from 'next/server'
import { differenceInCalendarDays, startOfDay } from 'date-fns'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { sendMail } from '@/lib/email'

function isoNow() {
  return new Date().toISOString()
}

export async function GET() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: true })

    const admin = createAdminClient()

    // Get app user row (role + firma)
    const { data: me, error: meErr } = await admin
      .from('users')
      .select('id, rol, firma_id, email, isim_soyisim')
      .eq('id', user.id)
      .single()
    if (meErr || !me) return NextResponse.json({ ok: true })

    const firmaId: string | null = me.firma_id ?? null
    if (!firmaId) return NextResponse.json({ ok: true })

    const { data: firma } = await admin
      .from('firmalar')
      .select('id, firma_adi, ticari_unvan, lisans_gecerlilik_tarihi, lisans_uyari_mail_gonderildi_at, lisans_uyari_ta_bildirim_gonderildi, lisans_uyari_sa_bildirim_gonderildi')
      .eq('id', firmaId)
      .single()

    const licenseIso: string | null = (firma as any)?.lisans_gecerlilik_tarihi ?? null
    if (!licenseIso) return NextResponse.json({ ok: true })

    const now = new Date()
    const licenseDate = new Date(licenseIso)
    const daysLeft = differenceInCalendarDays(startOfDay(licenseDate), startOfDay(now))
    const inWindow = daysLeft <= 7 && daysLeft > 0
    const expired = daysLeft <= 0

    const firmaName = (firma as any)?.firma_adi || (firma as any)?.ticari_unvan || 'Firma'

    // 3) TA notification once when window starts
    if (inWindow && me.rol === 'tenant_admin') {
      const already = !!(firma as any)?.lisans_uyari_ta_bildirim_gonderildi
      if (!already) {
        await admin.from('bildirimler').insert({
          alici_id: me.id,
          baslik: 'Lisans Süreniz Dolmak Üzere',
          mesaj: `Lisans süreniz ${daysLeft} gün içinde dolacak. Lütfen en kısa zamanda lisansınızı yenileyiniz.`,
          okundu: false,
          tip: 'sistem',
        })
        await admin.from('firmalar').update({ lisans_uyari_ta_bildirim_gonderildi: true }).eq('id', firmaId)
      }
    }

    // 4) SA notification once when window starts
    if (inWindow) {
      const alreadySa = !!(firma as any)?.lisans_uyari_sa_bildirim_gonderildi
      if (!alreadySa) {
        const { data: sas } = await admin
          .from('users')
          .select('id')
          .in('rol', ['super_admin', 'alt_super_admin'])
        if (sas?.length) {
          await admin.from('bildirimler').insert(
            sas.map((u: any) => ({
              alici_id: u.id,
              baslik: 'Firmanın Lisansı Dolmak Üzere',
              mesaj: `${firmaName} firmasının lisansı ${daysLeft} gün içinde dolacak.`,
              okundu: false,
              tip: 'sistem',
            }))
          )
        }
        await admin.from('firmalar').update({ lisans_uyari_sa_bildirim_gonderildi: true }).eq('id', firmaId)
      }
    }

    // 1) Email to TA once at window start (best-effort)
    if (inWindow && me.rol === 'tenant_admin') {
      const mailSentAt = (firma as any)?.lisans_uyari_mail_gonderildi_at as string | null
      if (!mailSentAt) {
        const { data: tas } = await admin
          .from('users')
          .select('email, isim_soyisim')
          .eq('firma_id', firmaId)
          .eq('rol', 'tenant_admin')
        if (tas?.length) {
          for (const ta of tas) {
            if (!ta.email) continue
            await sendMail({
              to: ta.email,
              subject: 'QRSync - Lisans süresi dolmak üzere',
              text: `Merhaba${ta.isim_soyisim ? ' ' + ta.isim_soyisim : ''},\n\n${firmaName} için lisans süreniz ${daysLeft} gün içinde dolacak. Lütfen en kısa zamanda lisansınızı yenileyiniz.\n\nQRSync`,
            })
          }
          await admin.from('firmalar').update({ lisans_uyari_mail_gonderildi_at: isoNow() }).eq('id', firmaId)
        }
      }
    }

    // 2) Daily warning popup for TA in the 7-day window: return a flag
    const showDailyWarning = inWindow && me.rol === 'tenant_admin'

    return NextResponse.json({
      ok: true,
      expired,
      inWindow,
      daysLeft,
      showDailyWarning,
      firmaName,
    })
  } catch (e: any) {
    console.error('[license/reminders] error', e)
    return NextResponse.json({ ok: true })
  }
}
