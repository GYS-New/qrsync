import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import GorevlerClient from '@/components/gorev/GorevlerClient'
import { redirect } from 'next/navigation'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { getEfektifAyar } from '@/lib/ayarlar/getEfektifAyar'

export const dynamic = 'force-dynamic'

export default async function TAGorevlerPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  const firmaId = me?.firma_id

  const aktifProje = await getAktifProje(firmaId ?? null)
  if (!aktifProje) return (
    <div>
      <Topbar title="Spesifik Gorevler" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: 'Spesifik Gorevler' }]} />
      <ProjeSecilmedi />
    </div>
  )

  const sinir24s = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const [{ data: gorevler }, { data: lokasyonlar }, { data: kullanicilar }, ayarlar] = await Promise.all([
    // gorevler_normal view: yıkama görevleri hariç (Oto Yıkama için ayrı sayfa)
    supabase
      .from('gorevler_normal')
      .select('*,lokasyonlar(id,tanim,parent_id),users!atanan_kullanici_id(isim_soyisim)')
      .eq('firma_id', firmaId)
      .eq('proje_id', aktifProje.id)
      .or(`durum.in.(ACIK,ISLEMDE),and(durum.eq.TAMAMLANDI,tamamlanma_tarihi.gt.${sinir24s})`)
      .order('olusturma_tarihi', { ascending: false })
      .limit(200),
    supabase
      .from('lokasyonlar')
      .select('id,tanim,aktif,parent_id,checklist_sablon_id')
      .eq('firma_id', firmaId)
      .eq('proje_id', aktifProje.id)
      .eq('aktif', true)
      .order('tanim'),
    supabase
      .from('users')
      .select('id,isim_soyisim,aktif')
      .eq('firma_id', firmaId)
      .eq('aktif', true)
      .eq('proje_id', aktifProje.id)
      .order('isim_soyisim'),
    getEfektifAyar(firmaId!, aktifProje.id),
  ])

  return (
    <div>
      <Topbar title="Spesifik Gorevler" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: aktifProje.ad }, { label: 'Spesifik Gorevler' }]} />
      <GorevlerClient
        base="/ta"
        meId={me!.id}
        readonly={me?.rol !== 'tenant_admin'}
        initialFirmaId={firmaId}
        initialGorevler={(gorevler as any) ?? []}
        initialLokasyonlar={(lokasyonlar as any) ?? []}
        initialKullanicilar={(kullanicilar as any) ?? []}
        projeId={aktifProje.id}
        personelAtamaAktif={ayarlar.spesifik_personel_atama_aktif}
        ceklistAktif={ayarlar.spesifik_ceklist_aktif}
      />
    </div>
  )
}
