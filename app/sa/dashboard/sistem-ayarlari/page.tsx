import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import SistemAyarlariClient from '@/components/sistem-ayarlari/SistemAyarlariClient'
import { ensureDashboardDefaults } from '@/lib/dashboard/ensureDefaults'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { getEfektifAyar } from '@/lib/ayarlar/getEfektifAyar'
import { createAdminClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function SASistemAyarlariPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase
    .from('users')
    .select('rol')
    .eq('id', authUser.id)
    .single()

  if (!me || !['super_admin', 'alt_super_admin'].includes(me.rol)) {
    redirect('/sa/dashboard')
  }

  const meId = authUser.id
  const bloklar = await ensureDashboardDefaults(meId)

  const firmaId = getAktifFirmaId()
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null
  const projeId = aktifProje?.id ?? null

  let lokasyonlar: any[] = []
  let kullanicilar: any[] = []
  if (firmaId) {
    // Sistem Ayarları sayfası kullanıcı yetkilendirme akışlarını da içerir
    // (Lokasyon Yetkileri sekmesi). Bu sekmeden SA "ARAÇ YIKAMA" üst lokasyonuna
    // atama yapacağı için Oto Yıkama lokasyonları LİSTEDE OLMALI — modül
    // izolasyonu burada uygulanmaz.
    let q = supabase
      .from('lokasyonlar')
      .select('id, tanim, parent_id, aktif, hedef_sure_dakika, min_sure_dakika, max_sure_dakika, gunluk_frekans_sayisi, haftalik_frekans_sayisi')
      .eq('firma_id', firmaId)
      .order('tanim', { ascending: true })
    if (projeId) q = (q as any).eq('proje_id', projeId)
    const { data } = await q
    lokasyonlar = data ?? []

    let uq = supabase.from('users').select('id,isim_soyisim').eq('firma_id', firmaId).eq('aktif', true).order('isim_soyisim')
    if (projeId) uq = (uq as any).eq('proje_id', projeId)
    const { data: uData } = await uq
    kullanicilar = uData ?? []
  }

  const ayarlar = firmaId ? await getEfektifAyar(firmaId, projeId) : null

  // Yetki verileri
  const admin = createAdminClient()
  const { data: firmalar } = await admin.from('firmalar').select('id,firma_adi,ticari_unvan').eq('aktif', true).order('ticari_unvan')
  let yetkileriQ = admin.from('kullanici_grubu_yetkileri').select('*').order('rol').order('sayfa_kodu')
  yetkileriQ = firmaId ? yetkileriQ.eq('firma_id', firmaId) : yetkileriQ.is('firma_id', null)
  const { data: yetkileri } = await yetkileriQ
  let initialYetkileri = yetkileri ?? []
  if (firmaId && initialYetkileri.length === 0) {
    const { data: global } = await admin.from('kullanici_grubu_yetkileri').select('*').is('firma_id', null).order('rol').order('sayfa_kodu')
    initialYetkileri = (global ?? []).map((y: any) => ({ ...y, firma_id: firmaId }))
  }

  return (
    <div>
      <Topbar
        title="Sistem Ayarları"
        base="/sa"
        breadcrumbs={[{ label: 'Sistem' }, { label: 'Sistem Ayarları' }]}
      />
      <SistemAyarlariClient
        meId={meId}
        base="/sa"
        initialBloklar={(bloklar as any) ?? []}
        lokasyonlar={lokasyonlar}
        kullanicilar={kullanicilar}
        isSA={true}
        firmaId={firmaId}
        projeId={projeId}
        personelAtamaAktif={ayarlar?.frekansiyel_personel_atama_aktif ?? true}
        initialYetkileri={initialYetkileri as any}
        firmalar={(firmalar as any) ?? []}
        yetkiApiEndpoint="/api/sa/grup-yetkileri"
      />
    </div>
  )
}
