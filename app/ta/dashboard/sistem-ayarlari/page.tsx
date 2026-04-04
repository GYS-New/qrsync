import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import SistemAyarlariClient from '@/components/sistem-ayarlari/SistemAyarlariClient'
import { ensureDashboardDefaults } from '@/lib/dashboard/ensureDefaults'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { getEfektifAyar } from '@/lib/ayarlar/getEfektifAyar'
import { createAdminClient } from '@/lib/supabase/server'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'

export const dynamic = 'force-dynamic'

export default async function TASistemAyarlariPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase
    .from('users')
    .select('rol, firma_id')
    .eq('id', authUser.id)
    .single()

  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')

  const meId = authUser.id
  const firmaId = me.firma_id as string
  const bloklar = await ensureDashboardDefaults(meId)

  const aktifProje = await getAktifProje(firmaId)
  if (!aktifProje) {
    return (
      <div>
        <Topbar
          title="Sistem Ayarları"
          base="/ta"
          breadcrumbs={[{ label: 'Sistem' }, { label: 'Sistem Ayarları' }]}
        />
        <ProjeSecilmedi />
      </div>
    )
  }

  const admin = createAdminClient()
  const [{ data: lokasyonlar }, { data: kullanicilar }, ayarlar] = await Promise.all([
    supabase.from('lokasyonlar')
      .select('id, tanim, parent_id, aktif, hedef_sure_dakika, min_sure_dakika, max_sure_dakika, gunluk_frekans_sayisi')
      .eq('firma_id', firmaId).eq('proje_id', aktifProje.id).order('tanim', { ascending: true }),
    supabase.from('users')
      .select('id,isim_soyisim').eq('firma_id', firmaId).eq('aktif', true)
      .eq('proje_id', aktifProje.id).order('isim_soyisim'),
    getEfektifAyar(firmaId, aktifProje.id),
  ])

  // Yetki verileri
  const { data: firmaYetkileri } = await admin.from('kullanici_grubu_yetkileri').select('*')
    .eq('firma_id', firmaId).in('rol', ['musteri', 'tenant_user']).order('rol').order('sayfa_kodu')
  let initialYetkileri = firmaYetkileri ?? []
  if (initialYetkileri.length === 0) {
    const { data: global } = await admin.from('kullanici_grubu_yetkileri').select('*')
      .is('firma_id', null).in('rol', ['musteri', 'tenant_user']).order('rol').order('sayfa_kodu')
    initialYetkileri = (global ?? []).map((y: any) => ({ ...y, firma_id: firmaId }))
  }

  return (
    <div>
      <Topbar
        title="Sistem Ayarları"
        base="/ta"
        breadcrumbs={[{ label: 'Sistem' }, { label: aktifProje.ad }, { label: 'Sistem Ayarları' }]}
      />
      <SistemAyarlariClient
        meId={meId}
        base="/ta"
        initialBloklar={(bloklar as any) ?? []}
        lokasyonlar={lokasyonlar ?? []}
        kullanicilar={(kullanicilar as any) ?? []}
        isSA={false}
        firmaId={firmaId}
        projeId={aktifProje.id}
        personelAtamaAktif={ayarlar.frekansiyel_personel_atama_aktif}
        initialYetkileri={initialYetkileri as any}
        yetkiApiEndpoint="/api/ta/grup-yetkileri"
        yetkilLimitRoller={['musteri', 'tenant_user']}
        yetkiGizliSayfalar={['firmalar', 'projeler']}
      />
    </div>
  )
}
