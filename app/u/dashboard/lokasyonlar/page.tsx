import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import LokasyonlarClient from '@/components/lokasyon/LokasyonlarClient'
import { redirect } from 'next/navigation'
import { sayfaYetkileri } from '@/lib/yetki/sayfaYetkisi'
import { getYetkiliLokasyonIds } from '@/lib/yetki/getLokasyonYetki'
import { getOtoYikamaLokasyonIds } from '@/lib/yetki/getOtoYikamaLokasyonIds'

export const dynamic = 'force-dynamic'

export default async function ULokasyonlarPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('id,rol,firma_id,proje_id').eq('id', authUser.id).single()
  if (!me) redirect('/login')
  const firmaId = me.firma_id
  const projeId = me.proje_id

  const yetki = await sayfaYetkileri(me.rol, 'lokasyonlar', firmaId ?? null)
  if (!yetki.gorebilir) redirect('/u/dashboard')

  // Yetkili lokasyon kısıtlaması
  const yetkiliLokIds = firmaId ? await getYetkiliLokasyonIds(supabase, firmaId, projeId) : null

  // Modül izolasyonu: Oto Yıkama lokasyonları GYS UI'da gizli (yıkama personeli
  // olan U kullanıcısı için bile — yıkama akışı /oto-yikama modülünde)
  const gizliOtoIds = firmaId ? await getOtoYikamaLokasyonIds(supabase as any, firmaId) : new Set<string>()
  const gizliFilterArg = gizliOtoIds.size > 0 ? `(${[...gizliOtoIds].join(',')})` : null

  // CHUNK-AWARE: musteri yetkiliLokIds 2000+ UUID -> URL overflow -> fetch failed.
  const buildQ = (slice: string[] | null) => {
    let q = supabase
      .from('lokasyonlar')
      .select('*')
      .eq('firma_id', firmaId)
      .order('kayit_tarihi', { ascending: true })
    if (projeId) q = (q as any).eq('proje_id', projeId)
    if (slice) q = q.in('id', slice)
    if (gizliFilterArg) q = (q as any).not('id', 'in', gizliFilterArg)
    return q
  }
  let lokasyonlar: any[] = []
  if (!yetkiliLokIds) {
    const { data } = await buildQ(null)
    lokasyonlar = data ?? []
  } else {
    const seen = new Set<string>()
    for (let i = 0; i < yetkiliLokIds.length; i += 100) {
      const { data } = await buildQ(yetkiliLokIds.slice(i, i + 100))
      for (const r of (data ?? [])) {
        if (!seen.has(r.id)) { seen.add(r.id); lokasyonlar.push(r) }
      }
    }
    lokasyonlar.sort((a: any, b: any) => (a.kayit_tarihi ?? '').localeCompare(b.kayit_tarihi ?? ''))
  }

  const readonly = !yetki.duzenleyebilir && !yetki.ekleyebilir
  // tenant_user readonly olsa bile QR / ↓QR / ↓Kart butonlarını görsün; musteri'de mevcut hâli korunur
  const showReadOnlyActions = me.rol === 'tenant_user'

  return (
    <div>
      <Topbar title="Lokasyonlar" base="/u" breadcrumbs={[{ label:'Yönetim' }, { label:'Lokasyonlar' }]} />
      <LokasyonlarClient
        base="/u"
        initialFirmaId={firmaId}
        initialLokasyonlar={(lokasyonlar as any) ?? []}
        readonly={readonly}
        projeId={projeId ?? undefined}
        yetkiliLokIds={yetkiliLokIds}
        showReadOnlyActions={showReadOnlyActions}
      />
    </div>
  )
}
