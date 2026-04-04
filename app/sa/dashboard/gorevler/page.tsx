import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import GorevlerClient from '@/components/gorev/GorevlerClient'
import { redirect } from 'next/navigation'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { getEfektifAyar } from '@/lib/ayarlar/getEfektifAyar'

export const dynamic = 'force-dynamic'

export default async function SAGorevlerPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')
  const { data: me } = await supabase.from('users').select('id').eq('id', authUser.id).single()

  const firmaId = getAktifFirmaId()
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null
  const projeId = aktifProje?.id ?? null

  const sinir24s = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  let gorevQ = firmaId
    ? supabase.from('gorevler').select('*,lokasyonlar(id,tanim,parent_id),users!atanan_kullanici_id(isim_soyisim)')
        .eq('firma_id', firmaId).or(`durum.in.(ACIK,ISLEMDE),and(durum.eq.TAMAMLANDI,tamamlanma_tarihi.gt.${sinir24s})`).order('olusturma_tarihi', { ascending: false }).limit(200)
    : null
  if (gorevQ && projeId) gorevQ = (gorevQ as any).eq('proje_id', projeId)

  let lokQ = firmaId
    ? supabase.from('lokasyonlar').select('id,tanim,aktif,parent_id,checklist_sablon_id').eq('firma_id', firmaId).eq('aktif', true).order('tanim')
    : null
  if (lokQ && projeId) lokQ = (lokQ as any).eq('proje_id', projeId)

  const [gorevlerRes, lokasyonlarRes, kullanicilarRes, ayarlar] = await Promise.all([
    gorevQ ?? Promise.resolve({ data: [] as any[] }),
    lokQ ?? Promise.resolve({ data: [] as any[] }),
    firmaId
      ? supabase.from('users').select('id,isim_soyisim,aktif').eq('firma_id', firmaId).eq('aktif', true).eq('proje_id', projeId).order('isim_soyisim')
      : Promise.resolve({ data: [] as any[] }),
    firmaId ? getEfektifAyar(firmaId, projeId) : Promise.resolve({ spesifik_personel_atama_aktif: true, spesifik_ceklist_aktif: true } as any),
  ])

  return (
    <div>
      <Topbar title="Görevler" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Görevler' }]} />
      <GorevlerClient
        base="/sa"
        meId={me!.id}
        readonly={false}
        initialFirmaId={firmaId}
        projeId={projeId}
        initialGorevler={(gorevlerRes.data as any) ?? []}
        initialLokasyonlar={(lokasyonlarRes.data as any) ?? []}
        initialKullanicilar={(kullanicilarRes.data as any) ?? []}
        personelAtamaAktif={ayarlar.spesifik_personel_atama_aktif}
        ceklistAktif={ayarlar.spesifik_ceklist_aktif}
      />
    </div>
  )
}
