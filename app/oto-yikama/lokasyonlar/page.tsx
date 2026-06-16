import Topbar from '@/components/layout/Topbar'
import LokasyonlarClient from '@/components/lokasyon/LokasyonlarClient'
import { createClient } from '@/lib/supabase/server'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { assertModulYetkisi } from '@/lib/modul/serverYetki'
import { getRolBase } from '@/lib/modul/cookie'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

export const dynamic = 'force-dynamic'

/**
 * Oto Yıkama → Lokasyonlar
 *
 * GYS Lokasyonlar sayfasının "sadece Oto Yıkama" versiyonu.
 * Görünenler: `lokasyonlar.oto_yikama_lokasyon=true` olan üst lokasyonlar
 * ve tüm alt hiyerarşisi.
 */
export default async function OtoYikamaLokasyonlarPage() {
  const { me } = await assertModulYetkisi('oto_yikama')
  const rolBase = getRolBase(me.rol)
  const isSA = me.rol === 'super_admin' || me.rol === 'alt_super_admin'

  const supabase = createClient()
  const firmaId = isSA ? getAktifFirmaId() : me.firma_id
  const aktifProje = firmaId ? await getAktifProje(firmaId) : null
  const { data: firmaData } = firmaId
    ? await supabase.from('firmalar').select('qr_sablon_aktif').eq('id', firmaId).single()
    : { data: null }
  const qrSablonAktif = firmaData?.qr_sablon_aktif !== false

  if (!firmaId) {
    return (
      <div>
        <Topbar title="Lokasyonlar" base={rolBase} breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Lokasyonlar' }]} hideScopeControls />
        <div style={{ padding: '24px 28px' }}>
          <div className="verde-card" style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            Görüntülemek için üstten bir firma seçin.
          </div>
        </div>
      </div>
    )
  }

  const otoYikamaIds = await getOtoYikamaLokasyonIds(supabase as any, firmaId)
  let lokasyonlar: any[] = []
  if (otoYikamaIds.size > 0) {
    let q = supabase
      .from('lokasyonlar')
      .select('*')
      .eq('firma_id', firmaId)
      .in('id', [...otoYikamaIds])
      .order('kayit_tarihi', { ascending: true })
    if (aktifProje?.id) q = q.eq('proje_id', aktifProje.id)
    const { data } = await q
    lokasyonlar = data ?? []
  }

  return (
    <div>
      <Topbar
        title="Lokasyonlar"
        base={rolBase}
        breadcrumbs={[{ label: 'Oto Yıkama', href: '/oto-yikama/dashboard' }, { label: 'Lokasyonlar' }]}
        hideScopeControls
      />
      <LokasyonlarClient
        base={rolBase as any}
        initialFirmaId={firmaId}
        projeId={aktifProje?.id ?? null}
        initialLokasyonlar={lokasyonlar}
        readonly={false}
        qrSablonAktif={qrSablonAktif}
        yetkiliLokIds={[...otoYikamaIds]}
      />
    </div>
  )
}
