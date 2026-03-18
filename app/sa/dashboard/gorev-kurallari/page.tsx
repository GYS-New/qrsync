import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import GorevKurallariClient from '@/components/gorev-kurallari/GorevKurallariClient'
import { redirect } from 'next/navigation'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'

export const dynamic = 'force-dynamic'

export default async function SAGorevKurallariPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) redirect('/login')

  const firmaId = getAktifFirmaId()

  if (!firmaId) {
    return (
      <div>
        <Topbar title="Görev Kuralları" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Görev Kuralları' }]} />
        <div style={{ padding: '24px 28px' }}>
          <div className="verde-card" style={{ padding: 20, color: '#7a907a', fontSize: 14 }}>Görüntülemek için üstten bir firma seçin.</div>
        </div>
      </div>
    )
  }

  const aktifProje = await getAktifProje(firmaId)
  const projeId = aktifProje?.id ?? null

  let kuralQ = supabase.from('gorev_kurallari')
    .select('*,lokasyonlar(id,tanim,parent_id),atanan_kullanici:users!gorev_kurallari_atanan_kullanici_id_fkey(id,isim_soyisim)')
    .eq('firma_id', firmaId).order('kayit_tarihi', { ascending: false })
  if (projeId) kuralQ = (kuralQ as any).eq('proje_id', projeId)

  let lokQ = supabase.from('lokasyonlar').select('id,tanim,parent_id,aktif')
    .eq('firma_id', firmaId).eq('aktif', true).order('tanim')
  if (projeId) lokQ = (lokQ as any).eq('proje_id', projeId)

  const [{ data: kuralar }, { data: lokasyonlar }, { data: kullanicilar }] = await Promise.all([
    kuralQ,
    lokQ,
    supabase.from('users').select('id,isim_soyisim').eq('firma_id', firmaId).eq('aktif', true).order('isim_soyisim'),
  ])

  return (
    <div>
      <Topbar title="Görev Kuralları" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Görev Kuralları' }]} />
      <GorevKurallariClient
        base="/sa"
        firmaId={firmaId}
        projeId={projeId}
        meId={me.id}
        initialKuralar={(kuralar as any) ?? []}
        lokasyonlar={(lokasyonlar as any) ?? []}
        kullanicilar={(kullanicilar as any) ?? []}
        readonly={false}
      />
    </div>
  )
}
