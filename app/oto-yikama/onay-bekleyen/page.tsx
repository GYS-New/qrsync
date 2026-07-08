import { redirect } from 'next/navigation'
import Topbar from '@/components/layout/Topbar'
import { createAdminClient } from '@/lib/supabase/server'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import { getOtoYikamaFirmaId } from '@/lib/oto-yikama/getOtoYikamaFirmaId'
import OnayBekleyenClient from '@/components/oto-yikama/OnayBekleyenClient'

export const dynamic = 'force-dynamic'

/**
 * Oto Yıkama > Onay Bekleyenler
 *
 * Amir + SA görebilir. Tanımsız plaka yıkamalarını onaylar / düzenler / reddeder.
 * Mobil spec 40a291f6 (1.0.34) doğrultusunda backend akışı.
 */
export default async function OnayBekleyenPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const admin = createAdminClient()
  const firmaId = await getOtoYikamaFirmaId(admin as any, me)
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'

  // Yetki: SA veya firmanın amir'i
  if (!isSA) {
    if (!firmaId) redirect('/oto-yikama/dashboard')
    const { data: firma } = await admin
      .from('firmalar')
      .select('oto_yikama_onay_yetkilisi_id')
      .eq('id', firmaId)
      .single()
    if ((firma as any)?.oto_yikama_onay_yetkilisi_id !== me.id) {
      redirect('/oto-yikama/dashboard')
    }
  }

  // İstasyon dropdown'ı için — amir düzenleme modalında varsayılan_lokasyon seçebilsin
  let istasyonlar: { id: string; tanim: string }[] = []
  if (firmaId) {
    const { data: yikamaUst } = await admin
      .from('lokasyonlar')
      .select('id')
      .eq('firma_id', firmaId)
      .eq('aktif', true)
      .ilike('tanim', '%araç yıkama%')
    const ustIds = ((yikamaUst ?? []) as any[]).map(u => u.id)
    if (ustIds.length > 0) {
      const { data: alt } = await admin
        .from('lokasyonlar')
        .select('id, tanim')
        .eq('firma_id', firmaId)
        .eq('aktif', true)
        .in('parent_id', ustIds)
        .order('tanim')
      istasyonlar = ((alt ?? []) as any[]).map(l => ({ id: l.id, tanim: l.tanim ?? '—' }))
    }
  }

  return (
    <div>
      <Topbar
        title="Onay Bekleyenler"
        base={rolBase}
        hideScopeControls
        hideNotifBar
        breadcrumbs={[
          { label: 'Oto Yıkama', href: '/oto-yikama/dashboard' },
          { label: 'Onay Bekleyenler' },
        ]}
      />
      {!firmaId ? (
        <div style={{ padding: '24px 28px' }}>
          <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Görüntülemek için üstten bir firma seçin.
          </div>
        </div>
      ) : (
        <OnayBekleyenClient firmaId={firmaId} istasyonlar={istasyonlar} />
      )}
    </div>
  )
}
