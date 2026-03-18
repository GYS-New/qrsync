import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import ArsivClient from '@/components/arsiv/ArsivClient'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import PasswordGate from '@/components/security/PasswordGate'

export const dynamic = 'force-dynamic'

export default async function TAArsivPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  if (!me || me.rol !== 'tenant_admin') redirect('/ta/dashboard')

  const firmaId = me.firma_id ?? null
  const aktifProje = await getAktifProje(firmaId)
  if (!aktifProje) {
    return (
      <div>
        <Topbar title="Arşiv" base="/ta" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Arşiv' }]} />
        <ProjeSecilmedi />
      </div>
    )
  }

  const sel = `*, lokasyonlar(id,tanim), atanan:users!atanan_kullanici_id(isim_soyisim), olusturan:users!olusturan_id(isim_soyisim), tamamlayan:users!tamamlayan_kullanici_id(isim_soyisim), iptalEden:users!iptal_eden_id(isim_soyisim), islemi_yapan:users!islemi_yapan_id(isim_soyisim), kural:gorev_kurallari!arsiv_kural_fkey(tanim)`
  const { data: arsiv } = await supabase
    .from('canli_gorevler_arsiv')
    .select(sel)
    .eq('firma_id', firmaId)
    .eq('proje_id', aktifProje.id)
    .order('arsiv_tarihi', { ascending: false })
    .limit(1000)

  return (
    <div>
      <Topbar title="Arşiv" base="/ta" breadcrumbs={[{ label: 'Yönetim' }, { label: aktifProje.ad }, { label: 'Arşiv' }]} />
      <PasswordGate
        storageKey="qrsync_ta_archive_verified_at"
        ttlMs={10 * 60 * 1000}
        title="Arşiv erişimi için şifre doğrulama"
        description="Güvenlik nedeniyle Arşiv ekranını açmadan önce şifrenizi tekrar girmeniz gerekiyor."
      >
        <ArsivClient base="/ta" initialArsiv={(arsiv as any) ?? []} tenantFirmaId={firmaId} />
      </PasswordGate>
    </div>
  )
}

