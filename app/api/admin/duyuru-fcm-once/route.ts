import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendFCMToUser } from '@/lib/fcm-sender'

export const dynamic = 'force-dynamic'

// Tek seferlik FCM gönderim endpoint'i. Çağrıdan sonra bu dosya silinecek.
// İz bırakmaz: bildirimler INSERT yok, push_bildirim_log skipLog ile atlanıyor,
// audit_log yok. Sadece ATALIAN tenant_admin whitelist'ine gönderir.
const TEMP_TOKEN = 'c02b00c315fc7245918c5f367723e882f74841e9acb57677'

const ALICI_IDS = [
  '030d5f7c-9f43-490a-bf4a-ce0415729014', // Ali Osman GÜN
  '30125006-8fb6-4034-8ae7-072df16dcc32', // ÖZCAN AYDOĞDU
  '6e743045-c253-4e06-b8fa-6480d34917c6', // SUAT KUTLUK
  '9c58c24d-f714-4c2e-9f96-49322e238faa', // Tolga Hepyetiker
]

const BASLIK  = 'Ödemeniz Gecikti !'
const ICERIK  = '08.06.2026 son ödeme tarihli, 67.500 TL tutarlı UYT2026000000001 nolu faturamız vadesinde ödenmemiştir. Hizmet kesintisi yaşanmaması için 3 iş günü içerisinde ödeme rica ederiz.'
const KANAL   = 'gorev_uyari'

export async function POST(req: NextRequest) {
  if (req.headers.get('x-temp-token') !== TEMP_TOKEN) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data: users, error } = await admin
    .from('users')
    .select('id, isim_soyisim, rol, firma_id')
    .in('id', ALICI_IDS)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!users || users.length === 0) return NextResponse.json({ error: 'no users' }, { status: 404 })

  // Hepsi aynı firmaya ait olmalı; aynı zamanda tenant_admin
  const firmaId = users[0].firma_id
  const sonuc: { id: string; isim: string; ok: boolean; sebep?: string }[] = []

  for (const u of users) {
    if (u.firma_id !== firmaId) {
      sonuc.push({ id: u.id, isim: u.isim_soyisim ?? '—', ok: false, sebep: 'farkli_firma' })
      continue
    }
    if (u.rol !== 'tenant_admin') {
      sonuc.push({ id: u.id, isim: u.isim_soyisim ?? '—', ok: false, sebep: 'rol_uyumsuz' })
      continue
    }
    try {
      await sendFCMToUser(u.id, BASLIK, ICERIK, KANAL, undefined, { skipLog: true })
      sonuc.push({ id: u.id, isim: u.isim_soyisim ?? '—', ok: true })
    } catch (e: any) {
      sonuc.push({ id: u.id, isim: u.isim_soyisim ?? '—', ok: false, sebep: e?.message ?? 'fcm_hata' })
    }
  }

  return NextResponse.json({ ok: true, firma_id: firmaId, sonuc })
}
