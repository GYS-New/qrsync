import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import KullanicilarClient from '@/components/users/KullanicilarClient'
import { redirect } from 'next/navigation'
import ProjeSecilmedi from '@/components/projeler/ProjeSecilmedi'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
export const dynamic = 'force-dynamic'

export default async function TAKullanicilarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id').eq('id', authUser.id).single()
  const firmaId = me?.firma_id

  const aktifProje = await getAktifProje(firmaId ?? null)
  if (!aktifProje) return (
    <div>
      <Topbar title="Kullanicilar" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: 'Kullanicilar' }]} />
      <ProjeSecilmedi />
    </div>
  )

  // Aktif projeye bağlı tenant_user (personel) + musteri rollerini göster.
  // Üst lokasyon dropdown'ında Oto Yıkama DA gösterilir — bu sayfa kullanıcı
  // atama UI'sıdır, TA buradan personeli "ARAÇ YIKAMA" üst lokasyonuna atayıp
  // Oto Yıkama yetkisini verebilir. (Modül izolasyonu sadece veri/görev
  // sayfalarında geçerli, yetkilendirme sayfalarında değil.)
  const [{ data: users }, { data: lokasyonlar }, { data: altLoklarRaw }] = await Promise.all([
    supabase.from('users').select('*').eq('firma_id', firmaId).in('rol', ['tenant_user', 'musteri']).eq('proje_id', aktifProje.id).order('kayit_tarihi', { ascending: false }),
    supabase.from('lokasyonlar').select('id,tanim,oto_yikama_lokasyon').eq('firma_id', firmaId).eq('proje_id', aktifProje.id).is('parent_id', null).eq('aktif', true).order('tanim'),
    // Tüm aktif alt lokasyonlar (parent_id dolu) — client conditional için
    // sadece oto_yikama_lokasyon üst lokasyonlara bağlı olanlar lazım ama tüm
    // alt lokasyonları getirip client'ta filtreleyelim (basit, az sorgu).
    supabase.from('lokasyonlar').select('id,tanim,parent_id').eq('firma_id', firmaId).eq('proje_id', aktifProje.id).not('parent_id', 'is', null).eq('aktif', true).order('tanim'),
  ])

  return (
    <div>
      <Topbar title="Kullanicilar" base="/ta" breadcrumbs={[{ label: 'Yonetim' }, { label: aktifProje.ad }, { label: 'Kullanicilar' }]} />
      <KullanicilarClient
        base="/ta"
        firmaId={firmaId}
        initialUsers={(users as any) ?? []}
        canCreate={me?.rol === 'tenant_admin'}
        canManage={me?.rol === 'tenant_admin'}
        enableBulkImport={me?.rol === 'tenant_admin'}
        projeId={aktifProje.id}
        ustLokasyonlar={(lokasyonlar as any) ?? []}
        altLokasyonlar={(altLoklarRaw as any) ?? []}
      />
    </div>
  )
}
