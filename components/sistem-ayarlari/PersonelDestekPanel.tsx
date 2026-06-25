'use client'

import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { createClient } from '@/lib/supabase/client'

type Ayar = {
  id: string
  ust_lokasyon_id: string
  hedef_oran: number
  aktif: boolean
  personel_idler: string[]
}

type Lokasyon = {
  id: string
  tanim: string
  parent_id?: string | null
}

type Personel = {
  id: string
  isim_soyisim: string
  cinsiyet?: string | null
}

export default function PersonelDestekPanel({ firmaId, projeId, lokasyonlar }: {
  firmaId: string
  projeId: string | null
  lokasyonlar: Lokasyon[]
}) {
  const [ayarlar, setAyarlar] = useState<Ayar[]>([])
  const [personeller, setPersoneller] = useState<Personel[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [acikPanel, setAcikPanel] = useState<string | null>(null)
  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])

  const ustLokasyonlar = lokasyonlar.filter(l => !l.parent_id)

  // Üst lokasyon bazlı personel map
  const [personelMap, setPersonelMap] = useState<Map<string, Personel[]>>(new Map())

  useEffect(() => {
    yukle()
    personelYukle()
  }, [firmaId, projeId])

  async function yukle() {
    try {
      const qp = new URLSearchParams({ firma_id: firmaId })
      if (projeId) qp.set('proje_id', projeId)
      const res = await fetch(`/api/personel-destek?${qp}`)
      const j = await res.json()
      setAyarlar(j.data ?? [])
    } catch {}
    setLoading(false)
  }

  async function personelYukle() {
    // İki kaynak OR'lanır: users.ust_lokasyon_id (bağlanma) +
    // kullanici_lokasyon_yetkileri (atanma). Çanakkale gibi sadece atanma ile
    // çalışan projelerde bağlanma boş olabilir; her iki kaynaktaki personel
    // o üst lokasyon için PD'nin görev tamamlayıcısı olmaya uygundur.
    const [usersRes, yetkiRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, isim_soyisim, cinsiyet, ust_lokasyon_id')
        .eq('firma_id', firmaId)
        .eq('aktif', true)
        .in('rol', ['tenant_user'])
        .order('isim_soyisim'),
      supabase
        .from('kullanici_lokasyon_yetkileri')
        .select('user_id, ust_lokasyon_id, users!inner(id, isim_soyisim, cinsiyet, aktif, rol, firma_id)')
        .eq('firma_id', firmaId)
        .eq('users.aktif', true)
        .eq('users.firma_id', firmaId)
        .in('users.rol', ['tenant_user']),
    ])

    // Üst lokasyon bazında map; aynı user iki kaynaktan gelirse tek listele
    const map = new Map<string, Map<string, Personel>>()
    const tumPersoneller = new Map<string, Personel>()

    const ensure = (ustLokId: string) => {
      if (!map.has(ustLokId)) map.set(ustLokId, new Map())
      return map.get(ustLokId)!
    }

    // Kaynak A: ust_lokasyon_id (bağlanma)
    for (const u of ((usersRes.data ?? []) as any[])) {
      const p: Personel = { id: u.id, isim_soyisim: u.isim_soyisim, cinsiyet: u.cinsiyet }
      tumPersoneller.set(u.id, p)
      if (u.ust_lokasyon_id) ensure(u.ust_lokasyon_id).set(u.id, p)
    }
    // Kaynak B: kullanici_lokasyon_yetkileri (atanma)
    for (const y of ((yetkiRes.data ?? []) as any[])) {
      const u = y.users
      if (!u) continue
      const p: Personel = { id: u.id, isim_soyisim: u.isim_soyisim, cinsiyet: u.cinsiyet }
      tumPersoneller.set(u.id, p)
      if (y.ust_lokasyon_id) ensure(y.ust_lokasyon_id).set(u.id, p)
    }

    const flatMap = new Map<string, Personel[]>()
    for (const [k, v] of map) {
      flatMap.set(k, Array.from(v.values()).sort((a, b) => a.isim_soyisim.localeCompare(b.isim_soyisim, 'tr')))
    }
    setPersonelMap(flatMap)
    setPersoneller(Array.from(tumPersoneller.values()))
  }

  function getAyar(ustLokId: string): Ayar | undefined {
    return ayarlar.find(a => a.ust_lokasyon_id === ustLokId)
  }

  async function kaydetVeya(ustLokId: string, hedefOran: number) {
    const mevcut = getAyar(ustLokId)
    setSaving(ustLokId)
    try {
      if (mevcut) {
        await fetch('/api/personel-destek', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: mevcut.id, hedef_oran: hedefOran }),
        })
      } else {
        await fetch('/api/personel-destek', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firma_id: firmaId, proje_id: projeId, ust_lokasyon_id: ustLokId, hedef_oran: hedefOran }),
        })
      }
      await yukle()
      toast({ type: 'success', title: 'Kaydedildi', message: `Hedef oran %${hedefOran} olarak güncellendi.` })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSaving(null)
  }

  async function personelGuncelle(destekId: string, personelIdler: string[]) {
    await fetch('/api/personel-destek', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: destekId, personel_idler: personelIdler }),
    })
    await yukle()
  }

  async function toggle(ustLokId: string) {
    const mevcut = getAyar(ustLokId)
    setSaving(ustLokId)
    try {
      if (mevcut) {
        // Açılıyorsa personel kontrolü
        if (!mevcut.aktif && (!mevcut.personel_idler || mevcut.personel_idler.length === 0)) {
          toast({ type: 'error', title: 'Personel gerekli', message: 'Önce personel seçimi yapın.' })
          setSaving(null)
          return
        }
        await fetch('/api/personel-destek', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: mevcut.id, aktif: !mevcut.aktif }),
        })
      } else {
        await fetch('/api/personel-destek', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firma_id: firmaId, proje_id: projeId, ust_lokasyon_id: ustLokId, hedef_oran: 80 }),
        })
        toast({ type: 'info', title: 'Oluşturuldu', message: 'Personel seçimi yapıp ardından aktifleştirin.' })
      }
      await yukle()
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSaving(null)
  }

  async function sil(id: string) {
    if (!confirm('Bu destek kaydını silmek istediğinize emin misiniz?')) return
    setSaving(id)
    try {
      await fetch('/api/personel-destek', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      await yukle()
      toast({ type: 'success', title: 'Silindi', message: 'Destek kaydı kaldırıldı.' })
    } catch {}
    setSaving(null)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <div className="verde-spinner" />
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Personel Görev Desteği</div>
        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
          Her vardiya sonunda açık kalan görevleri seçilen personeller adına otomatik tamamlar.
          Üst lokasyon bazında hedef oran ve personel belirleyerek çalışır.
          Çeklistler dahil, cinsiyet eşleştirmeli, mesai kontrollü.
        </div>
      </div>

      {ustLokasyonlar.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, color: '#6b7280', fontSize: 14 }}>
          Üst lokasyon bulunamadı.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ustLokasyonlar.map(lok => {
            const ayar = getAyar(lok.id)
            const aktif = ayar?.aktif ?? false
            const hedef = ayar?.hedef_oran ?? 80
            const seciliPersoneller = new Set(ayar?.personel_idler ?? [])
            const isSaving = saving === lok.id || saving === ayar?.id
            const panelAcik = acikPanel === lok.id

            return (
              <div key={lok.id} className="verde-card" style={{
                padding: '16px 20px',
                borderLeft: aktif ? '3px solid #22c55e' : '3px solid #e5e7eb',
                background: aktif ? '#f0fdf4' : undefined,
                opacity: isSaving ? 0.7 : 1,
                transition: 'all 0.2s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>
                      {aktif ? '🟢 ' : '⚪ '}{lok.tanim}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                      {aktif ? 'Aktif — Vardiya sonunda otomatik tamamlayacak' : 'Pasif'}
                      {seciliPersoneller.size > 0 && ` · ${seciliPersoneller.size} personel`}
                    </div>
                  </div>

                  {/* Hedef oran */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Hedef:</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={hedef}
                      onChange={e => {
                        const val = Math.min(100, Math.max(1, parseInt(e.target.value) || 80))
                        setAyarlar(prev => {
                          if (ayar) return prev.map(a => a.id === ayar.id ? { ...a, hedef_oran: val } : a)
                          return [...prev, { id: `temp-${lok.id}`, ust_lokasyon_id: lok.id, hedef_oran: val, aktif: false, personel_idler: [] }]
                        })
                      }}
                      onBlur={() => kaydetVeya(lok.id, hedef)}
                      style={{
                        width: 56, height: 32, padding: '0 8px', borderRadius: 6,
                        border: '1px solid #e2e8f0', fontSize: 14, fontWeight: 700,
                        textAlign: 'center', color: '#111827',
                      }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>%</span>
                  </div>

                  {/* Personel seç butonu */}
                  {ayar && !ayar.id.startsWith('temp-') && (
                    <button
                      onClick={() => setAcikPanel(panelAcik ? null : lok.id)}
                      style={{
                        padding: '6px 12px', fontSize: 12, fontWeight: 600, borderRadius: 6,
                        border: '1px solid #e2e8f0', background: panelAcik ? '#f3f4f6' : '#fff',
                        cursor: 'pointer', color: '#374151',
                      }}
                    >
                      👥 Personel ({seciliPersoneller.size})
                    </button>
                  )}

                  {/* AÇ / KAPAT */}
                  <button
                    onClick={() => toggle(lok.id)}
                    disabled={isSaving}
                    style={{
                      padding: '6px 16px', fontSize: 13, fontWeight: 700, borderRadius: 8,
                      border: 'none', cursor: 'pointer',
                      background: aktif ? '#dc2626' : '#22c55e',
                      color: '#fff', minWidth: 80, transition: 'all 0.15s',
                    }}
                  >
                    {aktif ? 'KAPAT' : 'AÇ'}
                  </button>

                  {ayar && !ayar.id.startsWith('temp-') && (
                    <button
                      onClick={() => sil(ayar.id)}
                      disabled={isSaving}
                      style={{
                        padding: '6px 10px', fontSize: 11, borderRadius: 6,
                        border: '1px solid #fca5a5', background: '#fef2f2',
                        cursor: 'pointer', color: '#dc2626', fontWeight: 600,
                      }}
                    >
                      Sil
                    </button>
                  )}
                </div>

                {/* Personel seçim paneli */}
                {panelAcik && ayar && !ayar.id.startsWith('temp-') && (
                  <div style={{ marginTop: 12, padding: '12px 16px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                    {(() => {
                      const lokPersoneller = personelMap.get(lok.id) ?? []
                      return (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Personel Seçimi ({lokPersoneller.length} kişi)</span>
                            <button
                              onClick={async () => {
                                const tumIds = lokPersoneller.map(p => p.id)
                                const hepsiSecili = tumIds.every(id => seciliPersoneller.has(id))
                                const yeniListe = hepsiSecili ? [] : tumIds
                                await personelGuncelle(ayar.id, yeniListe)
                              }}
                              style={{
                                padding: '3px 10px', fontSize: 11, borderRadius: 4,
                                border: '1px solid #e2e8f0', background: '#fff',
                                cursor: 'pointer', color: '#374151', fontWeight: 600,
                              }}
                            >
                              {lokPersoneller.length > 0 && lokPersoneller.every(p => seciliPersoneller.has(p.id)) ? 'Tümünü Kaldır' : 'Tümünü Seç'}
                            </button>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                            {lokPersoneller.map(p => {
                              const secili = seciliPersoneller.has(p.id)
                              return (
                                <label key={p.id} style={{
                                  display: 'flex', alignItems: 'center', gap: 6,
                                  padding: '4px 10px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer',
                                  background: secili ? '#eff6ff' : '#fff',
                                  border: secili ? '1px solid #93c5fd' : '1px solid #e5e7eb',
                                  fontWeight: secili ? 600 : 400,
                                  color: secili ? '#1d4ed8' : '#374151',
                                }}>
                                  <input
                                    type="checkbox"
                                    checked={secili}
                                    onChange={async () => {
                                      const yeniSet = new Set(seciliPersoneller)
                                      if (secili) yeniSet.delete(p.id)
                                      else yeniSet.add(p.id)
                                      await personelGuncelle(ayar.id, [...yeniSet])
                                    }}
                                    style={{ accentColor: '#1d4ed8' }}
                                  />
                                  {p.isim_soyisim}
                                  {p.cinsiyet && (
                                    <span style={{ fontSize: 10, color: '#6b7280' }}>
                                      ({p.cinsiyet === 'E' ? '♂' : '♀'})
                                    </span>
                                  )}
                                </label>
                              )
                            })}
                          </div>
                          {lokPersoneller.length === 0 && (
                            <div style={{ fontSize: 12, color: '#6b7280', padding: 8 }}>Bu üst lokasyona atanmış personel bulunamadı.</div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
