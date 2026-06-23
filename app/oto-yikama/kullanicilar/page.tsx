import Topbar from '@/components/layout/Topbar'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import { getOtoYikamaFirmaId } from '@/lib/oto-yikama/getOtoYikamaFirmaId'
import { getYikamaSahaPersoneliUserIds } from '@/lib/oto-yikama/yetkililer'
import KullanicilarClient from '@/components/users/KullanicilarClient'

export const dynamic = 'force-dynamic'

/**
 * Oto Yıkama → Kullanıcılar
 *
 * Yıkama lokasyonuna birincil atanmış personel (users.ust_lokasyon_id →
 * oto_yikama_lokasyon=true). kullanici_lokasyon_yetkileri'nden gelen
 * ek yetkililer (TA, cross-functional U) bu listede gösterilmez —
 * operasyon listesi yöneticilerle kirlenmesin.
 *
 * GYS Kullanıcılar sayfasının KullanicilarClient'ını reuse eder: tüm CRUD
 * butonları (Düzenle, Şifre, Bildirim, Cihaz Sil, Pasif Yap, Sil) otomatik
 * gelir. Yetki rol bazlı (SA/TA yönetir, U sadece görür).
 */
export default async function OtoYikamaKullanicilarPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const supabase = createClient()
  const admin = createAdminClient()
  const firmaId = await getOtoYikamaFirmaId(admin as any, me)

  if (!firmaId) {
    return (
      <div>
        <Topbar title="Kullanıcılar" base={rolBase} breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Kullanıcılar' }]} hideScopeControls hideNotifBar />
        <div style={{ padding: '24px 28px' }}>
          <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Görüntülemek için üstten bir firma seçin.
          </div>
        </div>
      </div>
    )
  }

  // Yıkama personeli ID'leri (sadece birincil ataması olanlar)
  const sahaUserIds = await getYikamaSahaPersoneliUserIds(admin as any, firmaId)

  // Tam users.* row'ları (KullanicilarClient tam objeyi bekliyor)
  let users: any[] = []
  if (sahaUserIds.length > 0) {
    const { data } = await admin
      .from('users')
      .select('*')
      .in('id', sahaUserIds)
      .order('isim_soyisim')
    users = data ?? []
  }

  // Oto Yıkama üst lokasyonları (Create modal'daki üst lokasyon dropdown'u için)
  const { data: ustLokRaw } = await admin
    .from('lokasyonlar')
    .select('id,tanim,oto_yikama_lokasyon')
    .eq('firma_id', firmaId)
    .eq('oto_yikama_lokasyon', true)
    .is('parent_id', null)
    .eq('aktif', true)
    .order('tanim')

  // Alt lokasyonlar (istasyonlar) — Oto Yıkama üstlerinin altındakiler
  const ustIds = (ustLokRaw ?? []).map((l: any) => l.id)
  let altLokRaw: { id: string; tanim: string; parent_id: string }[] = []
  if (ustIds.length > 0) {
    const { data: alt } = await admin
      .from('lokasyonlar')
      .select('id,tanim,parent_id')
      .in('parent_id', ustIds)
      .eq('aktif', true)
      .order('tanim')
    altLokRaw = (alt as any) ?? []
  }

  // Yetkiler — SA/TA yönetir, U/M sadece görür
  const isYonetici = me.rol === 'super_admin' || me.rol === 'alt_super_admin' || me.rol === 'tenant_admin'

  return (
    <div>
      <Topbar
        title="Kullanıcılar"
        base={rolBase}
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Kullanıcılar' }]}
        hideScopeControls hideNotifBar
      />
      <div style={{ padding: '24px 28px' }}>
        <KullanicilarClient
          base={rolBase as '/sa' | '/ta' | '/u'}
          firmaId={firmaId}
          initialUsers={users as any}
          canCreate={isYonetici}
          canManage={isYonetici}
          canDelete={isYonetici}
          ustLokasyonlar={(ustLokRaw as any) ?? []}
          altLokasyonlar={altLokRaw}
        />
      </div>
    </div>
  )
}
