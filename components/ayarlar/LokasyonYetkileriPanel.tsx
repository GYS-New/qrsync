'use client'

import { useEffect, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'

interface Props {
  firmaId: string | null
  lokasyonlar: { id: string; tanim: string; parent_id?: string | null }[]
  kullanicilar: { id: string; isim_soyisim: string }[]
}

export default function LokasyonYetkileriPanel({ firmaId, lokasyonlar, kullanicilar }: Props) {
  const { toast } = useToast()
  const [seciliUser, setSeciliUser] = useState('')
  const [yetkiliLoklar, setYetkiliLoklar] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const ustLokasyonlar = lokasyonlar.filter(l => !l.parent_id).sort((a, b) => a.tanim.localeCompare(b.tanim, 'tr'))

  // Tüm kullanıcı-lokasyon eşleşmeleri (toplu görüntü)
  const [tumEslesmeler, setTumEslesmeler] = useState<Record<string, string[]>>({})

  useEffect(() => {
    if (!firmaId) return
    fetch(`/api/auth/lokasyon-yetkileri?firma_id=${firmaId}`)
      .then(r => r.json())
      .then(j => {
        if (j.ok) {
          const map: Record<string, string[]> = {}
          for (const r of (j.data ?? [])) {
            if (!map[r.user_id]) map[r.user_id] = []
            map[r.user_id].push(r.ust_lokasyon_id)
          }
          setTumEslesmeler(map)
        }
      }).catch(() => {})
  }, [firmaId])

  // Kullanıcı seçildiğinde yetkili lokasyonları yükle
  async function userSecildi(userId: string) {
    setSeciliUser(userId)
    setYetkiliLoklar(new Set())
    if (!userId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/auth/lokasyon-yetkileri?user_id=${userId}&firma_id=${firmaId}`)
      const json = await res.json()
      if (json.ok) setYetkiliLoklar(new Set(json.yetkili_lokasyonlar ?? []))
    } catch {}
    setLoading(false)
  }

  function lokToggle(lokId: string) {
    setYetkiliLoklar(prev => {
      const n = new Set(prev)
      n.has(lokId) ? n.delete(lokId) : n.add(lokId)
      return n
    })
  }

  function tumunuSec() { setYetkiliLoklar(new Set(ustLokasyonlar.map(l => l.id))) }
  function tumunuKaldir() { setYetkiliLoklar(new Set()) }

  async function kaydet() {
    if (!seciliUser || !firmaId) return
    setSaving(true)
    try {
      const res = await fetch('/api/auth/lokasyon-yetkileri', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: seciliUser,
          firma_id: firmaId,
          ust_lokasyon_idler: [...yetkiliLoklar],
        }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error)

      // Toplu eşleşmeleri güncelle
      setTumEslesmeler(prev => {
        const n = { ...prev }
        if (yetkiliLoklar.size === 0) { delete n[seciliUser] }
        else { n[seciliUser] = [...yetkiliLoklar] }
        return n
      })

      toast({ type: 'success', title: 'Kaydedildi', message: yetkiliLoklar.size === 0 ? 'Tüm lokasyonlara erişim açıldı.' : `${yetkiliLoklar.size} üst lokasyon yetkisi kaydedildi.` })
    } catch (e: any) {
      toast({ type: 'error', title: 'Hata', message: e.message })
    }
    setSaving(false)
  }

  const inp: React.CSSProperties = { height: 34, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, background: '#fff' }

  // Kısıtlı kullanıcı sayısı
  const kisitliSayi = Object.keys(tumEslesmeler).length

  return (
    <div style={{ marginTop: 24, borderTop: '2px solid #e5e7eb', paddingTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 4, height: 20, borderRadius: 2, background: '#ef4444' }} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#111827' }}>Lokasyon Erişim Yetkileri</div>
          <div style={{ fontSize: 12.5, color: '#6b7280' }}>U ve M rolleri hangi üst lokasyonların verilerine erişebilir</div>
        </div>
        {kisitliSayi > 0 && (
          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontWeight: 700 }}>
            {kisitliSayi} kısıtlı kullanıcı
          </span>
        )}
      </div>

      {/* Bilgi bandı */}
      <div style={{ padding: '10px 14px', background: '#fafafa', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12.5, color: '#4b5563', marginBottom: 16, lineHeight: 1.6 }}>
        Kullanıcı seçip yetkili üst lokasyonları işaretleyin. <strong>Hiçbir lokasyon seçilmezse</strong> kullanıcı tüm lokasyonlara erişebilir.
        Seçim yapıldığında sadece işaretli üst lokasyonlar ve altındaki veriler görünür olur.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
        {/* Sol: Kullanıcı seçimi */}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' as const, display: 'block', marginBottom: 6 }}>Kullanıcı Seç</label>
          <select value={seciliUser} onChange={e => userSecildi(e.target.value)} style={{ ...inp, width: '100%' }}>
            <option value="">Seçin…</option>
            {kullanicilar.map(u => {
              const kisitli = tumEslesmeler[u.id]
              return (
                <option key={u.id} value={u.id}>
                  {u.isim_soyisim}{kisitli ? ` (${kisitli.length} lokasyon)` : ''}
                </option>
              )
            })}
          </select>

          {seciliUser && (
            <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
              <button onClick={tumunuSec} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', fontWeight: 600, color: '#374151' }}>Tümünü Seç</button>
              <button onClick={tumunuKaldir} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', cursor: 'pointer', fontWeight: 600, color: '#374151' }}>Tümünü Kaldır</button>
            </div>
          )}

          {seciliUser && (
            <button onClick={kaydet} disabled={saving}
              style={{ marginTop: 12, width: '100%', height: 36, borderRadius: 8, border: 'none', background: '#1f2937', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
          )}
        </div>

        {/* Sağ: Üst lokasyonlar checkbox */}
        <div>
          {!seciliUser ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Kullanıcı seçin</div>
          ) : loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#6b7280', fontSize: 14 }}>Yükleniyor...</div>
          ) : (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                  Üst Lokasyonlar ({yetkiliLoklar.size}/{ustLokasyonlar.length})
                </span>
                <span style={{ fontSize: 11, color: yetkiliLoklar.size === 0 ? '#10b981' : '#dc2626', fontWeight: 600 }}>
                  {yetkiliLoklar.size === 0 ? 'Tüm erişim açık' : `${yetkiliLoklar.size} lokasyon seçili`}
                </span>
              </div>
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                {ustLokasyonlar.map(l => {
                  const secili = yetkiliLoklar.has(l.id)
                  return (
                    <label key={l.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
                      background: secili ? '#eff6ff' : '#fff',
                    }}>
                      <input type="checkbox" checked={secili} onChange={() => lokToggle(l.id)} style={{ width: 16, height: 16 }} />
                      <span style={{ fontSize: 13, fontWeight: secili ? 600 : 400, color: secili ? '#1d4ed8' : '#374151' }}>
                        📍 {l.tanim}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
