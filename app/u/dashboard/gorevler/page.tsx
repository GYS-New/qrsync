import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import GorevlerClient from '@/components/gorev/GorevlerClient'
import { redirect } from 'next/navigation'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'
import { getEfektifAyar } from '@/lib/ayarlar/getEfektifAyar'

export const dynamic = 'force-dynamic'

export default async function UGorevlerPage() {
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

  // Yetki kontrolü
  const yetki = await sayfaYetkileri(me.rol, 'gorevler', firmaId ?? null)
  if (!yetki.gorebilir) redirect('/u/dashboard')

  const readonly = !yetki.ekleyebilir && !yetki.duzenleyebilir && !yetki.silebilir

  let gorevQ = supabase
    .from('gorevler')
    .select('*,lokasyonlar(id,tanim,parent_id),atanan:users!atanan_kullanici_id(isim_soyisim)')
    .eq('firma_id', firmaId)
    .order('olusturma_tarihi', { ascending: false })
    .limit(500)
  if (projeId) gorevQ = (gorevQ as any).eq('proje_id', projeId)
  const { data: gorevler } = await gorevQ

  let lokQ = supabase
    .from('lokasyonlar')
    .select('id,tanim,aktif,parent_id')
    .eq('firma_id', firmaId)
    .eq('aktif', true)
    .order('tanim')
  if (projeId) lokQ = (lokQ as any).eq('proje_id', projeId)
  const { data: lokasyonlar } = await lokQ

  const { data: kullanicilar } = await supabase
    .from('users')
    .select('id,isim_soyisim,aktif')
    .eq('firma_id', firmaId)
    .eq('aktif', true)
    .order('isim_soyisim')

  const ayarlar = await getEfektifAyar(firmaId!, projeId)

  return (
    <div>
      <Topbar title="Spesifik Görevler" base="/u" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Spesifik Görevler' }]} />
      <GorevlerClient
        base="/u"
        meId={me.id}
        readonly={readonly}
        initialFirmaId={firmaId}
        initialGorevler={(gorevler as any) ?? []}
        initialLokasyonlar={(lokasyonlar as any) ?? []}
        initialKullanicilar={(kullanicilar as any) ?? []}
        projeId={projeId ?? null}
        personelAtamaAktif={ayarlar.spesifik_personel_atama_aktif}
        ceklistAktif={ayarlar.spesifik_ceklist_aktif}
      />
    </div>
  )
}
