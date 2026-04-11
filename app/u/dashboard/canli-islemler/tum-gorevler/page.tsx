import { createClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetchAll'
import Topbar from '@/components/layout/Topbar'
import TumGorevlerClient from '@/components/canli/TumGorevlerClient'
import { redirect } from 'next/navigation'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'
import { getEfektifAyar } from '@/lib/ayarlar/getEfektifAyar'
import { getYetkiliLokasyonIds } from '@/lib/yetki/getLokasyonYetki'

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

  // Yetkili lokasyon kısıtlaması
  const yetkiliLokIds = await getYetkiliLokasyonIds(supabase, firmaId, projeId)

  // Sadece bugünün görevlerini çek (TRT gün başlangıcı)
  const son24saat = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const sel = '*,lokasyonlar(tanim),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim),olusturan:users!olusturan_id(isim_soyisim),tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim),iptalEden:users!iptal_eden_id(isim_soyisim)'

  let gorevQ = supabase.from('canli_gorevler').select(sel)
    .eq('firma_id', firmaId)
    .gte('aktif_olma_tarihi', son24saat)
    .order('aktif_olma_tarihi', { ascending: false })
    .limit(500)
  if (projeId) gorevQ = (gorevQ as any).eq('proje_id', projeId)
  if (yetkiliLokIds) gorevQ = gorevQ.in('lokasyon_id', yetkiliLokIds)
  const { data: gorevData } = await gorevQ

  const gorevler = gorevData ?? []

  let lokQ = supabase
    .from('lokasyonlar').select('id,tanim')
    .eq('firma_id', firmaId).eq('aktif', true).order('tanim')
  if (projeId) lokQ = (lokQ as any).eq('proje_id', projeId)
  if (yetkiliLokIds) lokQ = lokQ.in('id', yetkiliLokIds)

  const { data: lokasyonlar } = await lokQ
  let kulQ = supabase.from('users').select('id,isim_soyisim').eq('firma_id', firmaId).eq('aktif', true)
  if (projeId) kulQ = (kulQ as any).eq('proje_id', projeId)
  const { data: kullanicilar } = await kulQ.order('isim_soyisim')
  const ayarlar = await getEfektifAyar(firmaId, projeId)

  return (
    <div>
      <Topbar title="Tüm Görevler" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Frekansiyel Görevler' }, { label: 'Tüm Görevler' }]} />
      <TumGorevlerClient
        base="/u"
        firmaId={firmaId}
        meId={me.id}
        readonly={readonly}
        yetkiliLokIds={yetkiliLokIds}
        projeId={projeId ?? null}
        lokasyonlar={(lokasyonlar as any) ?? []}
        kullanicilar={(kullanicilar as any) ?? []}
        initialGorevler={(gorevler as any) ?? []}
        personelAtamaAktif={ayarlar.frekansiyel_personel_atama_aktif}
      />
    </div>
  )
}
