import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ data: [] })

  const { data: me } = await supabase.from('users').select('rol,firma_id,proje_id').eq('id', user.id).single()
  if (!me) return NextResponse.json({ data: [] })

  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'
  const p = req.nextUrl.searchParams
  const firmaId = isSA ? (p.get('firmaId') ?? me.firma_id) : me.firma_id
  const projeId = p.get('projeId') || (isSA ? null : me.proje_id)

  if (!firmaId) return NextResponse.json({ data: [] })

  const admin = createAdminClient()
  const son30dk = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  const aktiviteler: any[] = []

  // 1. Son görev tamamlamaları
  let gQ = admin.from('canli_gorevler')
    .select('id,tanim,durum,durum_degisim_tarihi,tamamlayan_kullanici_id,islemi_yapan_id,lokasyon_id')
    .eq('firma_id', firmaId)
    .in('durum', ['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN'])
    .gte('durum_degisim_tarihi', son30dk)
    .order('durum_degisim_tarihi', { ascending: false })
    .limit(10)
  if (projeId) gQ = (gQ as any).eq('proje_id', projeId)
  const { data: gorevler } = await gQ

  // Kullanıcı isimlerini çek
  const userIds = new Set<string>()
  for (const g of gorevler ?? []) {
    if (g.tamamlayan_kullanici_id) userIds.add(g.tamamlayan_kullanici_id)
    if (g.islemi_yapan_id) userIds.add(g.islemi_yapan_id)
  }

  // 2. Son mesai giriş/çıkışları
  let mQ = admin.from('personel_mesai_kayitlari')
    .select('id,user_id,giris_saati,cikis_saati,giris_tipi,cikis_tipi,kayit_tarihi')
    .eq('firma_id', firmaId)
    .gte('kayit_tarihi', new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10))
    .order('giris_saati', { ascending: false })
    .limit(10)
  if (projeId) mQ = (mQ as any).eq('proje_id', projeId)
  const { data: mesailar } = await mQ

  for (const m of mesailar ?? []) {
    if (m.user_id) userIds.add(m.user_id)
  }

  // İsim map
  const isimMap: Record<string, string> = {}
  if (userIds.size > 0) {
    const { data: users } = await admin.from('users').select('id,isim_soyisim').in('id', [...userIds])
    for (const u of users ?? []) isimMap[u.id] = u.isim_soyisim ?? ''
  }

  // Görev aktiviteleri
  for (const g of gorevler ?? []) {
    const kim = isimMap[g.islemi_yapan_id ?? g.tamamlayan_kullanici_id ?? ''] ?? 'Sistem'
    const saat = new Date(g.durum_degisim_tarihi).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    aktiviteler.push({
      id: `gorev-${g.id}`,
      mesaj: `✅ ${kim} — ${(g.tanim ?? '').slice(0, 30)} tamamladı`,
      tarih: g.durum_degisim_tarihi,
      saat,
    })
  }

  // Mesai aktiviteleri
  for (const m of mesailar ?? []) {
    const kim = isimMap[m.user_id] ?? ''
    if (m.cikis_saati) {
      const saat = new Date(m.cikis_saati).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      aktiviteler.push({ id: `mesai-cikis-${m.id}`, mesaj: `🔴 ${kim} — iş çıkışı`, tarih: m.cikis_saati, saat })
    }
    if (m.giris_saati) {
      const saat = new Date(m.giris_saati).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
      aktiviteler.push({ id: `mesai-giris-${m.id}`, mesaj: `🟢 ${kim} — iş başı`, tarih: m.giris_saati, saat })
    }
  }

  // Tarihe göre sırala (en yeni önce)
  aktiviteler.sort((a, b) => new Date(b.tarih).getTime() - new Date(a.tarih).getTime())

  return NextResponse.json({ data: aktiviteler.slice(0, 15) })
}
