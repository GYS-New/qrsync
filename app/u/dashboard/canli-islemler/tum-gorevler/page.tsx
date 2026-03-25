import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import TumGorevlerClient from '@/components/canli/TumGorevlerClient'
import { redirect } from 'next/navigation'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'

export const dynamic = 'force-dynamic'

export default async function UTumGorevlerPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase
    .from('users')
    .select('id,rol,firma_id,proje_id')
    .eq('id', authUser.id)
    .single()
  if (!me) redirect('/login')

  const firmaId = me.firma_id
  const projeId = me.proje_id
  if (!firmaId) redirect('/login')

  // Yetki kontrolü
  const yetki = await sayfaYetkileri(me.rol, 'tum-gorevler', firmaId ?? null)
  if (!yetki.gorebilir) redirect('/u/dashboard')

  // readonly: düzenleme/silme yetkisi yoksa
  const readonly = !yetki.duzenleyebilir && !yetki.silebilir

  const plus24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const minus7d  = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const sel = '*,lokasyonlar(tanim),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim),olusturan:users!olusturan_id(isim_soyisim),tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim),iptalEden:users!iptal_eden_id(isim_soyisim)'

  let q1base = supabase
    .from('canli_gorevler').select(sel)
    .eq('firma_id', firmaId)
    .lte('aktif_olma_tarihi', plus24h)
    .order('aktif_olma_tarihi', { ascending: false })
    .limit(500)
  if (projeId) q1base = (q1base as any).eq('proje_id', projeId)

  let q2base = supabase
    .from('canli_gorevler').select(sel)
    .eq('firma_id', firmaId)
    .in('durum', ['TAMAMLANDI', 'ZAMANINDA_YAPILAMAYAN', 'ZAMANI_GECMIS', 'IPTAL', 'KAPATILDI'])
    .gte('aktif_olma_tarihi', minus7d)
    .order('aktif_olma_tarihi', { ascending: false })
    .limit(200)
  if (projeId) q2base = (q2base as any).eq('proje_id', projeId)

  const [{ data: q1 }, { data: q2 }] = await Promise.all([q1base, q2base])

  const seen = new Set<string>()
  const gorevler: any[] = []
  for (const row of [...(q1 ?? []), ...(q2 ?? [])]) {
    if (!seen.has(row.id)) { seen.add(row.id); gorevler.push(row) }
  }
  gorevler.sort((a, b) =>
    new Date(b.aktif_olma_tarihi).getTime() - new Date(a.aktif_olma_tarihi).getTime()
  )

  let lokQ = supabase
    .from('lokasyonlar').select('id,tanim')
    .eq('firma_id', firmaId).eq('aktif', true).order('tanim')
  if (projeId) lokQ = (lokQ as any).eq('proje_id', projeId)

  const { data: lokasyonlar } = await lokQ
  const { data: kullanicilar } = await supabase
    .from('users').select('id,isim_soyisim')
    .eq('firma_id', firmaId).eq('aktif', true).order('isim_soyisim')

  return (
    <div>
      <Topbar title="Tüm Görevler" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Frekansiyel Görevler' }, { label: 'Tüm Görevler' }]} />
      <TumGorevlerClient
        base="/u"
        firmaId={firmaId}
        meId={me.id}
        readonly={readonly}
        projeId={projeId ?? null}
        lokasyonlar={(lokasyonlar as any) ?? []}
        kullanicilar={(kullanicilar as any) ?? []}
        initialGorevler={(gorevler as any) ?? []}
      />
    </div>
  )
}
