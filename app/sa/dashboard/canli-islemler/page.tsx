import { createClient } from '@/lib/supabase/server'
import Topbar from '@/components/layout/Topbar'
import CanliIslemlerClient from '@/components/canli/CanliIslemlerClient'
import { redirect } from 'next/navigation'
import { getAktifFirmaId } from '@/lib/firmalar/getAktifFirmaId'
import { getAktifProje } from '@/lib/projeler/getAktifProje'
import { getEfektifAyar } from '@/lib/ayarlar/getEfektifAyar'

export const dynamic = 'force-dynamic'

export default async function SACanliIslemlerPage() {
  const supabase = createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) redirect('/login')

  const { data: me } = await supabase.from('users').select('*').eq('id', authUser.id).single()
  if (!me || (me.rol !== 'super_admin' && me.rol !== 'alt_super_admin')) redirect('/login')

  const firmaId = getAktifFirmaId()

  if (!firmaId) {
    return (
      <div>
        <Topbar title="Frekansiyel Görevler" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Frekansiyel Görevler' }]} />
        <div style={{ padding: '24px 28px' }}>
          <div className="verde-card">
            <div style={{ padding: '18px' }}>
              <div style={{ fontWeight: 700, color: '#111827', marginBottom: 6 }}>Firma seçimi gerekli</div>
              <div style={{ color: '#6b7280', fontSize: 12.5 }}>Süper Admin olarak frekansiyel görev oluşturmak / düzenlemek için üstteki listeden bir firma seçin.</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const aktifProje = await getAktifProje(firmaId)
  const projeId = aktifProje?.id ?? null

  let lokQ = supabase.from('lokasyonlar').select('id,tanim,aktif,parent_id,checklist_sablon_id').eq('firma_id', firmaId).eq('aktif', true).order('tanim')
  if (projeId) lokQ = (lokQ as any).eq('proje_id', projeId)

  let gorevQ = supabase.from('canli_gorevler')
    .select('*,lokasyonlar(tanim),users!atanan_kullanici_id(isim_soyisim)')
    .eq('firma_id', firmaId)
    .order('olusturma_tarihi', { ascending: false })
    .limit(50)
  if (projeId) gorevQ = (gorevQ as any).or(`proje_id.eq.${projeId},proje_id.is.null`)

  const [{ data: lokasyonlar }, { data: kullanicilar }, { data: canliGorevler }] = await Promise.all([
    lokQ,
    (() => { let q = supabase.from('users').select('id,isim_soyisim,profil_foto').eq('firma_id', firmaId).eq('aktif', true); if (projeId) q = (q as any).eq('proje_id', projeId); return q })(),
    gorevQ,
  ])

  return (
    <div>
      <Topbar title="Frekansiyel Görevler" base="/sa" breadcrumbs={[{ label: 'Yönetim' }, { label: 'Frekansiyel Görevler' }]} />
      <CanliIslemlerClient
        firmaId={firmaId}
        lokasyonlar={lokasyonlar ?? []}
        kullanicilar={kullanicilar ?? []}
        initialGorevler={canliGorevler ?? []}
        meId={me.id}
        projeId={projeId}
        readonly={false}
        canliAkisSureSaat={firmaId ? (await getEfektifAyar(firmaId, projeId)).canli_akis_sure_saat : 8}
      />
    </div>
  )
}
