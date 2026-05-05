import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import CanliIslemlerClient from '@/components/canli/CanliIslemlerClient'
import { redirect } from 'next/navigation'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'
import { getYetkiliLokasyonIds } from '@/lib/yetki/getLokasyonYetki'
import { getEfektifAyar } from '@/lib/ayarlar/getEfektifAyar'

export const dynamic = 'force-dynamic'

export default async function UserCanliIslemler() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase
    .from('users')
    .select('id,firma_id,proje_id,rol,isim_soyisim')
    .eq('id', authUser.id)
    .single()
  if (!me) redirect('/login')

  const firmaId = me.firma_id
  const projeId = me.proje_id

  // Yetki kontrolü
  const [canliYetki, tumGorevlerYetki] = await Promise.all([
    sayfaYetkileri(me.rol, 'canli-islemler', firmaId ?? null),
    sayfaYetkileri(me.rol, 'tum-gorevler', firmaId ?? null),
  ])
  if (!canliYetki.gorebilir) redirect('/u/dashboard')

  // Yetkili lokasyon kısıtlaması
  const yetkiliLokIds = firmaId ? await getYetkiliLokasyonIds(supabase, firmaId, projeId) : null

  let lokQ = supabase.from('lokasyonlar').select('id,tanim,aktif,parent_id')
    .eq('firma_id', firmaId).eq('aktif', true).order('tanim')
  if (projeId) lokQ = (lokQ as any).eq('proje_id', projeId)
  if (yetkiliLokIds) lokQ = lokQ.in('id', yetkiliLokIds)

  let kulQ2 = supabase.from('users').select('id,isim_soyisim,profil_foto').eq('firma_id', firmaId).eq('aktif', true)
  if (projeId) kulQ2 = (kulQ2 as any).eq('proje_id', projeId)
  const { data: kullanicilar } = await kulQ2

  let gorevQ = supabase.from('canli_gorevler')
    .select('*,lokasyonlar(tanim),atanan:users!atanan_kullanici_id(isim_soyisim),islemi_yapan:users!islemi_yapan_id(isim_soyisim),olusturan:users!olusturan_id(isim_soyisim),tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim),iptalEden:users!iptal_eden_id(isim_soyisim)')
    .eq('firma_id', firmaId).order('olusturma_tarihi', { ascending: false }).limit(50)
  if (projeId) gorevQ = (gorevQ as any).eq('proje_id', projeId)
  if (yetkiliLokIds) gorevQ = gorevQ.in('lokasyon_id', yetkiliLokIds)

  const [{ data: lokasyonlar }, { data: canliGorevler }] = await Promise.all([lokQ, gorevQ])

  const readonly = !canliYetki.ekleyebilir && !canliYetki.duzenleyebilir && !canliYetki.silebilir

  const efektifAyar = await getEfektifAyar(firmaId!, projeId)

  return (
    <div>
      <Topbar title="Frekansiyel Görevler" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Frekansiyel Görevler' }]} />
      <CanliIslemlerClient
        firmaId={firmaId}
        lokasyonlar={lokasyonlar ?? []}
        kullanicilar={kullanicilar ?? []}
        initialGorevler={canliGorevler ?? []}
        meId={me.id}
        meName={me.isim_soyisim ?? undefined}
        projeId={projeId ?? null}
        readonly={readonly}
        showTumGorevler={tumGorevlerYetki.gorebilir}
        yetkiliLokIds={yetkiliLokIds}
        canliAkisSureSaat={efektifAyar.canli_akis_sure_saat}
        ceklistAktif={efektifAyar.frekansiyel_ceklist_aktif}
        personelAtamaAktif={efektifAyar.frekansiyel_personel_atama_aktif}
        islemSureleriAktif={efektifAyar.islem_sureleri_aktif}
      />
    </div>
  )
}
