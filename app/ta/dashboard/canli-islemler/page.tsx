import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import CanliIslemlerClient from '@/components/canli/CanliIslemlerClient'
import { redirect } from 'next/navigation'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { getEfektifAyar } from '@/lib/ayarlar/getEfektifAyar'
import { getDescendantIds } from '@/lib/lokasyon/getDescendantIds'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

export const dynamic = 'force-dynamic'

export default async function CanliIslemlerPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('*').eq('id', authUser.id).single()
  const firmaId = me?.firma_id

  // Üst lokasyon scope filtresi — header'daki seçici cookie'ye yazıyor
  const aktifUstLokasyonId = cookies().get('qrsync_aktif_ust_lokasyon_id')?.value ?? null
  const yetkiliLokIds = await getDescendantIds(aktifUstLokasyonId, firmaId ?? null)

  const aktifProje = await getAktifProje(firmaId ?? null)
  if (!aktifProje) return (
    <div>
      <Topbar title="Frekansiyel Gorevler" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: 'Frekansiyel Gorevler' }]} />
      <ProjeSecilmedi />
    </div>
  )

  // Modül izolasyonu: Oto Yıkama lokasyonları + görevleri GYS UI'da gizli
  const gizliOtoIds = firmaId ? await getOtoYikamaLokasyonIds(supabase as any, firmaId) : new Set<string>()
  const gizliFilterArg = gizliOtoIds.size > 0 ? `(${[...gizliOtoIds].join(',')})` : null

  let lokQ = supabase.from('lokasyonlar').select('id,tanim,aktif,parent_id,checklist_sablon_id').eq('firma_id', firmaId).eq('proje_id', aktifProje.id).eq('aktif', true).order('tanim')
  if (gizliFilterArg) lokQ = (lokQ as any).not('id', 'in', gizliFilterArg)
  let canliQ = supabase.from('canli_gorevler').select('*,lokasyonlar(tanim),users!atanan_kullanici_id(isim_soyisim)').eq('firma_id', firmaId).or(`proje_id.eq.${aktifProje.id},proje_id.is.null`).order('olusturma_tarihi', { ascending: false }).limit(50)
  if (gizliFilterArg) canliQ = (canliQ as any).not('lokasyon_id', 'in', gizliFilterArg)

  const [{ data: lokasyonlar }, { data: kullanicilar }, { data: canliGorevler }] = await Promise.all([
    lokQ,
    supabase.from('users').select('id,isim_soyisim,profil_foto').eq('firma_id', firmaId).eq('aktif', true).eq('proje_id', aktifProje.id),
    canliQ,
  ])

  const efektifAyar = await getEfektifAyar(firmaId, aktifProje.id)

  return (
    <div>
      <Topbar
        title="Frekansiyel Gorevler"
        base="/ta"
        breadcrumbs={[{ label: 'Yonetim' }, { label: aktifProje.ad }, { label: 'Frekansiyel Gorevler' }]}
      />
      <CanliIslemlerClient
        firmaId={firmaId}
        lokasyonlar={lokasyonlar ?? []}
        kullanicilar={kullanicilar ?? []}
        initialGorevler={canliGorevler ?? []}
        meId={me.id}
        meName={me.isim_soyisim ?? undefined}
        projeId={aktifProje.id}
        yetkiliLokIds={yetkiliLokIds}
        gizliOtoYikamaLokIds={[...gizliOtoIds]}
        readonly={me.rol === 'tenant_user'}
        canliAkisSureSaat={efektifAyar.canli_akis_sure_saat}
        ceklistAktif={efektifAyar.frekansiyel_ceklist_aktif}
        personelAtamaAktif={efektifAyar.frekansiyel_personel_atama_aktif}
        islemSureleriAktif={efektifAyar.islem_sureleri_aktif}
      />
    </div>
  )
}
